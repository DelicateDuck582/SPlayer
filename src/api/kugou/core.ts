/**
 * 酷狗 API 适配层 · 纯逻辑部分
 *
 * 本文件**只做数据转换**：类型、错误码翻译、合成 ID 注册表、酷狗 → 网易云形状映射。
 * 不引入 `pinia`、`axios`、DOM 等运行时依赖，因此可被 `scripts/test-kugou-adapter.mts`
 * 在纯 Node 环境下直接加载做回归测试；网络与设置读取见 `./index`。
 */

/** 酷狗 API 响应（HTTP 200 时为业务码；风控时也可能返回 502 等） */
export interface KugouResponse<T = any> {
  /** 酷狗业务状态：1 正常 */
  status?: number;
  /** 错误码（酷狗上游业务码，与 HTTP 状态无关） */
  error_code?: number;
  errcode?: number;
  error_msg?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

/** 酷狗歌曲引用（取链 / 歌词 / 歌曲详情所需的全部信息） */
export interface KugouSongRef {
  /** 合成 ID（由 hash 派生，供 `SongType.id` 使用） */
  id: number;
  /** 酷狗歌曲 hash（32 位十六进制，取链与歌词的主键） */
  hash: string;
  /** 专辑 id */
  albumId?: number;
  /** 专辑音频 id（`album_audio_id`，取链参数） */
  audioId?: number;
  /** 歌名 */
  name: string;
  /** 歌手列表 */
  artists: { id?: number; name: string }[];
  /** 专辑名 */
  albumName?: string;
  /** 封面（已展开 `{size}` 占位符） */
  cover?: string;
  /** 时长（毫秒） */
  duration: number;
}

/** 酷狗搜索类型（与上游 `/search` 的 `type` 参数一致） */
export type KugouSearchType = "song" | "album" | "author" | "special" | "mv" | "lyric";

/**
 * 把酷狗错误码翻译成用户可读提示
 * @param body 酷狗响应体
 */
export const kugouErrorText = (body: KugouResponse | null | undefined): string => {
  const code = body?.error_code ?? body?.errcode;
  switch (Number(code)) {
    case 152:
      return "酷狗接口拒绝请求（152 Parameter Error）：该接口需要登录态，且云端出口 IP 被酷狗风控";
    case 20028:
      return "酷狗要求验证（20028）：请在「设置 → 网络 → 音乐源」中填写酷狗登录 Cookie 后重试";
    case 20010:
      return "酷狗返回未授权（20010）：登录态失效或需要会员权限";
    case 404:
      return "酷狗未找到该资源（404）";
    default:
      return String(body?.error_msg ?? body?.error ?? "") || "酷狗接口请求失败";
  }
};

/** 展开酷狗图片地址中的 `{size}` 占位符 */
export const kugouImage = (url?: string, size: number | string = 240): string =>
  String(url ?? "").replace(/\{size\}/g, String(size));

/** 时长归一化为毫秒（酷狗同时存在秒级 `duration` 与毫秒级 `timelength`） */
export const toDurationMs = (raw: any): number => {
  const ms = Number(raw?.timelength ?? 0);
  if (ms > 0) return ms;
  const sec = Number(raw?.duration ?? 0);
  return sec > 0 ? sec * 1000 : 0;
};

/** 兼容「数组包一层」的多种返回结构，取第一个数组 */
export const firstArray = (...candidates: unknown[]): any[] =>
  (candidates.find((item) => Array.isArray(item)) as any[]) ?? [];

/* ------------------------------------------------------------------ 合成 ID 注册表 */

/** 合成 ID → 歌曲引用。仅内存态：ID 由 hash 确定性派生，重新拉列表即会重建 */
const kugouSongRefs = new Map<number, KugouSongRef>();

/**
 * 由酷狗 hash 派生合成 ID
 *
 * 取前 13 位十六进制（52 bit），落在 `Number.MAX_SAFE_INTEGER` 内，
 * 与 `SongType.id: number` 兼容，且同一首歌在不同会话中得到相同 ID。
 */
export const kugouHashToId = (hash: string): number => {
  const value = Number.parseInt(String(hash || "").slice(0, 13), 16);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

/** 注册（或覆盖）酷狗歌曲引用，返回合成 ID */
export const registerKugouSong = (ref: KugouSongRef): number => {
  if (ref.id) kugouSongRefs.set(ref.id, ref);
  return ref.id;
};

/** 由合成 ID 反查酷狗歌曲引用（非酷狗歌曲返回 undefined） */
export const resolveKugouSong = (id: number | string): KugouSongRef | undefined =>
  kugouSongRefs.get(Number(id));

/** 清空注册表（仅供测试使用） */
export const clearKugouSongRefs = (): void => kugouSongRefs.clear();

/**
 * 酷狗歌曲原始对象 → 合成引用（同时写入注册表）
 * @param raw 酷狗歌曲对象（搜索 / 榜单 / 歌单 / 新歌速递返回的条目）
 */
export const kugouRawToRef = (raw: any): KugouSongRef | null => {
  const hash = String(raw?.hash ?? raw?.FileHash ?? raw?.EMixSongID ?? "").trim();
  if (!hash) return null;
  const id = kugouHashToId(hash);
  if (!id) return null;
  const authors = Array.isArray(raw?.authors) ? raw.authors : [];
  let artists: { id?: number; name: string }[] = authors
    .map((a: any) => ({
      id: Number(a?.author_id ?? 0) || undefined,
      name: String(a?.author_name ?? ""),
    }))
    .filter((a: any) => a.name);
  if (!artists.length) {
    artists = String(raw?.author_name ?? raw?.singername ?? "")
      .split(/[、,&/]/)
      .map((name) => ({ name: name.trim() }))
      .filter((a) => !!a.name);
  }
  const ref: KugouSongRef = {
    id,
    hash,
    albumId: Number(raw?.album_id ?? 0) || undefined,
    audioId: Number(raw?.album_audio_id ?? raw?.audio_id ?? 0) || undefined,
    name: String(raw?.songname ?? raw?.SongName ?? raw?.filename ?? "未知歌曲"),
    artists: artists.length ? artists : [{ name: "未知歌手" }],
    albumName: String(raw?.album_name ?? raw?.AlbumName ?? ""),
    cover: kugouImage(
      raw?.album_sizable_cover ?? raw?.img ?? raw?.Image ?? raw?.trans_param?.union_cover ?? "",
      240,
    ),
    duration: toDurationMs(raw),
  };
  registerKugouSong(ref);
  return ref;
};

/** 合成引用 → 网易云搜索结果歌曲形状（复用既有 `formatSongsList`） */
export const kugouRefToNeteaseSong = (ref: KugouSongRef) => ({
  id: ref.id,
  name: ref.name,
  // 歌手：合成为负数 id，避免与网易云歌手 id 语义混淆
  ar: ref.artists.map((a, index) => ({ id: a.id ?? -(index + 1), name: a.name })),
  artists: ref.artists.map((a, index) => ({ id: a.id ?? -(index + 1), name: a.name })),
  al: { id: ref.albumId ?? 0, name: ref.albumName ?? "", picUrl: ref.cover ?? "" },
  album: { id: ref.albumId ?? 0, name: ref.albumName ?? "", picUrl: ref.cover ?? "" },
  picUrl: ref.cover ?? "",
  dt: ref.duration,
  duration: ref.duration,
  fee: 0,
  mv: 0,
});

/**
 * 歌曲详情（网易云 `/song/detail` 兼容形状）
 *
 * 酷狗歌曲信息在列表接口中已完整（注册表内），无需额外请求。
 */
export const kugouSongDetailByIds = (
  ids: number | number[] | string | string[],
): { code: number; songs: any[] } => {
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => Number(id));
  const songs = list
    .map((id) => resolveKugouSong(id))
    .filter((ref): ref is KugouSongRef => !!ref)
    .map((ref) => kugouRefToNeteaseSong(ref));
  return { code: 200, songs };
};

/* --------------------------------------------------------------- 播放地址与歌词工具 */

/** 网易云音质 → 酷狗 `quality` 参数 */
export const KUGOU_QUALITY_BY_LEVEL: Record<string, string> = {
  standard: "128",
  higher: "128",
  exhigh: "320",
  lossless: "flac",
  hires: "high",
  jyeffect: "super",
  sky: "super",
  jymaster: "super",
  dolby: "320",
};

/** 网易云音质 → 码率（bps，仅用于客户端音质标记） */
export const KUGOU_BR_BY_LEVEL: Record<string, number> = {
  standard: 128000,
  higher: 128000,
  exhigh: 320000,
  lossless: 999000,
  hires: 1411000,
  jyeffect: 320000,
  sky: 320000,
  jymaster: 999000,
  dolby: 320000,
};

/** base64 → utf8 文本（浏览器与 Node 通用，避免在渲染进程依赖 Buffer） */
export const base64ToText = (value: string): string => {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
};

/** 取歌词候选数组（兼容 `candidates` / `list` / `info` 三种返回结构） */
export const candidatesOfLyric = (body: KugouResponse | null | undefined): any[] =>
  firstArray(body?.data?.candidates, body?.data?.list, body?.data?.info, body?.data);

/**
 * 从 `/song/url` 响应中提取播放地址（酷狗各版本返回结构略有差异）
 * @param body 酷狗响应体
 */
export const pickKugouPlayUrl = (body: KugouResponse | null | undefined): string => {
  const candidates: unknown[] = [
    body?.url?.[0]?.url,
    body?.data?.url?.[0]?.url,
    Array.isArray(body?.data) ? body?.data?.[0]?.url : undefined,
    body?.data?.play_url,
    body?.play_url,
    body?.url,
  ];
  const found = candidates.find((item) => typeof item === "string" && item.length > 0);
  return String(found ?? "");
};

/* ----------------------------------------------------- 搜索结果映射（酷狗 → 网易云形状） */

/** 酷狗歌曲数组 → 网易云歌曲数组（并注册合成 ID） */
export const mapKugouSongs = (list: any[]): any[] =>
  firstArray(list)
    .map((item) => kugouRawToRef(item))
    .filter((ref): ref is KugouSongRef => !!ref)
    .map((ref) => kugouRefToNeteaseSong(ref));

/** 酷狗歌手数组 → 网易云歌手数组 */
export const mapKugouArtists = (list: any[]): any[] =>
  firstArray(list).map((item: any) => ({
    id: Number(item?.AuthorId ?? item?.author_id ?? 0),
    name: String(item?.AuthorName ?? item?.author_name ?? ""),
    picUrl: kugouImage(item?.Avatar ?? item?.sizable_avatar ?? "", 240),
    alias: [] as string[],
    albumSize: Number(item?.AlbumCount ?? 0),
    musicSize: Number(item?.AudioCount ?? 0),
    mvSize: Number(item?.VideoCount ?? 0),
    fans: Number(item?.FansNum ?? 0),
  }));

/** 酷狗专辑数组 → 网易云专辑数组 */
export const mapKugouAlbums = (list: any[]): any[] =>
  firstArray(list).map((item: any) => ({
    id: Number(item?.albumid ?? item?.album_id ?? 0),
    name: String(item?.albumname ?? item?.album_name ?? ""),
    picUrl: kugouImage(item?.img ?? item?.sizable_cover ?? "", 240),
    artist: { id: Number(item?.singerid ?? 0) || 0, name: String(item?.singer ?? "") },
    artists: [{ id: Number(item?.singerid ?? 0) || 0, name: String(item?.singer ?? "") }],
    trackCount: Number(item?.songcount ?? 0),
    size: Number(item?.songcount ?? 0),
    publishTime: Date.parse(String(item?.publish_time ?? "")) || undefined,
    description: String(item?.intro ?? ""),
  }));

/** 酷狗歌单数组 → 网易云歌单数组 */
export const mapKugouPlaylists = (list: any[]): any[] =>
  firstArray(list).map((item: any) => ({
    id: Number(item?.specialid ?? item?.id ?? 0),
    name: String(item?.specialname ?? item?.name ?? ""),
    picUrl: kugouImage(item?.img ?? item?.pic ?? "", 240),
    trackCount: Number(item?.song_count ?? item?.songcount ?? 0),
    playCount: Number(item?.play_count ?? item?.playcount ?? 0),
    creator: { userId: Number(item?.suid ?? 0), nickname: String(item?.nickname ?? "") },
    tags: item?.tag_str ? String(item.tag_str).split(",") : [],
  }));

/** 空搜索结果骨架（网易云 `/cloudsearch` 形状） */
export const emptyKugouSearchResult = () => ({
  hasMore: false,
  songCount: 0,
  songs: [] as any[],
  albumCount: 0,
  albums: [] as any[],
  artistCount: 0,
  artists: [] as any[],
  playlistCount: 0,
  playlists: [] as any[],
});

/**
 * 酷狗搜索响应 → 网易云 `/cloudsearch` 形状（纯函数，便于回归测试）
 *
 * @param kugouType 酷狗搜索类型
 * @param body 酷狗 `/search` 响应
 * @param offset 结果偏移（用于计算 `hasMore`）
 */
export const mapKugouSearchBody = (
  kugouType: KugouSearchType,
  body: KugouResponse | null | undefined,
  offset = 0,
): Record<string, any> => {
  const list = firstArray(body?.data?.lists, body?.data?.info, body?.data?.data);
  const total = Number(body?.data?.total ?? list.length);
  const result: Record<string, any> = {
    ...emptyKugouSearchResult(),
    hasMore: total > offset + list.length,
  };

  if (kugouType === "song") {
    result.songs = mapKugouSongs(list);
    result.songCount = Number(body?.data?.total ?? result.songs.length);
    // 酷狗对数据中心 IP 的歌曲搜索有风控（152）：返回空列表并附上原因
    if (!list.length && (body?.error_code ?? body?.errcode)) result.message = kugouErrorText(body);
  } else if (kugouType === "author") {
    result.artists = mapKugouArtists(list);
    result.artistCount = Number(body?.data?.total ?? result.artists.length);
  } else if (kugouType === "album") {
    result.albums = mapKugouAlbums(list);
    result.albumCount = Number(body?.data?.total ?? result.albums.length);
  } else if (kugouType === "special") {
    result.playlists = mapKugouPlaylists(list);
    result.playlistCount = Number(body?.data?.total ?? result.playlists.length);
  }

  return { code: 200, result };
};
