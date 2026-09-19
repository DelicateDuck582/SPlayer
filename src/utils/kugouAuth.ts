/**
 * 酷狗登录态（Cookie 登录）
 *
 * 与网易云登录（`./auth.ts`：MUSIC_U + 扫码/验证码/Cookie）**并存且互不影响**：
 * - 登录态仅由 `settingStore.kugouCookie`（Cookie 文本）与 `settingStore.kugouUser`（用户信息）承载；
 * - 凭据始终只保存在本机（pinia persist → localStorage），且只在请求体里发给酷狗 API 服务；
 * - 未登录时所有酷狗接口按匿名调用（部分接口会返回 152 / 20028，见 doc/KUGOU-API.md）。
 */
import { useSettingStore } from "@/stores";
import {
  kugouCaptchaSent,
  kugouErrorText,
  kugouLoginByAccount,
  kugouLoginCellphone,
  kugouLoginQrCheck,
  kugouLoginToSession,
  kugouLoginToken,
  kugouQrStatus,
  kugouQrStatusText,
  kugouUserDetail,
  kugouUserToProfile,
  kugouUserVipDetail,
  type KugouLoginSession,
  type KugouUserProfile,
} from "@/api/kugou";

/** 上次登录（或刷新登录）时间的时间戳键（与网易云的 `lastLoginTime` 分开存放） */
export const KUGOU_LOGIN_TIME_KEY = "kugouLastLoginTime";

/** 手机号格式校验（中国大陆 11 位） */
const MOBILE_REG = /^1\d{10}$/;

