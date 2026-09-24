/**
 * 首页推荐（**按当前音乐源 + 登录态**取数）
 *
 * 背景：此前首页「专属歌单 / 雷达歌单」只走网易云接口，且
 * - 缓存键不含音乐源与登录态（切源或登录后仍吃旧结果，看起来像「默认推荐」）；
 * - 整个个性化区域由 `isLogin()`（网易云登录）把关，切到酷狗 / QQ 后整块消失。
 *
 * 本模块把各源的个性化入口统一成同一套返回类型（`CoverType` / `ArtistType` / `SongType`）：
 *
 * | 区块 | 网易云 | 酷狗音乐 | QQ 音乐 |
 * | --- | --- | --- | --- |
 * | 每日推荐（歌曲） | `musicStore.dailySongsData`（沿用现状） | `/everyday/recommend` → `data.song_list` | `/getDailyRecommend`（需登录） |
 * | 专属歌单 | `/personalized`（登录后为专属） | 登录：`/user/playlist`；匿名：`/top/playlist` | 登录：`/user/getUserPlaylists`；匿名：`/getPersonalRecommend` → 兜底 `/getSongLists` |
 * | 雷达歌单 | `idMeta.radarPlaylist`（私人雷达，登录后个性化） | — | — |
 * | 歌手推荐 | `/top/artists` | `/artist/lists` | `/getSingerList` |
 * | 新碟上架 | `/album/new` | `/top/album` | `/getNewDisks` |
 * | 推荐 MV / 播客 | `/mv/all`、`/dj/recommend` | — | — |
 *
 * 「—」表示该源暂无等价接口：对应区块返回空数组，由首页过滤隐藏，不再用通用默认内容冒充个性化推荐。
 */
import { useSettingStore } from "@/stores";
import { formatArtistsList, formatCoverList, formatSongsList } from "@/utils/format";
import type { ArtistType, CoverType, SongType } from "@/types/main";
import { isLogin } from "@/utils/auth";
import { isKugouLogin } from "@/utils/kugouAuth";
import { isQqLogin } from "@/utils/qqAuth";
import {
  kugouApi,
  mapKugouAlbums,
  mapKugouArtists,
  mapKugouPlaylists,
  mapKugouSongs,
} from "@/api/kugou";
import { mapQqAlbums, mapQqArtists, mapQqPlaylists, mapQqSongs, qqApi } from "@/api/qq";

/** 音乐源标识 */
export type MusicSourceKey = "netease" | "kugou" | "qq";

/** 当前音乐源 */
export const currentSource = (): MusicSourceKey => {
  try {
    return useSettingStore().musicSource as MusicSourceKey;
  } catch {
    return "netease";
  }
};

/** 当前源是否登录（各源登录态独立） */
export const isSourceLogin = (): boolean => {
  const source = currentSource();
  if (source === "kugou") return isKugouLogin();
  if (source === "qq") return isQqLogin();
  return !!isLogin();
};

/** 当前源显示名 */
export const sourceLabel = (): string => {
  const source = currentSource();
  if (source === "kugou") return "酷狗音乐";
  if (source === "qq") return "QQ 音乐";
  return "网易云音乐";
};

/** 首页栏目键（与 `settingStore.homePageSections[].key` 对齐） */
export type HomeSectionKey =
  | "daily"
  | "like"
  | "fm"
  | "playlist"
  | "radar"
  | "artist"
  | "video"
  | "radio"
  | "album";

/** 首页栏目默认清单（用于补全旧持久化数据里缺失的键） */
export const HOME_SECTION_DEFAULTS: Array<{ key: HomeSectionKey; name: string }> = [
  { key: "daily", name: "每日推荐" },
  { key: "like", name: "我喜欢的音乐" },
  { key: "fm", name: "私人 FM" },
  { key: "playlist", name: "专属歌单" },
  { key: "radar", name: "雷达歌单" },
  { key: "artist", name: "歌手推荐" },
  { key: "video", name: "推荐 MV" },
  { key: "radio", name: "推荐播客" },
  { key: "album", name: "新碟上架" },
];

/**
 * 补全首页栏目配置
 *
 * 旧版本持久化的 `homePageSections` 不含新增栏目（如「每日推荐」「私人 FM」），
 * 直接按数组渲染会漏项。这里把缺失的键按默认顺序补齐并重新编号。
 */
