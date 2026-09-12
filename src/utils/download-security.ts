/**
 * 下载安全相关纯函数（无第三方依赖，可同时被渲染层与自检脚本使用）
 * - 地址安全：协议白名单 + 内网/回环地址拦截（含 IPv4-mapped IPv6）
 * - 文件安全：文件名净化、扩展名白名单
 */

/** 允许下载的协议白名单（阻止 data: / blob: / file: 等异常协议） */
export const ALLOWED_DOWNLOAD_PROTOCOLS = new Set(["http:", "https:"]);

/** 允许落盘的音频扩展名白名单（避免被诱导保存 .html 等可执行文件） */
export const ALLOWED_AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "mp4",
  "aac",
  "wav",
  "ogg",
  "opus",
  "ape",
  "wma",
  "dsf",
  "dff",
  "aiff",
]);

/**
 * 非法文件名字符（Windows 不允许的字符 + 控制字符）
 * - `\p{Cc}`（Unicode 属性转义）覆盖 C0/C1 控制字符：U+0000–U+001F、U+007F–U+009F
 * - 使用属性转义而非 `\u0000-\u001f` 字面范围，可在保留同等（且更完整）清理效果的同时通过 `no-control-regex` 校验
 */
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;
/** 文件名最大长度 */
const MAX_FILENAME_LENGTH = 120;

/**
 * 判断点分十进制 IPv4 是否属于回环/内网/保留网段
 * @param address IPv4 字面量（如 127.0.0.1）
 * @returns 是否为内网/保留地址
 */
export const isPrivateIPv4 = (address: string): boolean => {
  const m = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => n > 255)) return true; // 非法数值一律按不可信处理
  if (a === 0 || a === 10 || a === 127) return true; // 本网络 / 私有 / 回环
  if (a === 169 && b === 254) return true; // 链路本地（含 169.254.169.254 云元数据）
  if (a === 172 && b >= 16 && b <= 31) return true; // 私有 172.16/12
  if (a === 192 && b === 168) return true; // 私有 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24、192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 基准测试 198.18/15
  if (a === 198 && b === 51) return true; // 文档用 198.51.100/24
  if (a === 203 && b === 0) return true; // 文档用 203.0.113/24
  if (a >= 224) return true; // 组播 / 保留（含 255.255.255.255）
  return false;
};

/**
 * 从 IPv6 字面量中提取内嵌的 IPv4 地址
 * - 覆盖 IPv4-mapped（`::ffff:127.0.0.1` / `::ffff:7f00:1`）与 IPv4-compatible（`::127.0.0.1`）
 * - 这类地址若不做还原，`http://[::ffff:127.0.0.1]/` 会绕过内网拦截
 * @param host 已归一化（小写、去中括号）的主机名
 * @returns 内嵌的 IPv4 字面量，无则返回 null
 */
export const extractMappedIPv4 = (host: string): string | null => {
  // 尾部直接是点分十进制：::ffff:127.0.0.1 / ::127.0.0.1
  const dotted = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted && host.includes(":")) return dotted[1];
  // 十六进制写法：::ffff:7f00:1
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
};

/**
 * 判断主机名是否指向本机/内网/保留地址
 * @param hostname 主机名
 * @returns 是否为内网地址
 */
export const isPrivateHost = (hostname: string): boolean => {
  let host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // 去掉 IPv6 zone id（如 fe80::1%eth0）
  const zoneIndex = host.indexOf("%");
  if (zoneIndex !== -1) host = host.slice(0, zoneIndex);
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;

  // IPv4 字面量（含 IPv6 内嵌 IPv4）
  if (isPrivateIPv4(host)) return true;
  const mapped = extractMappedIPv4(host);
  if (mapped && isPrivateIPv4(mapped)) return true;

  // 非 IPv6 字面量（普通域名）到此结束
  if (!host.includes(":")) return false;

  // IPv6：回环、未指定、链路本地、唯一本地地址
  if (host === "::1" || host === "::" || /^(0{1,4}:){7}0{0,3}1$/.test(host)) return true;
  if (host.startsWith("fe80:")) return true; // 链路本地 fe80::/10
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true; // ULA fc00::/7（精确前缀，避免误伤 fcmail.com 等域名）
  return false;
};

/**
 * 校验下载地址是否安全
 * @param url 下载地址
 * @param strict 是否额外拦截内网地址（用于第三方解锁源等不受信任来源）
 */
export const assertSafeDownloadUrl = (url: string, strict = false): void => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("下载地址无效，已阻止下载");
  }
  if (!ALLOWED_DOWNLOAD_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`不支持的下载协议，已阻止下载：${parsed.protocol}`);
  }
  if (strict && isPrivateHost(parsed.hostname)) {
    throw new Error("下载地址指向内网地址，已阻止下载");
  }
};

/**
 * 清理文件名中的非法字符
 * @param name 原始名称
 * @returns 安全的文件名
 */
export const sanitizeFileName = (name: string): string => {
  const cleaned = String(name ?? "")
    .replace(ILLEGAL_FILENAME_CHARS, "&")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, ""); // Windows 不允许以点或空格结尾
  const safe = cleaned || "未知歌曲";
  return safe.length > MAX_FILENAME_LENGTH ? safe.slice(0, MAX_FILENAME_LENGTH).trim() : safe;
};

/**
 * 清理文件扩展名（仅保留字母数字）
 * @param type 原始扩展名
 * @returns 安全的扩展名
 */
export const sanitizeFileType = (type: string): string => {
  const cleaned = String(type ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  return cleaned || "mp3";
};
