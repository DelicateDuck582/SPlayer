/**
 * 酷狗音乐 API 客户端与端点封装
 *
 * 上游服务：KuGouMusicApi（https://github.com/DelicateDuck582/KuGouMusicApi ，MakcRe/KuGouMusicApi 的 fork）
 * 默认部署：https://kugou-api.duckgame-play.top （Vercel 部署与域名分配见 doc/KUGOU-API.md）
 *
 * 文件分工：
 * - `./core`：**纯数据转换**（合成 ID 注册表、酷狗 → 网易云形状映射、错误码翻译），可脱离浏览器/pinia 测试；
 * - 本文件：**网络与设置**（axios 实例、运行时 API 地址、Cookie 传递、端点封装、兼容层编排）。
 *
 * 设计要点：
 * - **独立 axios 实例**：不经过 `@/utils/request`，避免把网易云登录态（`MUSIC_U`）、`realIP`、
 *   代理等网易云专属参数带给第三方服务；酷狗凭据只在设置了「酷狗 Cookie」时附加。
 * - **凭据走请求体**：KuGouMusicApi 的 `server.js` 会合并 `[req.query, req.body]`，
 *   因此 `cookie` 放进 POST body，避免登录凭据出现在 URL、浏览器历史与访问日志中。
 * - **NetEase 兼容层**：把酷狗结果归一化成网易云形状（`cloudsearch` / `/song/url/v1` /
 *   `/lyric/new` / `/song/detail`），既有页面、播放器、歌词、下载无需改动即可工作。
 * - **合成 ID**：酷狗歌曲以 32 位 `hash` 标识，由 hash 前 13 位十六进制派生 52 位整数作为
 *   `SongType.id`（稳定、跨会话可复现），取链/歌词时经注册表反查。
 *
 * ⚠️ 已知上游限制（能力矩阵见 doc/KUGOU-API.md）：酷狗对数据中心出口 IP 有风控，匿名状态下
 * 「歌曲搜索 / 歌单详情 / 取播放地址 / 歌词」会被拒绝（152 Parameter Error、20028 需验证）；
 * 热搜、排行榜列表、新歌速递、歌单广场列表、歌手/专辑/歌单搜索可匿名获取。
 */
import axios, { type AxiosInstance } from "axios";
import { useSettingStore } from "@/stores";
import {
  KUGOU_BR_BY_LEVEL,
  KUGOU_QUALITY_BY_LEVEL,
  base64ToText,
  candidatesOfLyric,
  emptyKugouSearchResult,
  firstArray,
  kugouErrorText,
  mapKugouSearchBody,
  pickKugouPlayUrl,
  resolveKugouSong,
  type KugouResponse,
  type KugouSearchType,
} from "./core";

export * from "./core";

/** 构建时默认的酷狗 API 地址（可用 `VITE_KUGOU_API_URL` 覆盖） */
export const DEFAULT_KUGOU_API_BASE: string = String(
  (import.meta as any).env?.["VITE_KUGOU_API_URL"] || "https://kugou-api.duckgame-play.top",
).replace(/\/+$/, "");

/** 规范化酷狗 API 地址（去首尾空白与结尾斜杠） */
export const normalizeKugouApiBase = (url: unknown): string =>
  String(url ?? "")
    .trim()
    .replace(/\/+$/, "");

/** 当前生效的酷狗 API 地址：优先设置项，留空回退构建时默认值 */
export const getKugouApiBase = (): string => {
  try {
    return normalizeKugouApiBase(useSettingStore().kugouApiBase) || DEFAULT_KUGOU_API_BASE;
  } catch {
    // pinia 尚未就绪（极早期调用）时回退默认地址
    return DEFAULT_KUGOU_API_BASE;
  }
};

/** 当前是否处于「酷狗」音乐源 */
export const isKugouSource = (): boolean => {
  try {
    return useSettingStore().musicSource === "kugou";
  } catch {
    return false;
  }
};

/** 独立 axios 实例：不携带网易云 Cookie、不附加 realIP / 代理等网易云专属参数 */
const kugouServer: AxiosInstance = axios.create({
  timeout: 15000,
  // KuGouMusicApi 返回 `Access-Control-Allow-Origin: *`，
  // 若开启 withCredentials 浏览器会按 CORS 规范拦截该响应
  withCredentials: false,
});

/** 导出实例供测试脚本注入 baseURL（生产代码请使用 `kugouApi`） */
export { kugouServer };

/**
 * 调用酷狗 API
 *
 * 统一使用 POST：KuGouMusicApi 会把请求体合并进模块参数，
 * 既满足各模块对 `params.xxx` 的读取方式，也让 `cookie` 不必出现在 URL 中。
 *
 * @param path 路由路径（如 `/search`、`/song/url`）
 * @param params 模块参数（写进请求体）
 */