export const ensureHomePageSections = (): void => {
  try {
    const store = useSettingStore();
    const list = store.homePageSections ?? [];
    HOME_SECTION_DEFAULTS.forEach((item, index) => {
      if (!list.some((section) => section.key === item.key)) {
        list.push({ key: item.key, name: item.name, visible: true, order: index });
      }
    });
    list
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((section, index) => {
        section.order = index;
      });
    store.homePageSections = list;
  } catch {
    // pinia 未就绪时忽略
  }
};

/**
 * 首页栏目显示名（随音乐源变化；网易云沿用栏目自身名称）
 * @param key 栏目键
 * @param fallback 兜底名称（栏目自身 name）
 */
export const sectionTitle = (key: HomeSectionKey, fallback: string): string => {
  const source = currentSource();
  if (key === "playlist") {
    if (source === "netease") return isLogin() ? "专属歌单" : "推荐歌单";
    return isSourceLogin() ? `${sourceLabel()}专属歌单` : `${sourceLabel()}推荐歌单`;
  }
  if (key === "album") {
    if (source === "netease") return fallback;
    return `${sourceLabel()}新碟上架`;
  }
  if (key === "artist") {
    if (source === "netease") return fallback;
    return `${sourceLabel()}歌手推荐`;
  }
  return fallback;
};

/** 指定首页栏目是否可见（未配置时视为可见） */
export const isHomeSectionVisible = (key: HomeSectionKey): boolean => {
  try {
    const section = useSettingStore().homePageSections?.find((item) => item.key === key);
    return section ? section.visible : true;
  } catch {
    return true;
  }
};

/** 从多个候选里取第一个数组 */
const firstArray = (...candidates: unknown[]): any[] =>
  (candidates.find((item) => Array.isArray(item)) as any[]) ?? [];

/** 防御式取值（`a.b.c` 形式，遇到空值自动尝试下一个候选） */
const pick = (value: any, ...paths: string[]): any => {
  for (const path of paths) {
    const result = path
      .split(".")
      .reduce((acc: any, key) => (acc === undefined || acc === null ? undefined : acc[key]), value);
    if (Array.isArray(result) ? result.length > 0 : result !== undefined && result !== null)
      return result;
  }
  return undefined;
}; /* ---------------------------------------------------------------- 每日推荐（歌曲） */

/** 酷狗每日推荐（登录后按口味；匿名结构存在但歌曲为空） */
const kugouDailySongs = async (): Promise<SongType[]> => {
  const body = await kugouApi("/everyday/recommend");
  const list = firstArray(
    pick(body, "data.song_list"),
    pick(body, "data.songs"),
    pick(body, "data.info"),
  );
  return formatSongsList(mapKugouSongs(list));
};

/** QQ 每日推荐（上游要求登录态） */
const qqDailySongs = async (): Promise<SongType[]> => {
  const body = await qqApi("/getDailyRecommend");
  const recommend = pick(body, "response.recommend") ?? {};
  const list = firstArray(
    pick(recommend, "songlist"),
    pick(recommend, "data.list"),
    pick(recommend, "data.songlist"),
    pick(recommend, "list"),
  );
  return formatSongsList(mapQqSongs(list));
};

/**
 * 每日推荐歌曲（网易云由 `HomeOnline` 直接读 store；此处用于酷狗 / QQ）
 * @returns 已格式化的歌曲列表（失败时为空数组）
 */
export const homeDailySongs = async (): Promise<SongType[]> => {
  try {
    const source = currentSource();
    if (source === "kugou") return await kugouDailySongs();
    if (source === "qq") return await qqDailySongs();
    return [];
  } catch (error) {
    console.warn("[首页推荐] 每日推荐获取失败：", (error as Error)?.message);
    return [];
  }
};

/* ------------------------------------------------------------------ 专属 / 推荐歌单 */

/** 酷狗：登录用「我的歌单」，匿名用歌单广场 */
const kugouPlaylists = async (limit: number, logged: boolean): Promise<CoverType[]> => {
  if (logged) {
    const body = await kugouApi("/user/playlist");
    const list = firstArray(pick(body, "data.info"), pick(body, "data.list"), pick(body, "data"));
    const mapped = formatCoverList(mapKugouPlaylists(list));
    if (mapped.length) return mapped;
  }
  const body = await kugouApi("/top/playlist", { page: 1, pagesize: limit });
  const list = firstArray(
    pick(body, "data.special_list"),
    pick(body, "data.info"),
    pick(body, "data.list"),
  );
  return formatCoverList(mapKugouPlaylists(list));
};

