/**
 * QQ 音乐 API 客户端与端点封装
 *
 * 上游服务：qq-music-api（https://github.com/DelicateDuck582/qq-music-api ）
 * 部署与验证见 doc/QQ-API.md；`./core` 为纯逻辑（映射 / 注册表 / 会话解析）。
 *
 * 设计要点：
 * - **独立 axios 实例**：不经过 `@/utils/request`，避免把网易云登录态与 realIP / 代理参数带给第三方；
 * - **Cookie 走请求头**：上游支持 `X-Custom-Cookie`，浏览器可安全设置该自定义头（不是禁头），
 *   因此 QQ Cookie 不进 URL / 浏览器历史 / 访问日志；
 * - **参数走 query**：上游控制器读取 `ctx.query`，POST 接口同样使用 query 传参；
 * - **备用地址兜底**：自定义域 DNS 未生效时自动重试 Vercel 项目域名（与酷狗源同策略）。
 */
import axios, { type AxiosInstance } from "axios";
import { useSettingStore } from "@/stores";
import {
  QQ_QUALITY_BY_LEVEL,
  emptyQqSearchResult,
  mapQqSearchBody,
  pickQqPlayError,
  pickQqPlayUrl,
  qqErrorText,
  qqLyricText,
  resolveQqSong,
  type QqResponse,
} from "./core";

export * from "./core";

/** 构建时默认的 QQ 音乐 API 地址（可用 `VITE_QQ_API_URL` 覆盖） */
export const DEFAULT_QQ_API_BASE: string = String(
  (import.meta as any).env?.["VITE_QQ_API_URL"] || "https://qq-api.duckgame-play.top",
).replace(/\/+$/, "");

/** 备用地址（Vercel 项目域名）：自定义域不可用时自动兜底 */
export const QQ_API_FALLBACK_BASE: string = String(
  (import.meta as any).env?.["VITE_QQ_API_FALLBACK_URL"] ||
    "https://qq-music-api-ten-pi.vercel.app",
).replace(/\/+$/, "");

/** 是否已提示过「已切换备用地址」 */
let fallbackNotified = false;

/** 网络层失败判定（无响应：DNS 失败 / 连接被关闭等） */
const isNetworkFailure = (error: unknown): boolean => !(error as any)?.response;

/** 规范化 QQ API 地址 */
export const normalizeQqApiBase = (url: unknown): string =>
  String(url ?? "")
    .trim()
    .replace(/\/+$/, "");

/** 当前生效的 QQ API 地址 */
export const getQqApiBase = (): string => {
  try {
    return normalizeQqApiBase(useSettingStore().qqApiBase) || DEFAULT_QQ_API_BASE;
  } catch {
    return DEFAULT_QQ_API_BASE;
  }
};

/** 当前是否处于「QQ 音乐」源 */
export const isQqSource = (): boolean => {
  try {
    return useSettingStore().musicSource === "qq";
  } catch {
    return false;
  }
};

/** 独立 axios 实例（QQ API 返回 `Access-Control-Allow-Origin: *`，不可开启 withCredentials） */
const qqServer: AxiosInstance = axios.create({
  timeout: 15000,
  withCredentials: false,
});

/**
 * 调用 QQ 音乐 API
 *
 * @param path 路由路径（如 `/getSearchByKey`）
 * @param params 查询参数（Cookie 不进 URL，见下）
 * @param options.method 需要 POST 的接口（参数仍走 query，与上游控制器一致）
 */
export const qqApi = async <T = any>(
  path: string,
  params: Record<string, unknown> = {},
  options: { method?: "get" | "post" } = {},
): Promise<QqResponse<T>> => {
  let cookie = "";
  try {
    cookie = String(useSettingStore().qqCookie ?? "").trim();
  } catch {
    cookie = "";
  }
  // 过滤空值，避免上游把空串当有效参数
  const query: Record<string, unknown> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query[key] = value;
  });
  const headers = cookie ? { "X-Custom-Cookie": cookie } : undefined;
  const method = options.method ?? "get";
  const request = async (baseURL: string): Promise<QqResponse<T>> => {
    const { data } = await qqServer.request({
      baseURL,
      url: path,
      method,
      params: query,
      headers,
    });
    return data as QqResponse<T>;
  };

  const base = getQqApiBase();
  try {
    return await request(base);
  } catch (error) {
    if (!isNetworkFailure(error) || base === QQ_API_FALLBACK_BASE) throw error;
    const result = await request(QQ_API_FALLBACK_BASE);
    if (!fallbackNotified) {
      fallbackNotified = true;
      if (typeof window !== "undefined" && window.$message) {
        window.$message.warning(
          `QQ 音乐 API 主地址不可用，已临时使用备用地址 ${QQ_API_FALLBACK_BASE}（请检查自定义域 DNS 记录）`,
          { duration: 5000 },
        );
      }
    }
    return result;
  }
};