export const kugouApi = async <T = any>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<KugouResponse<T>> => {
  // pinia 未就绪时按「无 Cookie」处理，避免抛错影响调用方
  let cookie = "";
  try {
    cookie = String(useSettingStore().kugouCookie ?? "").trim();
  } catch {
    cookie = "";
  }
  const body: Record<string, unknown> = { ...params };
  if (cookie) body.cookie = cookie;
  const { data } = await kugouServer.post(path, body, { baseURL: getKugouApiBase() });
  return data as KugouResponse<T>;
};

/**
 * 探测酷狗 API 可用性（匿名请求热搜，不消耗登录态）
 * @param base 待测地址；留空则测当前生效地址
 */
export const testKugouApiBase = async (
  base?: string,
): Promise<{ ok: boolean; message: string }> => {
  const target = normalizeKugouApiBase(base) || getKugouApiBase();
  try {
    const { data } = await kugouServer.post("/search/hot", {}, { baseURL: target, timeout: 10000 });
    const body = data as KugouResponse;
    const ok = Number(body?.status ?? body?.errcode ?? 0) === 1;
    return ok
      ? { ok: true, message: `连接成功：${target}` }
      : { ok: false, message: `接口返回异常（${kugouErrorText(body)}）：${target}` };
  } catch (error) {
    return {
      ok: false,
      message: `连接失败：${(error as Error)?.message || "未知错误"}（${target}）`,
    };
  }
};

/* ------------------------------------------------------------------ 原始端点 */

/** 搜索（`type=song` 在无登录态时会被酷狗拒绝，见文件头说明） */
export const kugouSearch = (
  keywords: string,
  type: KugouSearchType = "song",
  page = 1,
  pagesize = 30,
) => kugouApi("/search", { keywords, type, page, pagesize });

/** 热搜列表 */
export const kugouHotSearch = () => kugouApi("/search/hot");

/** 默认搜索关键词 */
export const kugouSearchDefault = () => kugouApi("/search/default");

/** 新歌速递（`type`：0 全部 / 1 华语 / 2 欧美 / 3 日韩 …） */
export const kugouTopSongs = (type: number | string = 0) => kugouApi("/top/song", { type });

/** 排行榜列表 */
export const kugouRankList = () => kugouApi("/rank/list", { withsong: 0 });

/** 排行榜详情（名称、封面、更新时间） */
export const kugouRankInfo = (rankid: number | string) => kugouApi("/rank/info", { rankid });

/** 排行榜歌曲列表 */
export const kugouRankSongs = (rankid: number | string, page = 1, pagesize = 30) =>
  kugouApi("/rank/audio", { rankid, rank_cid: 0, page, pagesize });

/** 歌单广场（分类歌单列表） */
export const kugouTopPlaylists = (page = 1, pagesize = 30) =>
  kugouApi("/top/playlist", { page, pagesize });

/** 歌单详情（无登录态时酷狗常返回 20028 需验证） */
export const kugouPlaylistDetail = (id: number | string) => kugouApi("/playlist/detail", { id });

/** 歌单全部歌曲 */
export const kugouPlaylistTracks = (id: number | string, page = 1, pagesize = 30) =>
  kugouApi("/playlist/track/all", { id, page, pagesize });

/** 歌手单曲（`sort`：hot 最热 / new 最新） */
export const kugouArtistSongs = (
  authorId: number | string,
  sort: "hot" | "new" = "hot",
  page = 1,
  pagesize = 30,
) => kugouApi("/artist/audios", { id: authorId, sort, page, pagesize });

/** 专辑歌曲列表 */
export const kugouAlbumSongs = (albumId: number | string, page = 1, pagesize = 30) =>
  kugouApi("/album/songs", { id: albumId, page, pagesize });

/** 歌词搜索（返回候选，含 `/lyric` 所需的 `id` 与 `accesskey`） */
export const kugouLyricSearch = (keywords: string) =>
  kugouApi("/search/lyric", { keywords, page: 1, pagesize: 10 });

/** 歌词下载（`fmt=lrc` 直接得到 LRC 文本；`decode=1` 让服务端解码） */
export const kugouLyricRaw = (id: string | number, accesskey: string, fmt: "lrc" | "krc" = "lrc") =>
  kugouApi("/lyric", { id, accesskey, fmt, decode: 1 });

/** 取播放地址（`quality`：128 / 320 / flac / high / super …） */
export const kugouSongUrlRaw = (
  hash: string,
  options: { quality?: string; albumId?: number; audioId?: number; freePart?: boolean } = {},
) =>
  kugouApi("/song/url", {
    id: hash.toLowerCase(),
    quality: options.quality ?? "320",
    album_id: options.albumId ?? 0,
    album_audio_id: options.audioId ?? 0,
    free_part: !!options.freePart,
  });

/* ------------------------------------------------------- 网易云兼容层（供既有页面复用） */

/**
 * 播放地址（网易云 `/song/url/v1` 兼容形状）
 *
 * @param id 合成 ID（`SongType.id`）
 * @param level 网易云音质名
 * @returns `{ code, data: [{ id, url, br, size, level, md5 }] }`；失败时 `data` 为空数组并带 `message`
 */
