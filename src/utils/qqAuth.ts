/**
 * QQ 音乐登录态（Cookie / 扫码登录）
 *
 * 与网易云登录（`./auth.ts`）、酷狗登录（`./kugouAuth.ts`）**并存且互不影响**：
 * - 登录态由 `settingStore.qqCookie`（Cookie 文本）与 `settingStore.qqUser`（用户信息）承载；
 * - 凭据只保存在本机（pinia persist → localStorage），且通过 **`X-Custom-Cookie` 请求头**发送，
 *   不进 URL / 浏览器历史 / 访问日志；
 * - 未登录时接口按匿名调用：搜索 / 歌词 / 榜单可用，**播放直链与用户数据需要登录态**。
 */
import { useSettingStore } from "@/stores";
import {
  qqCheckLoginQr,
  qqLoginToSession,
  qqQrStatus,
  qqQrStatusText,
  qqUserDetail,
  qqUserToProfile,
  type QqLoginSession,
  type QqUserProfile,
} from "@/api/qq";

/** 上次登录（或刷新）时间戳键（与网易云、酷狗分开存放） */
export const QQ_LOGIN_TIME_KEY = "qqLastLoginTime";

/** 解析 Cookie 文本（`a=1; b=2` → `{ a: "1", b: "2" }`） */
export const parseQqCookie = (text: string): Record<string, string> => {
  const result: Record<string, string> = {};
  String(text ?? "")
    .split(";")
    .forEach((item) => {
      const index = item.indexOf("=");
      if (index <= 0) return;
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      if (key) result[key] = value;
    });
  return result;
};

/** 规范化 Cookie 文本（去换行 / 多余空格、URL 解码、补结尾分号） */
export const normalizeQqCookie = (text: string): string => {
  let value = String(text ?? "")
    .replace(/[\r\n\t]/g, " ")
    .trim();
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // 解码失败按原文处理
    }
  }
  value = value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .join("; ");
  if (value && !value.endsWith(";")) value += ";";
  return value;
};

/** 读取 Cookie 字段（`uin` / `qqmusic_key` / `qm_keyst`） */
export const getQqCookieValue = (key: string): string => {
  try {
    return parseQqCookie(useSettingStore().qqCookie ?? "")[key] ?? "";
  } catch {
    return "";
  }
};

/** 是否已登录 QQ 音乐（Cookie 中同时存在 `uin` 与登录密钥） */
export const isQqLogin = (): boolean => {
  try {
    const cookie = parseQqCookie(useSettingStore().qqCookie ?? "");
    return !!(cookie["uin"] && (cookie["qqmusic_key"] || cookie["qm_keyst"]));
  } catch {
    return false;
  }
};

/** 当前 QQ 音乐用户信息（未登录为 `null`） */
export const getQqUser = (): QqUserProfile | null => {
  try {
    return useSettingStore().qqUser;
  } catch {
    return null;
  }
};

/** 上次登录时间戳；未登录过为 0 */
export const getQqLastLoginTime = (): number => {
  try {
    return Number(localStorage.getItem(QQ_LOGIN_TIME_KEY) || 0) || 0;
  } catch {
    return 0;
  }
};

/**
 * 拉取（并缓存）QQ 音乐用户信息，同时校验 Cookie 是否仍然有效
 * @returns 用户信息；未登录或失效时为 `null`
 */
export const refreshQqUser = async (): Promise<QqUserProfile | null> => {
  const settingStore = useSettingStore();
  if (!isQqLogin()) {
    settingStore.qqUser = null;
    return null;
  }
  try {
    const body = await qqUserDetail();
    const profile = qqUserToProfile(body);
    if (!profile) {
      settingStore.qqUser = null;
      return null;
    }
    // 用 Cookie 里的 uin 兜底（上游详情接口偶尔不返回 uin）
    settingStore.qqUser = { ...profile, uin: profile.uin || getQqCookieValue("uin") };
    return settingStore.qqUser;
  } catch (error) {
    console.warn("获取 QQ 音乐用户信息失败：", (error as Error)?.message);
    return null;
  }
};

/**
 * 保存登录会话（**先校验后保存**，失败回滚）
 * @param session 登录接口返回的会话（uin + key + cookie）
 */
export const saveQqSession = async (
  session: QqLoginSession,
): Promise<{ ok: boolean; message: string }> => {
  const settingStore = useSettingStore();
  const previousCookie = settingStore.qqCookie;
  const previousUser = settingStore.qqUser;
  settingStore.qqCookie = session.cookie;
  settingStore.qqUser =
    session.nickname || session.avatar
      ? {
          uin: session.uin,
          nickname: session.nickname ?? "",
          avatar: session.avatar ?? "",
          vipType: 0,
        }
      : null;
  const user = await refreshQqUser();
  if (!user) {
    settingStore.qqCookie = previousCookie;
    settingStore.qqUser = previousUser;
    return { ok: false, message: "QQ 音乐登录校验失败（凭证无效），请重试或检查 Cookie" };
  }
  try {
    localStorage.setItem(QQ_LOGIN_TIME_KEY, Date.now().toString());
  } catch {
    // localStorage 不可用时忽略
  }
  return { ok: true, message: `QQ 音乐登录成功：${user.nickname || user.uin}` };
};

/**
 * Cookie 登录
 * @param cookieText 用户粘贴的 Cookie（需包含 `uin` 与 `qqmusic_key`）
 */
export const loginQqByCookie = async (
  cookieText: string,
): Promise<{ ok: boolean; message: string }> => {
  const cookie = normalizeQqCookie(cookieText);
  const parsed = parseQqCookie(cookie);
  if (!parsed["uin"] || !(parsed["qqmusic_key"] || parsed["qm_keyst"])) {
    return {
      ok: false,
      message:
        "Cookie 中缺少 uin 或 qqmusic_key，请在 QQ 音乐网页端 DevTools → Application → Cookies 复制",
    };
  }
  const session = qqLoginToSession({ data: { cookie } }, useSettingStore().qqCookie);
  if (!session) return { ok: false, message: "Cookie 解析失败：请确认包含 uin 与 qqmusic_key" };
  return saveQqSession(session);
};

/**
 * 检查扫码状态，成功则完成登录
 * @param qrsig `/getQQLoginQr` 返回的 qrsig
 */
export const checkQqQrLogin = async (
  qrsig: string,
): Promise<{ status: number; ok: boolean; message: string }> => {
  const body = await qqCheckLoginQr(qrsig);
  const status = qqQrStatus(body);
  const session = qqLoginToSession(body, useSettingStore().qqCookie);
  if (!session) return { status, ok: false, message: qqQrStatusText(status) };
  const result = await saveQqSession(session);
  return { status: 4, ...result };
};

/** 退出 QQ 音乐登录（清理 Cookie、用户信息与登录时间） */
export const qqLogout = (): void => {
  const settingStore = useSettingStore();
  settingStore.qqCookie = "";
  settingStore.qqUser = null;
  try {
    localStorage.removeItem(QQ_LOGIN_TIME_KEY);
  } catch {
    // localStorage 不可用时忽略
  }
  window.$message.success("已退出 QQ 音乐登录");
};

/** 登录态摘要（供设置页与用户区展示） */
export const qqLoginSummary = (): { logged: boolean; text: string } => {
  if (!isQqLogin()) return { logged: false, text: "未登录" };
  const user = getQqUser();
  return { logged: true, text: user?.nickname || user?.uin || getQqCookieValue("uin") };
};