/**
 * 探测 QQ 音乐 API 可用性（匿名请求热搜）
 * @param base 待测地址；留空则测当前生效地址
 */
export const testQqApiBase = async (base?: string): Promise<{ ok: boolean; message: string }> => {
  const target = normalizeQqApiBase(base) || getQqApiBase();
  const probe = async (url: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const { data } = await qqServer.get("/getHotkey", { baseURL: url, timeout: 10000 });
      const body = data as QqResponse;
      const ok = Number(body?.response?.code ?? body?.code ?? -1) === 0;
      return ok
        ? { ok: true, message: `连接成功：${url}` }
        : { ok: false, message: `接口返回异常（${qqErrorText(body) || "未知"}）：${url}` };
    } catch (error) {
      return {
        ok: false,
        message: `连接失败：${(error as Error)?.message || "未知错误"}（${url}）`,
      };
    }
  };

  const primary = await probe(target);
  if (primary.ok || target === QQ_API_FALLBACK_BASE) return primary;
  const fallback = await probe(QQ_API_FALLBACK_BASE);
  if (fallback.ok) {
    return {
      ok: true,
      message: `主地址不可用（${primary.message}）；已可用备用地址：${QQ_API_FALLBACK_BASE}，请检查自定义域 DNS`,
    };
  }
  return primary;
};

/* ------------------------------------------------------------------ 原始端点 */

/** 热搜关键词 */
export const qqHotKey = () => qqApi("/getHotkey");

/** 搜索（`remoteplace`：song / singer / album / mv / playlist） */
export const qqSearchByKey = (
  key: string,
  options: { page?: number; limit?: number; remoteplace?: string } = {},
) =>
  qqApi("/getSearchByKey", {
    key,
    page: options.page ?? 1,
    limit: options.limit ?? 30,
    remoteplace: options.remoteplace ?? "song",
  });

/** 歌曲详情（按 songmid） */
export const qqSongInfo = (songmid: string) => qqApi("/getSongInfo", { songmid });

/** 播放地址（`quality`：m4a / 128 / 320 / ape / flac；需要登录态） */
export const qqMusicPlay = (songmid: string, quality = "320") =>
  qqApi("/getMusicPlay", { songmid, quality });

/** 歌词（`isFormat=true` 返回 LRC 文本） */
export const qqLyricRaw = (songmid: string, isFormat = true) =>
  qqApi("/getLyric", { songmid, isFormat });

/** 歌单广场（分类歌单列表） */
export const qqSongLists = (
  options: { page?: number; limit?: number; categoryId?: number; sortId?: number } = {},
) =>
  qqApi("/getSongLists", {
    page: options.page ?? 1,
    limit: options.limit ?? 30,
    categoryId: options.categoryId ?? 10000000,
    sortId: options.sortId ?? 5,
  });

/** 歌单详情（含歌曲列表） */
export const qqSongListDetail = (disstid: number | string) =>
  qqApi("/getSongListDetail", { disstid });

/** 歌手热门歌曲 */
export const qqSingerHotsong = (singermid: string, limit = 30) =>
  qqApi("/getSingerHotsong", { singermid, limit });

/** 新碟上架（`areaId`：1 内地 / 2 港台 / 3 欧美 / 4 日本 / 5 韩国） */
export const qqNewDisks = (areaId = 5, limit = 30) => qqApi("/getNewDisks", { areaId, limit });

/** 排行榜列表 */
export const qqTopLists = () => qqApi("/getTopLists");

/** 排行榜详情（歌曲列表，展示用：上游不含 songmid） */
export const qqRanks = (topId = 4) => qqApi("/getRanks", { topId });

/** 歌单分类 */
export const qqSongListCategories = () => qqApi("/getSongListCategories");

/* ------------------------------------------------------------------ 登录 / 会话 */

/** 获取扫码登录二维码（响应：`{ img（base64）, qrsig, ptqrtoken }`） */
export const qqLoginQr = () => qqApi("/getQQLoginQr");