/** 解析 Cookie 文本（`a=1; b=2` → `{ a: "1", b: "2" }`） */
export const parseKugouCookie = (text: string): Record<string, string> => {
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

/**
 * 规范化 Cookie 文本
 *
 * 处理用户从 DevTools 复制的常见形态：URL 编码、换行、多余空格、缺少结尾分号。
 */
export const normalizeKugouCookie = (text: string): string => {
  let value = String(text ?? "")
    .replace(/[\r\n\t]/g, " ")
    .trim();
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      // 解码失败则按原文处理
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

/** 读取某个 Cookie 字段（如 `token` / `userid` / `vip_type`） */
export const getKugouCookieValue = (key: string): string => {
  try {
    return parseKugouCookie(useSettingStore().kugouCookie ?? "")[key] ?? "";
  } catch {
    return "";
  }
};

/** 是否已登录酷狗（Cookie 中同时存在 `token` 与 `userid`） */
export const isKugouLogin = (): boolean => {
  try {
    return !!(getKugouCookieValue("token") && getKugouCookieValue("userid"));
  } catch {
    return false;
  }
};

/** 当前酷狗用户信息（未登录为 `null`） */
export const getKugouUser = (): KugouUserProfile | null => {
  try {
    return useSettingStore().kugouUser;
  } catch {
    return null;
  }
};

/**
 * 拉取（并缓存）酷狗用户信息，同时校验 Cookie 是否仍然有效
 * @returns 用户信息；未登录或登录态失效时为 `null`
 */
export const refreshKugouUser = async (): Promise<KugouUserProfile | null> => {
  const settingStore = useSettingStore();
  if (!isKugouLogin()) {
    settingStore.kugouUser = null;
    return null;
  }
  try {
    const [detail, vip] = await Promise.all([
      kugouUserDetail(),
      kugouUserVipDetail().catch(() => null),
    ]);
    const profile = Number(detail?.status) === 1 ? kugouUserToProfile(detail) : null;
    if (!profile) {
      // Cookie 已失效：保留 Cookie 文本（用户可能只是网络异常），但清掉用户信息避免误显示
      settingStore.kugouUser = null;
      return null;
    }
    const vipRaw = (vip as any)?.data ?? {};
    settingStore.kugouUser = {
      ...profile,
      vipType: Number(vipRaw?.vip_type ?? vipRaw?.vipType ?? vipRaw?.vip ?? 0) || profile.vipType,
    };
    return settingStore.kugouUser;
  } catch (error) {
    console.warn("获取酷狗用户信息失败：", (error as Error)?.message);
    return null;
  }
};

/**
 * 酷狗 Cookie 登录
 *
 * 流程：规范化 Cookie → 本地暂存 → 请求 `/user/detail` 校验 → 成功则缓存用户信息，失败则回滚。
 * @param cookieText 用户粘贴的 Cookie（需包含 `token` 与 `userid`）
 */
export const loginKugouByCookie = async (
  cookieText: string,
): Promise<{ ok: boolean; message: string }> => {
  const settingStore = useSettingStore();
  const cookie = normalizeKugouCookie(cookieText);
  const parsed = parseKugouCookie(cookie);
  if (!parsed["token"] || !parsed["userid"]) {
    return {
      ok: false,
      message:
        "Cookie 中缺少 token 或 userid，请在酷狗网页端 DevTools → Application → Cookies 中复制",
    };
  }

  const previousCookie = settingStore.kugouCookie;
  const previousUser = settingStore.kugouUser;
  settingStore.kugouCookie = cookie;
  try {
    const detail = await kugouUserDetail();
    const profile = Number(detail?.status) === 1 ? kugouUserToProfile(detail) : null;
    if (!profile) {
      settingStore.kugouCookie = previousCookie;
      settingStore.kugouUser = previousUser;
      return {
        ok: false,
        message: kugouErrorText(detail) || "酷狗登录失败，请检查 Cookie 是否有效",
      };
    }
    settingStore.kugouUser = profile;
    // VIP / 等级信息（可选，失败不影响登录）
    const vip = await kugouUserVipDetail().catch(() => null);
    const vipRaw = (vip as any)?.data ?? {};
    const vipType =
      Number(vipRaw?.vip_type ?? vipRaw?.vipType ?? vipRaw?.vip ?? 0) || profile.vipType;
    if (vipType) settingStore.kugouUser = { ...profile, vipType };
    return { ok: true, message: `酷狗登录成功：${profile.nickname || profile.userid}` };
  } catch (error) {
    settingStore.kugouCookie = previousCookie;
    settingStore.kugouUser = previousUser;
    return { ok: false, message: `酷狗登录失败：${(error as Error)?.message || "网络错误"}` };
  }
};

/** 退出酷狗登录（清理 Cookie 与用户信息，不影响网易云登录态） */
export const kugouLogout = (): void => {
  const settingStore = useSettingStore();
  settingStore.kugouCookie = "";
  settingStore.kugouUser = null;
  try {
    localStorage.removeItem(KUGOU_LOGIN_TIME_KEY);
  } catch {
    // localStorage 不可用时忽略
  }
  window.$message.success("已退出酷狗登录");
};

/* ------------------------------------------------------------------ 多方式登录 */

/** 上次登录（或刷新登录）时间戳；未登录过为 0 */
export const getKugouLastLoginTime = (): number => {
  try {
    return Number(localStorage.getItem(KUGOU_LOGIN_TIME_KEY) || 0) || 0;
  } catch {
    return 0;
  }
};

/**
 * 保存登录会话（**先校验后保存**，失败回滚）
 *
 * @param session 登录接口返回的会话（token / userid / cookie）
 */
export const saveKugouSession = async (
  session: KugouLoginSession,
): Promise<{ ok: boolean; message: string }> => {
  const settingStore = useSettingStore();
  const previousCookie = settingStore.kugouCookie;
  const previousUser = settingStore.kugouUser;
  settingStore.kugouCookie = session.cookie;
  settingStore.kugouUser = session.nickname
    ? {
        userid: session.userid,
        nickname: session.nickname,
        avatar: session.avatar ?? "",
        vipType: session.vipType ?? 0,
        level: 0,
      }
    : null;
  const user = await refreshKugouUser();
  if (!user) {
    settingStore.kugouCookie = previousCookie;
    settingStore.kugouUser = previousUser;
    return { ok: false, message: "酷狗登录校验失败（凭证无效），请重试或改用 Cookie 登录" };
  }
  try {
    localStorage.setItem(KUGOU_LOGIN_TIME_KEY, Date.now().toString());
  } catch {
    // localStorage 不可用时忽略（下次启动的自动刷新将不触发）
  }
  return { ok: true, message: `酷狗登录成功：${user.nickname || user.userid}` };
};

/** 发送手机验证码（登录用） */
export const sendKugouCaptcha = async (
  mobile: string,
): Promise<{ ok: boolean; message: string }> => {
  if (!MOBILE_REG.test(String(mobile ?? "").trim())) {
    return { ok: false, message: "请输入 11 位手机号" };
  }
  const body = await kugouCaptchaSent(String(mobile).trim());
  const ok = Number(body?.status) === 1 || Number(body?.errcode) === 0;
  return ok
    ? { ok: true, message: "验证码已发送，请注意查收" }
    : { ok: false, message: kugouErrorText(body) || "验证码发送失败，请稍后重试" };
};

/** 手机验证码登录 */
export const loginKugouByCellphone = async (
  mobile: string,
  code: string,
): Promise<{ ok: boolean; message: string }> => {
  const phone = String(mobile ?? "").trim();
  const verifyCode = String(code ?? "").trim();
  if (!MOBILE_REG.test(phone)) return { ok: false, message: "请输入 11 位手机号" };
  if (!verifyCode) return { ok: false, message: "请输入验证码" };
  const body = await kugouLoginCellphone(phone, verifyCode);
  const session = kugouLoginToSession(body, useSettingStore().kugouCookie);
  if (!session) {
    return { ok: false, message: kugouErrorText(body) || "酷狗登录失败：手机号或验证码不正确" };
  }
  return saveKugouSession(session);
};

/** 账号密码登录 */
export const loginKugouByAccount = async (
  username: string,
  password: string,
): Promise<{ ok: boolean; message: string }> => {
  const account = String(username ?? "").trim();
  if (!account || !password) return { ok: false, message: "请输入账号与密码" };
  const body = await kugouLoginByAccount(account, password);
  const session = kugouLoginToSession(body, useSettingStore().kugouCookie);
  if (!session) {
    return { ok: false, message: kugouErrorText(body) || "酷狗登录失败：账号或密码不正确" };
  }
  return saveKugouSession(session);
};

/**
 * 检查扫码状态，成功则直接完成登录
 * @param key `/login/qr/key` 返回的二维码 key
 */
export const checkKugouQrLogin = async (
  key: string,
): Promise<{ status: number; ok: boolean; message: string }> => {
  const body = await kugouLoginQrCheck(key);
  const status = kugouQrStatus(body);
  if (status !== 4) return { status, ok: false, message: kugouQrStatusText(status) };
  const session = kugouLoginToSession(body, useSettingStore().kugouCookie);
  if (!session) {
    return { status, ok: false, message: "扫码成功但未取得登录凭据，请改用 Cookie 登录" };
  }
  const result = await saveKugouSession(session);
  return { status, ...result };
};

/**
 * 刷新登录（对应网易云的 `refreshLogin`）
 *
 * 用现有 `token` / `userid` 请求 `/login/token` 换取新令牌并写回 Cookie。
 */
export const refreshKugouLogin = async (): Promise<{ ok: boolean; message: string }> => {
  if (!isKugouLogin()) return { ok: false, message: "未登录酷狗，无需刷新" };
  const body = await kugouLoginToken();
  const session = kugouLoginToSession(body, useSettingStore().kugouCookie);
  if (!session)
    return { ok: false, message: kugouErrorText(body) || "刷新酷狗登录失败，请重新登录" };
  const result = await saveKugouSession(session);
  return result.ok ? { ok: true, message: "酷狗登录已刷新" } : result;
};

/**
 * 按需刷新登录（默认超过 3 天未刷新时执行一次）
 * @param maxAgeDays 最大未刷新天数
 */
export const refreshKugouLoginIfNeeded = async (
  maxAgeDays = 3,
): Promise<{ ok: boolean; message: string } | null> => {
  const last = getKugouLastLoginTime();
  if (!isKugouLogin() || !last) return null;
  if (Date.now() - last < maxAgeDays * 24 * 60 * 60 * 1000) return null;
  return refreshKugouLogin();
};
