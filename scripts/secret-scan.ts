/**
 * 密钥 / 凭据扫描（零依赖）
 *
 * 覆盖：
 *  - 工作区：被 Git 跟踪的文件（默认）
 *  - Git 历史：`--history` 时额外列出「引入可疑内容」的提交（需人工复核）
 *
 * 运行：
 *   pnpm security:secret-scan
 *   pnpm security:secret-scan -- --history
 *
 * 退出码：0 未发现疑似泄漏；1 存在疑似泄漏（可接入 CI 卡口）
 *
 * 说明：扫描是「分诊」而非「证明」，命中项仍需人工判断；
 * 白名单只用于排除文档中的占位符/示例值，切勿用白名单掩盖真实凭据。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

interface Rule {
  name: string;
  pattern: RegExp;
}

/** 高置信度规则 */
const RULES: Rule[] = [
  { name: "私钥内容", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS Access Key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "阿里云 AccessKey", pattern: /\bLTAI[0-9A-Za-z]{12,}\b/ },
  { name: "腾讯云 SecretId", pattern: /\bAKID[A-Za-z0-9]{16,}\b/ },
  { name: "GitHub Token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Slack Token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "npm Token", pattern: /_authToken\s*=\s*\S{10,}/ },
  { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "网易云登录凭据（Cookie）",
    pattern: /(?:MUSIC_U|MUSIC_A|__csrf|NMTID)(?:%3D|=)[A-Za-z0-9%+/=_.-]{24,}/,
  },
  { name: "Bearer Token", pattern: /Bearer\s+[A-Za-z0-9._-]{30,}/ },
  {
    name: "Webhook 地址",
    pattern: /https:\/\/(?:hooks\.slack\.com|discord(?:app)?\.com\/api\/webhooks)\/\S{20,}/,
  },
  {
    name: "密钥/口令赋值",
    pattern:
      /(?:secret|password|passwd|api[_-]?key|apikey|access[_-]?token|session[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/i,
  },
];

/** 白名单：占位符 / 示例 / 测试值 */
const ALLOWLIST: RegExp[] = [
  /x{8,}/i,
  /%3Bx+%3B/i,
  /your[-_]/i,
  /<[^>]+>/,
  /replace|placeholder/i,
  /example|sample|dummy/i,
  /fake|preview|e2e/i,
  /1234567890abcdef/i,
];

/**
 * 将 JS 正则源码转换为 POSIX ERE（`git -G` 使用）
 * - 非捕获组 `(?:…)` → `(…)`
 * - `\b` 词边界 → 移除（ERE 不支持）
 * - `\s` / `\S` → `[[:space:]]` / `[^[:space:]]`
 * @param source JS 正则源码
 * @returns ERE 等价表达式
 */
const toExtendedRegex = (source: string): string =>
  source
    .replace(/\(\?:/g, "(")
    .replace(/\\b/g, "")
    .replace(/\\s/g, "[[:space:]]")
    .replace(/\\S/g, "[^[:space:]]");

/**
 * 扫描 Git 历史：列出「引入可疑内容」的提交（需人工复核）
 * 使用 `git log -G` 单次遍历全部历史，避免逐规则重复扫描
 */
const scanHistory = (): string[] => {
  const pattern = RULES.map((rule) => toExtendedRegex(rule.pattern.source)).join("|");
  try {
    const output = execFileSync(
      "git",
      ["log", "--all", "--format=%h|%ad|%s", "--date=short", "-G", pattern],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return output.split(/\r?\n/).filter(Boolean);
  } catch (error) {
    return [`扫描失败：${error instanceof Error ? error.message : String(error)}`];
  }
};

/** 跳过的二进制/大文件扩展名 */
const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".icns",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".node",
  ".zip",
  ".gz",
  ".mp3",
  ".flac",
  ".wasm",
  ".pdf",
]);

/** 单文件扫描上限（1MB） */
const MAX_FILE_SIZE = 1024 * 1024;

/** 命中片段脱敏（保留少量前缀便于定位，其余以 *** 代替） */
const mask = (value: string): string =>
  value.length <= 10 ? "***" : `${value.slice(0, 6)}***${value.slice(-2)}`;

interface Finding {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

const findings: Finding[] = [];
let scanned = 0;

/**
 * 扫描文本内容
 * @param file 文件路径（用于报告）
 * @param content 文本内容
 */
const scanContent = (file: string, content: string) => {
  const lines = content.split(/\r?\n/);
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    if (ALLOWLIST.some((allow) => allow.test(raw))) return;
    for (const rule of RULES) {
      const matched = raw.match(rule.pattern);
      if (!matched) continue;
      findings.push({
        file,
        line: index + 1,
        rule: rule.name,
        snippet: raw.trim().slice(0, 60).replace(matched[0], mask(matched[0])),
      });
      break;
    }
  });
};

/**
 * 扫描被 Git 跟踪的文件
 */
const scanTrackedFiles = () => {
  const buffer = execFileSync("git", ["ls-files", "-z"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = buffer.toString("utf8").split("\0").filter(Boolean);
  for (const file of files) {
    const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) continue;
    try {
      if (statSync(file).size > MAX_FILE_SIZE) continue;
      scanContent(file, readFileSync(file, "utf8"));
      scanned += 1;
    } catch {
      // 无法读取（权限/符号链接损坏）→ 跳过
    }
  }
};

const withHistory = process.argv.includes("--history");

console.log("\n[密钥审计] 扫描被跟踪文件…");
scanTrackedFiles();

console.log(`[密钥审计] 已扫描 ${scanned} 个文本文件，命中 ${findings.length} 处`);

if (findings.length > 0) {
  console.log("\n疑似泄漏（请人工确认后移除并轮换凭据）：");
  for (const item of findings) {
    console.log(`  ✖ [${item.rule}] ${item.file}:${item.line}`);
    console.log(`      ${item.snippet}`);
  }
}

if (withHistory) {
  console.log("\n[密钥审计] 扫描 Git 历史（命中提交需人工复核）…");
  const commits = scanHistory();
  if (commits.length === 0) {
    console.log("  ✅ 历史中未发现可疑提交");
  } else {
    console.log(`  ⚠ 命中 ${commits.length} 个提交：`);
    commits.slice(0, 30).forEach((commit) => console.log(`      ${commit}`));
    if (commits.length > 30) console.log(`      … 其余 ${commits.length - 30} 个省略`);
  }
}

if (findings.length === 0) {
  console.log("\n✅ 未发现疑似密钥泄漏");
  process.exitCode = 0;
} else {
  process.exitCode = 1;
}