/** 检查扫码状态（上游为 POST，参数仍走 query） */
export const qqCheckLoginQr = (qrsig: string) =>
  qqApi("/checkQQLoginQr", { qrsig }, { method: "post" });

/** 当前登录用户信息（需要 Cookie：uin + qqmusic_key） */
export const qqUserDetail = () => qqApi("/user/getUserDetail");

/** 用户歌单 */
export const qqUserPlaylists = () => qqApi("/user/getUserPlaylists");

/** 用户喜欢歌曲 */
export const qqUserLikedSongs = () => qqApi("/user/getUserLikedSongs");

/** VIP 信息 */
export const qqUserVipInfo = () => qqApi("/user/getVipInfo");

/* ------------------------------------------------------- 网易云兼容层（供既有页面复用） */

/**
 * 搜索结果（网易云 `/cloudsearch` 兼容形状）
 * @param neteaseType 网易云搜索类型枚举值（`SearchTypes`）
 */
export const qqSearchCompat = async (
  keywords: string,
  limit = 50,
  offset = 0,
  neteaseType = 1,
): Promise<Record<string, any>> => {
  const typeMap: Record<number, string> = {
    1: "song",
    100: "singer",
    10: "album",
    1000: "playlist",
  };
  const remoteplace = typeMap[neteaseType];
  if (!remoteplace) {
    return {
      code: 200,
      result: emptyQqSearchResult(),
      message: "QQ 音乐源暂不支持该搜索类型（可用：单曲 / 歌手 / 专辑 / 歌单）",
    };
  }
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const body = await qqSearchByKey(keywords, { page, limit, remoteplace });
  const mapped = mapQqSearchBody(body, neteaseType, limit);
  const errorText = qqErrorText(body);
  const { songCount, artistCount, albumCount, playlistCount } = mapped.result;
  if (errorText && !songCount && !artistCount && !albumCount && !playlistCount) {
    return { ...mapped, message: errorText };
  }
  return mapped;
};

/** 热搜（网易云 `/search/hot/detail` 兼容形状） */
export const qqSearchHotCompat = async (): Promise<Record<string, any>> => {
  const body = await qqHotKey();
  const list = body?.response?.data?.hotkey ?? [];
  const words = list
    .map((item: any) => ({ searchWord: String(item?.k ?? "").trim(), score: 0, content: "" }))
    .filter((item: any) => item.searchWord);
  return { code: 200, data: words };
};

/**
 * 播放地址（网易云 `/song/url/v1` 兼容形状）
 *
 * QQ 音乐的播放直链需要登录态；未登录时上游会返回 `error` 说明，这里转成可读提示。
 */
export const qqSongUrlById = async (
  id: number | string,
  level = "exhigh",
): Promise<{ code: number; data: any[]; message?: string }> => {
  const ref = resolveQqSong(id);
  if (!ref) return { code: 404, data: [], message: "QQ 歌曲未注册（请重新加载列表）" };
  const body = await qqMusicPlay(ref.mid, QQ_QUALITY_BY_LEVEL[level] ?? "320");
  const url = pickQqPlayUrl(body, ref.mid);
  if (!url) {
    return {
      code: 404,
      data: [],
      message: pickQqPlayError(body, ref.mid) || qqErrorText(body) || "QQ 音乐未返回播放地址",
    };
  }
  const ext = url.split("?")[0].split(".").pop() ?? "m4a";
  return {
    code: 200,
    data: [
      {
        id: ref.id,
        url,
        br: ext === "flac" ? 999000 : 320000,
        size: 0,
        level,
        md5: ref.mid,
        type: ext,
        encodeType: ext,
      },
    ],
  };
};

/** 歌词（网易云 `/lyric/new` 兼容形状） */
export const qqLyricById = async (id: number | string): Promise<Record<string, any>> => {
  const ref = resolveQqSong(id);
  if (!ref) return { code: 404, message: "QQ 歌曲未注册（请重新加载列表）" };
  const body = await qqLyricRaw(ref.mid, true);
  const lyric = qqLyricText(body);
  if (!lyric) return { code: 404, message: qqErrorText(body) || "QQ 音乐未返回歌词" };
  return {
    code: 200,
    lrc: { lyric },
    tlyric: { lyric: "" },
    romalrc: { lyric: "" },
    yrc: { lyric: "" },
    ytlrc: { lyric: "" },
    yromalrc: { lyric: "" },
  };
};