export const kugouSongUrlById = async (
  id: number | string,
  level = "exhigh",
): Promise<{ code: number; data: any[]; message?: string }> => {
  const ref = resolveKugouSong(id);
  if (!ref) return { code: 404, data: [], message: "酷狗歌曲未注册（请重新加载列表）" };
  const body = await kugouSongUrlRaw(ref.hash, {
    quality: KUGOU_QUALITY_BY_LEVEL[level] ?? "320",
    albumId: ref.albumId,
    audioId: ref.audioId,
  });
  const url = pickKugouPlayUrl(body);
  if (!url) return { code: 404, data: [], message: kugouErrorText(body) };
  const ext = url.split("?")[0].split(".").pop() ?? "mp3";
  return {
    code: 200,
    data: [
      {
        id: ref.id,
        url,
        br: KUGOU_BR_BY_LEVEL[level] ?? 320000,
        size: Number(body?.filesize ?? body?.fileSize ?? 0),
        level,
        md5: ref.hash.toLowerCase(),
        type: ext,
        encodeType: ext,
      },
    ],
  };
};

/**
 * 歌词（网易云 `/lyric/new` 兼容形状）
 *
 * 酷狗取歌词是「先搜索候选 → 再按 id + accesskey 下载」两步，
 * 这里以「歌名 + 歌手」搜索候选并采用第一条。
 */
export const kugouLyricById = async (id: number | string): Promise<Record<string, any>> => {
  const ref = resolveKugouSong(id);
  if (!ref) return { code: 404, message: "酷狗歌曲未注册（请重新加载列表）" };
  const keyword = `${ref.name} ${ref.artists.map((a) => a.name).join(" ")}`.trim();
  const searched = await kugouLyricSearch(keyword);
  const candidate = candidatesOfLyric(searched).find((item) => item?.id && item?.accesskey);
  if (!candidate) return { code: 404, message: kugouErrorText(searched) || "酷狗未找到歌词候选" };
  const lyricRes = await kugouLyricRaw(candidate.id, candidate.accesskey, "lrc");
  const decoded =
    String(lyricRes?.decodeContent ?? "").trim() ||
    (lyricRes?.content && Number(lyricRes?.contenttype) !== 0
      ? base64ToText(String(lyricRes.content))
      : "");
  if (!decoded) return { code: 404, message: kugouErrorText(lyricRes) || "酷狗未返回歌词内容" };
  // 逐字歌词（yrc）留空：酷狗 KRC 与网易云 YRC 格式不兼容，按普通 LRC + 翻译渲染
  return {
    code: 200,
    lrc: { lyric: decoded },
    tlyric: { lyric: "" },
    romalrc: { lyric: "" },
    yrc: { lyric: "" },
    ytlrc: { lyric: "" },
    yromalrc: { lyric: "" },
  };
};

/**
 * 搜索结果（网易云 `/cloudsearch` 兼容形状）
 * @param neteaseType 网易云搜索类型枚举值（`SearchTypes`）
 */
export const kugouSearchCompat = async (
  keywords: string,
  limit = 50,
  offset = 0,
  neteaseType = 1,
): Promise<Record<string, any>> => {
  // 网易云搜索类型 → 酷狗搜索类型
  const typeMap: Record<number, KugouSearchType> = {
    1: "song",
    10: "album",
    100: "author",
    1000: "special",
  };
  const kugouType = typeMap[neteaseType];
  if (!kugouType) {
    return {
      code: 200,
      result: emptyKugouSearchResult(),
      message: "酷狗源暂不支持该搜索类型（可用：单曲 / 歌手 / 专辑 / 歌单）",
    };
  }
  const page = Math.floor(offset / Math.max(limit, 1)) + 1;
  const body = await kugouSearch(keywords, kugouType, page, limit);
  return mapKugouSearchBody(kugouType, body, offset);
};

/** 热搜（网易云 `/search/hot/detail` 兼容形状） */
export const kugouSearchHotCompat = async (): Promise<Record<string, any>> => {
  const body = await kugouHotSearch();
  const words: any[] = [];
  firstArray(body?.data?.list).forEach((group: any) =>
    firstArray(group?.keywords).forEach((item: any) => {
      if (item?.keyword) words.push({ searchWord: String(item.keyword), score: 0, content: "" });
    }),
  );
  return { code: 200, data: words };
};

/** 默认搜索关键词（网易云 `/search/default` 兼容形状） */
export const kugouSearchDefaultCompat = async (): Promise<Record<string, any>> => {
  const body = await kugouSearchDefault();
  const fallback = firstArray(body?.data?.fallback);
  const ads = firstArray(body?.data?.ads);
  const keyword = String(fallback[0]?.keyword ?? ads[0]?.main_title ?? "热门歌曲");
  return { code: 200, data: { showKeyword: keyword, realkeyword: keyword } };
};
