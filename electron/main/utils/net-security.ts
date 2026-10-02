/**
 * 网络地址安全校验（主进程独立实现，不依赖渲染层代码）
 * - 覆盖回环 / 内网 / 链路本地 / 保留网段，含 IPv4-mapped IPv6
 * - 供下载、缓存等服务在发起请求前做纵深防御校验
 */
import { lookup } from "node:dns/promises";

/** 允许主进程发起下载的协议白名单 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

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
  if (a === 169 && b === 254) return true; // 链路本地（含云元数据地址）
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
 * 覆盖 IPv4-mapped（::ffff:127.0.0.1 / ::ffff:7f00:1）与 IPv4-compatible（::127.0.0.1）
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
 * @param hostname 主机名（域名或 IP 字面量）
 * @returns 是否为内网地址
 */
export const isPrivateHost = (hostname: string): boolean => {
  let host = String(hostname ?? "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  // 去掉 IPv6 zone id（如 fe80::1%eth0）
  const zoneIndex = host.indexOf("%");
  if (zoneIndex !== -1) host = host.slice(0, zoneIndex);
  if (!host) return true;
  // 去掉结尾点（FQDN 形式，如 localhost. / foo.local. 与不带点等价）
  host = host.replace(/\.+$/, "");
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
  // 链路本地 fe80::/10：按首段取值判定，覆盖 fe80-febf（如 feA0::1、feB0::1）
  const firstHextet = parseInt(host.split(":")[0], 16);
  if (!Number.isNaN(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfebf) return true;
  if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true; // ULA fc00::/7（精确前缀，避免误伤域名）
  return false;
};

/**
 * 校验远程地址是否可用于主进程下载
 * @param url 远程地址
 * @returns 不安全时返回原因文案，安全返回 null
 */
export const getUnsafeUrlReason = (url: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(String(url ?? ""));
  } catch {
    return "下载地址无效";
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return `不支持的下载协议：${parsed.protocol}`;
  }
  if (isPrivateHost(parsed.hostname)) {
    return "下载地址指向内网地址，已拒绝下载";
  }
  return null;
};

/**
 * 校验远程地址是否可安全访问（含 DNS 解析）
 * - 先做协议与主机名字面量检查，再解析出全部地址逐一按内网规则判定
 * - 解析失败（域名不存在/DNS 异常）一律按拒绝处理
 * @param url 远程地址
 * @returns 不安全时返回原因文案，安全返回 null
 */
export const isSafeRemoteUrl = async (url: string): Promise<string | null> => {
  const literalReason = getUnsafeUrlReason(url);
  if (literalReason) return literalReason;
  let host: string;
  try {
    host = new URL(String(url)).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "下载地址无效";
  }
  const resolveFailedReason = "下载地址无法解析，已拒绝下载";
  try {
    // 解析出全部地址（A/AAAA），任一命中内网/保留规则即拒绝，防 DNS rebinding
    const records = await lookup(host, { all: true });
    if (records.length === 0) return resolveFailedReason;
    for (const record of records) {
      if (isPrivateHost(record.address)) {
        return "下载地址解析到内网地址，已拒绝下载";
      }
    }
  } catch {
    return resolveFailedReason;
  }
  return null;
};

/**
 * 判断端口是否为合法整数（1024-65535，与设置项范围保持一致）
 * @param port 待校验端口
 * @returns 是否合法
 */
export const isValidPort = (port: unknown): port is number =>
  typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535;
