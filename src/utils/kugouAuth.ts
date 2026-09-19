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
  kugouErrorText,
  kugouUserDetail,
  kugouUserToProfile,
  kugouUserVipDetail,
  type KugouUserProfile,
} from "@/api/kugou";

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
  window.$message.success("已退出酷狗登录");
};