/** QQ：登录用「我的歌单」，匿名用推荐歌单（`/getPersonalRecommend`），再兜底歌单广场 */
const qqPlaylists = async (limit: number, logged: boolean): Promise<CoverType[]> => {
  if (logged) {
    const body = await qqApi("/user/getUserPlaylists");
    const list = firstArray(
      pick(body, "response.data.disslist"),
      pick(body, "response.data.list"),
      pick(body, "data.disslist"),
      pick(body, "data.list"),
    );
    const mapped = formatCoverList(mapQqPlaylists(list));
    if (mapped.length) return mapped;
  }
  const recommend = await qqApi("/getPersonalRecommend");
  const recommendList = firstArray(
    pick(recommend, "response.recomPlaylist.content"),
    pick(recommend, "response.recomPlaylist.list"),
    pick(recommend, "response.recomPlaylist.data.list"),
    pick(recommend, "response.data.content"),
  );
  const mapped = formatCoverList(mapQqPlaylists(recommendList));
  if (mapped.length) return mapped;
  const body = await qqApi("/getSongLists", { page: 1, limit, categoryId: 10000000, sortId: 5 });
  return formatCoverList(mapQqPlaylists(firstArray(pick(body, "response.data.list"))));
};

/**
 * 专属 / 推荐歌单
 * @param limit 数量（网易云匿名 20 / 登录 21，与既有行为一致）
 */
export const homePersonalPlaylists = async (limit = 20): Promise<CoverType[]> => {
  try {
    const source = currentSource();
    const logged = isSourceLogin();
    if (source === "kugou") return await kugouPlaylists(limit, logged);
    if (source === "qq") return await qqPlaylists(limit, logged);
    return [];
  } catch (error) {
    console.warn("[首页推荐] 歌单获取失败：", (error as Error)?.message);
    return [];
  }
}; /* ------------------------------------------------------------------ 歌手 / 新碟 */

/** 歌手推荐（酷狗 / QQ；网易云沿用 `/top/artists`） */
export const homeArtists = async (limit = 6): Promise<ArtistType[]> => {
  try {
    const source = currentSource();
    if (source === "kugou") {
      const body = await kugouApi("/artist/lists", { page: 1, pagesize: limit });
      const info = firstArray(pick(body, "data.info"));
      // 酷狗该接口按「分组」返回，组内 singer 为歌手数组
      const flat = info.flatMap((item: any) => firstArray(item?.singer, item?.singers, [item]));
      return formatArtistsList(mapKugouArtists(flat.slice(0, limit)));
    }
    if (source === "qq") {
      const body = await qqApi("/getSingerList");
      const list = firstArray(
        pick(body, "response.singerList.data.singerlist"),
        pick(body, "response.singerList.data.list"),
        pick(body, "response.singerList.list"),
      );
      return formatArtistsList(mapQqArtists(list.slice(0, limit)));
    }
    return [];
  } catch (error) {
    console.warn("[首页推荐] 歌手获取失败：", (error as Error)?.message);
    return [];
  }
};

/** 新碟上架（酷狗 / QQ；网易云沿用 `/album/new`） */
export const homeAlbums = async (limit = 20): Promise<CoverType[]> => {
  try {
    const source = currentSource();
    if (source === "kugou") {
      const body = await kugouApi("/top/album", { page: 1, pagesize: limit });
      // 酷狗返回 data.{chn,eur,jpn,kor} 四个语种专辑数组；字段名需适配后交给映射层
      const raw = [
        ...firstArray(pick(body, "data.chn")),
        ...firstArray(pick(body, "data.eur")),
        ...firstArray(pick(body, "data.jpn")),
        ...firstArray(pick(body, "data.kor")),
      ];
      const list = raw
        .map((item: any) => ({
          albumid: item?.albumid,
          albumname: item?.albumname,
          img: item?.imgurl ?? item?.img,
          singer: item?.singername ?? item?.singer,
          singerid: item?.singerid,
          songcount: item?.songcount,
          publish_time: item?.publishtime ?? item?.publish_time,
        }))
        .slice(0, limit);
      return formatCoverList(mapKugouAlbums(list));
    }
    if (source === "qq") {
      const body = await qqApi("/getNewDisks", { areaId: 5, limit });
      const list = firstArray(
        pick(body, "response.new_album.data.albums"),
        pick(body, "response.data.albums"),
        pick(body, "response.albumlib.data.list"),
      );
      return formatCoverList(mapQqAlbums(list.slice(0, limit)));
    }
    return [];
  } catch (error) {
    console.warn("[首页推荐] 新碟获取失败：", (error as Error)?.message);
    return [];
  }
};
