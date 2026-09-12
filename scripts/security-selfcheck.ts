/**
 * 安全加固自检脚本（零依赖，无需安装测试框架）
 *
 * 运行：npx tsx scripts/security-selfcheck.ts
 * 覆盖：下载地址安全（协议白名单 / 内网与保留地址拦截 / IPv4-mapped IPv6 绕过）、
 *      文件名清理与扩展名白名单
 *
 * 退出码：0 全部通过；1 存在失败用例
 */
import {
  ALLOWED_AUDIO_EXTENSIONS,
  assertSafeDownloadUrl,
  isPrivateHost,
  sanitizeFileName,
  sanitizeFileType,
} from "../src/utils/download-security";

let passed = 0;
const failures: string[] = [];

/** 断言 */
const check = (name: string, cond: boolean): void => {
  if (cond) {
    passed += 1;
    console.log(`  \u2705 ${name}`);
  } else {
    failures.push(name);
    console.log(`  \u274c ${name}`);
  }
};

/** 断言「应被拦截」 */
const expectBlocked = (name: string, url: string, strict = true): void => {
  let blocked = false;
  try {
    assertSafeDownloadUrl(url, strict);
  } catch {
    blocked = true;
  }
  check(`拦截：${name}`, blocked);
};

/** 断言「应被放行」 */
const expectAllowed = (name: string, url: string, strict = true): void => {
  let ok = true;
  try {
    assertSafeDownloadUrl(url, strict);
  } catch {
    ok = false;
  }
  check(`放行：${name}`, ok);
};

console.log("\n[1/4] 下载协议白名单");
expectBlocked("data: 伪协议", "data:text/html;base64,PHNjcmlwdD4=");
expectBlocked("blob: 伪协议", "blob:https://example.com/xxx");
expectBlocked("file: 本地文件", "file:///C:/Windows/win.ini");
expectBlocked("javascript: 伪协议", "javascript:alert(1)");
expectBlocked("ftp: 非 http(s)", "ftp://example.com/a.mp3");
expectBlocked("非法地址", "not-a-url");
expectAllowed("https 音频", "https://m702.music.126.net/a.mp3?vuutv=x");
expectAllowed("http 音频（升级前）", "http://m702.music.126.net/a.mp3");

console.log("\n[2/4] 内网 / 保留地址拦截（strict）");
expectBlocked("回环 IPv4", "http://127.0.0.1:8080/a.mp3");
expectBlocked("localhost", "http://localhost/a.mp3");
expectBlocked("IPv6 回环", "http://[::1]/a.mp3");
expectBlocked("私有 10/8", "http://10.0.0.5/a.mp3");
expectBlocked("私有 172.16/12", "http://172.16.1.1/a.mp3");
expectBlocked("私有 192.168/16", "http://192.168.1.1/a.mp3");
expectBlocked("链路本地 / 云元数据", "http://169.254.169.254/latest/meta-data/");
expectBlocked("CGNAT 100.64/10", "http://100.64.0.1/a.mp3");
expectBlocked("未指定地址 0.0.0.0", "http://0.0.0.0/a.mp3");
expectBlocked("IPv4-mapped IPv6（点分）", "http://[::ffff:127.0.0.1]/a.mp3");
expectBlocked("IPv4-mapped IPv6（十六进制）", "http://[::ffff:7f00:1]/a.mp3");
expectBlocked("IPv4-mapped 云元数据", "http://[::ffff:169.254.169.254]/a.mp3");
expectBlocked("IPv6 ULA fd00::/8", "http://[fd00::1]/a.mp3");
expectBlocked("IPv6 链路本地 fe80::", "http://[fe80::1]/a.mp3");
expectBlocked("带 zone id 的链路本地", "http://[fe80::1%25eth0]/a.mp3");
expectAllowed("公网 https 音频", "https://m804.music.126.net/a.flac");
expectAllowed("公网域名（ULA 前缀误伤修复）", "https://fcmail.com/a.mp3");
expectAllowed("公网域名（fd 前缀）", "https://fd-cdn.example.com/a.mp3");

console.log("\n[3/4] 主机名判定（isPrivateHost）");
check("localhost = true", isPrivateHost("localhost") === true);
check("127.0.0.1 = true", isPrivateHost("127.0.0.1") === true);
check("::ffff:169.254.169.254 = true", isPrivateHost("::ffff:169.254.169.254") === true);
check("192.168.0.1 = true", isPrivateHost("192.168.0.1") === true);
check("m702.music.126.net = false", isPrivateHost("m702.music.126.net") === false);
check("fcmail.com = false", isPrivateHost("fcmail.com") === false);
check("空主机名 = true", isPrivateHost("") === true);

console.log("\n[4/4] 文件名与扩展名净化");
const dangerousName = sanitizeFileName('a/b\\c:d*e?f"g<h>i|j');
check(
  "文件名不含路径分隔符",
  !dangerousName.includes("/") && !dangerousName.includes("\\"),
);
check("文件名不含非法字符", !/[\\/:*?"<>|]/.test(dangerousName));
check("文件名结尾无点/空格", !/[.\s]+$/.test(dangerousName));
check("超长文件名被截断", sanitizeFileName("x".repeat(300)).length <= 120);
check("空白文件名回退", sanitizeFileName("   ").length > 0);
check("扩展名小写化", sanitizeFileType("MP3") === "mp3");
check("扩展名去非法字符", sanitizeFileType("../../exe") === "exe");
check("空扩展名回退 mp3", sanitizeFileType("") === "mp3");
check("音频白名单不含 exe", !ALLOWED_AUDIO_EXTENSIONS.has("exe"));
check("音频白名单包含 flac", ALLOWED_AUDIO_EXTENSIONS.has("flac"));

console.log(`\n结果：通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length > 0) {
  console.log("失败用例：");
  failures.forEach((name) => console.log(`  - ${name}`));
  process.exitCode = 1;
} else {
  console.log("✅ 全部通过");
}
