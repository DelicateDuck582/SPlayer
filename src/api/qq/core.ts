/**
 * QQ 音乐 API 适配层 · 纯逻辑部分
 *
 * 上游服务：qq-music-api（https://github.com/DelicateDuck582/qq-music-api ，fork 自 sansenjian/qq-music-api）
 * 部署方式、Vercel 上的已知坑与验证结果见 doc/QQ-API.md。
 *
 * 本文件只做数据转换：类型、错误码翻译、合成 ID 注册表、QQ → 网易云形状映射。
 * 不引入 `pinia` / `axios` / DOM 依赖，可被 `scripts/test-qq-adapter.mts` 直接加载测试。
 *
 * 上游响应形态（实测）：
 * - 多数接口：`{ response: { code: 0, data: {...} } }`
 * - 部分接口：`{ data: {...} }`（如 `/getMusicPlay`）、`{ img, qrsig, ptqrtoken }`（扫码）
 * - `code === 0` 视为成功；HTTP 400/500 时返回 `{ error: "..." }`
 */

/** QQ 音乐 API 响应（形态不统一，故字段全部可选） */
export interface QqResponse<T = any> {
  /** 多数接口的业务体 */
  response?: {
    code?: number;
    subcode?: number;
    data?: T;
    [key: string]: any;
  };
  code?: number;
  data?: T;
  /** 错误信息（HTTP 4xx/5xx） */
  error?: string;
  img?: string;
  qrsig?: string;
  ptqrtoken?: string;
  [key: string]: any;
}

/** QQ 歌曲引用（取链 / 歌词 / 详情所需信息） */
export interface QqSongRef {
  /** 合成 ID（由 songmid 派生，供 `SongType.id` 使用） */
  id: number;
  /** QQ 歌曲 mid（播放与歌词主键） */
  mid: string;
  /** 媒体 mid（部分音质使用，缺失时回退 mid） */
  mediaMid?: string;
  /** 歌名 */
  name: string;
  /** 歌手 */
  artists: { id?: number; mid?: string; name: string }[];
  /** 专辑 mid */
  albumMid?: string;
  /** 专辑名 */
  albumName?: string;
  /** 封面（已展开尺寸） */
  cover?: string;
  /** 时长（毫秒） */
  duration: number;
}

/**
 * 把上游错误码/错误信息翻译成可读提示
 * @param body 上游响应
 */
export const qqErrorText = (body: QqResponse | null | undefined): string => {
  const code = body?.response?.code ?? body?.code;
  if (body?.error) {
    const text = String(body.error);
    if (text.includes("缺少 uin"))
      return "QQ 音乐登录态缺失：请在「设置 → 网络 → 音乐源」用 Cookie 登录";
    if (/cookie/i.test(text)) {
      return "QQ 音乐需要登录态：请填入有效的 QQ 音乐 Cookie（uin + qqmusic_key）";
    }
    return text;
  }
  switch (Number(code)) {
    case 0:
      return "";
    case 500001:
      return "QQ 音乐接口返回异常（500001）：参数无效或需要登录态";
    case 1000:
      return "QQ 音乐返回未授权（1000）：登录态失效，请重新登录";
    default:
      return code === undefined ? "" : `QQ 音乐接口异常（code=${code}）`;
  }
};

/** 展开 QQ 图片地址中的尺寸占位（QQ 使用 `R300x300M000` 形式，这里支持 `{size}` 占位） */
export const qqImage = (url?: string, size: number | string = 300): string =>
  String(url ?? "").replace(/\{size\}/g, String(size));

/** 由专辑 mid 拼专辑封面（QQ 官方 CDN 规则） */
export const qqAlbumCover = (albumMid?: string, size = 300): string =>
  albumMid ? `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albumMid}_1.jpg` : "";

/** 由歌手 mid 拼歌手头像 */
export const qqSingerAvatar = (singerMid?: string, size = 300): string =>
  singerMid ? `https://y.gtimg.cn/music/photo_new/T001R${size}x${size}M000${singerMid}.jpg` : "";

/** 时长归一化为毫秒（QQ `/getSearchByKey` 返回秒级 `interval`） */
export const qqDurationMs = (raw: any): number => {
  const seconds = Number(raw?.interval ?? raw?.duration ?? 0);
  if (seconds > 0) return seconds * 1000;
  const ms = Number(raw?.timelength ?? 0);
  return ms > 0 ? ms : 0;
};

/* ------------------------------------------------------------------ 合成 ID 注册表 */

/** 合成 ID → 歌曲引用。仅内存态：ID 由 mid 确定性派生，重新拉列表即会重建 */
const qqSongRefs = new Map<number, QqSongRef>();

/**
 * 由 QQ `songmid` 派生合成 ID
 *
 * `songmid` 为 14 位 base62 字符串；这里按 36 进制累加散列并压缩到安全整数内，
 * 与 `SongType.id: number` 兼容，且同一首歌跨会话可复现。
 */
export const qqMidToId = (mid: string): number => {
  const text = String(mid || "").slice(0, 12);
  if (!text) return 0;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hash = (hash * 36 + code) % 9007199254740000;
  }
  return hash > 0 ? hash : 0;
};

/** 注册（或覆盖）QQ 歌曲引用，返回合成 ID */
export const registerQqSong = (ref: QqSongRef): number => {
  if (ref.id) qqSongRefs.set(ref.id, ref);
  return ref.id;
};

/** 由合成 ID 反查 QQ 歌曲引用（非 QQ 歌曲返回 undefined） */
export const resolveQqSong = (id: number | string): QqSongRef | undefined =>
  qqSongRefs.get(Number(id));

/** 清空注册表（仅供测试使用） */
export const clearQqSongRefs = (): void => qqSongRefs.clear();

/**
 * QQ 歌曲原始对象 → 合成引用（同时写入注册表）
 * @param raw 来自搜索 / 歌单 / 歌手热门返回的歌曲对象
 */
export const qqRawToRef = (raw: any): QqSongRef | null => {
  const mid = String(raw?.songmid ?? raw?.mid ?? raw?.strMediaMid ?? "").trim();
  if (!mid) return null;
  const id = qqMidToId(mid);
  if (!id) return null;
  const singers = Array.isArray(raw?.singer) ? raw.singer : [];
  const artists = singers
    .map((item: any) => ({
      id: Number(item?.id ?? 0) || undefined,
      mid: String(item?.mid ?? "") || undefined,
      name: String(item?.name ?? "").trim(),
    }))
    .filter((item: any) => item.name);
  const albumMid = String(raw?.albummid ?? raw?.album?.mid ?? "").trim();
  const ref: QqSongRef = {
    id,
    mid,
    mediaMid: String(raw?.media_mid ?? raw?.strMediaMid ?? "") || undefined,
    name: String(raw?.songname ?? raw?.title ?? raw?.name ?? "未知歌曲"),
    artists: artists.length ? artists : [{ name: "未知歌手" }],
    albumMid: albumMid || undefined,
    albumName: String(raw?.albumname ?? raw?.album?.name ?? ""),
    cover: qqImage(raw?.cover ?? "") || qqAlbumCover(albumMid, 300),
    duration: qqDurationMs(raw),
  };
  registerQqSong(ref);
  return ref;
};

/** 合成引用 → 网易云搜索结果歌曲形状（复用既有 `formatSongsList`） */
export const qqRefToNeteaseSong = (ref: QqSongRef) => ({
  id: ref.id,
  name: ref.name,
  ar: ref.artists.map((a, index) => ({ id: a.id ?? -(index + 1), name: a.name })),
  artists: ref.artists.map((a, index) => ({ id: a.id ?? -(index + 1), name: a.name })),
  al: { id: 0, name: ref.albumName ?? "", picUrl: ref.cover ?? "" },
  album: { id: 0, name: ref.albumName ?? "", picUrl: ref.cover ?? "" },
  picUrl: ref.cover ?? "",
  dt: ref.duration,
  duration: ref.duration,
  fee: 0,
  mv: 0,
});

/** QQ 歌曲数组 → 网易云歌曲数组（并注册合成 ID） */
export const mapQqSongs = (list: any[]): any[] =>
  (Array.isArray(list) ? list : [])
    .map((item) => qqRawToRef(item))
    .filter((ref): ref is QqSongRef => !!ref)
    .map((ref) => qqRefToNeteaseSong(ref));

/** QQ 歌手数组 → 网易云歌手数组 */
export const mapQqArtists = (list: any[]): any[] =>
  (Array.isArray(list) ? list : []).map((item: any) => ({
    id: Number(item?.id ?? 0) || 0,
    name: String(item?.name ?? item?.singerName ?? ""),
    picUrl:
      qqImage(item?.pic ?? item?.avatar ?? "") || qqSingerAvatar(item?.mid ?? item?.singerMid, 300),
    alias: [] as string[],
    albumSize: Number(item?.albumNum ?? 0),
    musicSize: Number(item?.songNum ?? 0),
    mvSize: Number(item?.mvNum ?? 0),
    fans: Number(item?.fans ?? 0),
  }));

/** QQ 专辑数组 → 网易云专辑数组 */
export const mapQqAlbums = (list: any[]): any[] =>
  (Array.isArray(list) ? list : []).map((item: any) => ({
    id: Number(item?.albumID ?? item?.id ?? 0) || 0,
    name: String(item?.albumName ?? item?.name ?? ""),
    picUrl: qqImage(item?.pic ?? "") || qqAlbumCover(item?.albumMid ?? item?.mid, 300),
    artist: { id: 0, name: String(item?.singerName ?? item?.singer?.[0]?.name ?? "") },
    artists: [{ id: 0, name: String(item?.singerName ?? item?.singer?.[0]?.name ?? "") }],
    trackCount: Number(item?.songNum ?? 0),
    size: Number(item?.songNum ?? 0),
    publishTime: Date.parse(String(item?.pubTime ?? item?.publish_time ?? "")) || undefined,
    description: String(item?.introduction ?? ""),
  }));

/** QQ 歌单数组 → 网易云歌单数组 */
export const mapQqPlaylists = (list: any[]): any[] =>
  (Array.isArray(list) ? list : []).map((item: any) => ({
    id: Number(item?.dissid ?? item?.id ?? 0) || 0,
    name: String(item?.dissname ?? item?.name ?? ""),
    picUrl: qqImage(item?.imgurl ?? ""),
    trackCount: Number(item?.song_count ?? item?.songnum ?? 0),
    playCount: Number(item?.listennum ?? 0),
    creator: {
      userId: Number(item?.creator?.qq ?? 0),
      nickname: String(item?.creator?.name ?? ""),
    },
    tags: [] as string[],
  }));

/** 空搜索结果骨架（网易云 `/cloudsearch` 形状） */
export const emptyQqSearchResult = () => ({
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
 * QQ 搜索响应 → 网易云 `/cloudsearch` 形状（纯函数，便于回归测试）
 *
 * @param body `/getSearchByKey` 响应
 * @param type 网易云搜索类型（1 单曲 / 100 歌手 / 10 专辑 / 1000 歌单）
 * @param limit 本页条数（用于推算 hasMore）
 */
export const mapQqSearchBody = (
  body: QqResponse | null | undefined,
  type: number,
  limit = 50,
): Record<string, any> => {
  const data: any = body?.response?.data ?? {};
  const result: Record<string, any> = { ...emptyQqSearchResult() };
  const zhida: any = data?.zhida ?? {};

  if (type === 1) {
    result.songs = mapQqSongs(data?.song?.list ?? []);
    // 「直达」结果：搜索歌手名时 QQ 会返回单曲直达（zhida.type === 0）
    if (!result.songs.length && zhida?.songmid) result.songs = mapQqSongs([zhida]);
    result.songCount = Number(data?.song?.totalnum ?? result.songs.length);
    result.hasMore = result.songs.length >= limit;
  } else if (type === 100) {
    result.artists = mapQqArtists(data?.singer?.list ?? (zhida?.type === 1 ? [zhida] : []));
    result.artistCount = Number(data?.singer?.totalnum ?? result.artists.length);
  } else if (type === 10) {
    result.albums = mapQqAlbums(data?.album?.list ?? (zhida?.type === 2 ? [zhida] : []));
    result.albumCount = Number(data?.album?.totalnum ?? result.albums.length);
  } else if (type === 1000) {
    result.playlists = mapQqPlaylists(data?.songlist?.list ?? data?.disslist ?? []);
    result.playlistCount = Number(data?.songlist?.totalnum ?? result.playlists.length);
  } else {
    return {
      code: 200,
      result,
      message: "QQ 音乐源暂不支持该搜索类型（可用：单曲 / 歌手 / 专辑 / 歌单）",
    };
  }

  return { code: 200, result };
};

/** 歌曲详情（网易云 `/song/detail` 兼容形状；走注册表，零请求） */
export const qqSongDetailByIds = (
  ids: number | number[] | string | string[],
): { code: number; songs: any[] } => {
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => Number(id));
  const songs = list
    .map((id) => resolveQqSong(id))
    .filter((ref): ref is QqSongRef => !!ref)
    .map((ref) => qqRefToNeteaseSong(ref));
  return { code: 200, songs };
};

/* --------------------------------------------------------------- 播放地址与歌词 */

/** 从 `/getLyric` 响应中提取 LRC 文本（兼容 `response.lyric.lyric` 与 `lyric.lyric`） */
export const qqLyricText = (body: QqResponse | null | undefined): string => {
  const candidate = body?.response?.lyric ?? body?.lyric ?? body?.response?.data?.lyric;
  if (typeof candidate === "string") return candidate;
  return String(candidate?.lyric ?? body?.response?.data?.lyric ?? "");
};

/** 从 `/getMusicPlay` 响应中提取播放地址（兼容多种结构） */
export const pickQqPlayUrl = (body: QqResponse | null | undefined, mid: string): string => {
  const map = body?.data?.playUrl ?? body?.response?.data?.playUrl ?? {};
  const entry = map?.[mid] ?? Object.values(map ?? {})[0];
  const url = typeof entry === "string" ? entry : (entry as any)?.url;
  return typeof url === "string" ? url : "";
};

/** 取 `/getMusicPlay` 无地址时的错误说明 */
export const pickQqPlayError = (body: QqResponse | null | undefined, mid: string): string => {
  const map = body?.data?.playUrl ?? body?.response?.data?.playUrl ?? {};
  const entry = map?.[mid] ?? Object.values(map ?? {})[0];
  const message = (entry as any)?.error;
  return typeof message === "string" ? message : "";
};

/** 网易云音质 → QQ 音质参数 */
export const QQ_QUALITY_BY_LEVEL: Record<string, string> = {
  standard: "128",
  higher: "128",
  exhigh: "320",
  lossless: "flac",
  hires: "flac",
  jyeffect: "320",
  sky: "320",
  jymaster: "flac",
  dolby: "320",
};

/* ------------------------------------------------------------ 登录 / 会话 */

/** QQ 音乐登录会话（Cookie 登录 / 扫码登录 / 置换 Cookie 后得到） */
export interface QqLoginSession {
  /** 用户 uin（Cookie 中的 `uin`，形如 `o123456` 或纯数字） */
  uin: string;
  /** 登录密钥（Cookie 中的 `qqmusic_key`，旧版本为 `qm_keyst`） */
  key: string;
  /** 规范化后的 Cookie 文本 */
  cookie: string;
  nickname?: string;
  avatar?: string;
}

/** 需要落进 Cookie 的字段白名单（与 QQ 音乐网页端 Cookie 对应） */
const QQ_SESSION_COOKIE_FIELDS = ["uin", "qqmusic_key", "qm_keyst", "euin"] as const;

/** 合并 Cookie 字段到已有 Cookie 文本（同名覆盖，空值跳过） */
export const mergeQqCookieText = (
  baseCookie: string,
  fields: Record<string, string | number | undefined>,
): string => {
  const map = new Map<string, string>();
  String(baseCookie ?? "")
    .split(";")
    .forEach((item) => {
      const index = item.indexOf("=");
      if (index <= 0) return;
      const key = item.slice(0, index).trim();
      const value = item.slice(index + 1).trim();
      if (key) map.set(key, value);
    });
  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    map.set(key, text);
  });
  return `${[...map.entries()].map(([key, value]) => `${key}=${value}`).join("; ")};`;
};

/**
 * QQ 登录响应 → 会话
 *
 * `uin` + `qqmusic_key` 是 QQ 音乐接口的鉴权主键（旧版本字段为 `qm_keyst`）；
 * 上游部分接口（如 `/checkQQLoginQr`）会在 `data.cookie` 里直接返回整段 Cookie。
 */
export const qqLoginToSession = (
  body: QqResponse | null | undefined,
  baseCookie = "",
): QqLoginSession | null => {
  const data: any = body?.response?.data ?? body?.data ?? {};
  const parsed = new Map<string, string>();
  const cookieText = String(data?.cookie ?? "").trim() || String(baseCookie ?? "");
  cookieText.split(";").forEach((item) => {
    const index = item.indexOf("=");
    if (index <= 0) return;
    parsed.set(item.slice(0, index).trim(), item.slice(index + 1).trim());
  });
  QQ_SESSION_COOKIE_FIELDS.forEach((key) => {
    const value = data?.[key];
    if (value) parsed.set(key, String(value));
  });
  const uin = String(parsed.get("uin") ?? "").trim();
  const key = String(parsed.get("qqmusic_key") ?? parsed.get("qm_keyst") ?? "").trim();
  if (!uin || !key) return null;
  const fields: Record<string, string | number | undefined> = {};
  QQ_SESSION_COOKIE_FIELDS.forEach((name) => (fields[name] = parsed.get(name)));
  return {
    uin,
    key,
    cookie: mergeQqCookieText(baseCookie, fields),
    nickname: String(data?.nickname ?? "").trim() || undefined,
    avatar: qqImage(data?.avatar ?? data?.headpic ?? ""),
  };
};

/** 扫码状态：0 未扫码 / 1 已扫码待确认 / 2 待确认 / 4 成功 / 65 已过期 */
export const qqQrStatus = (body: QqResponse | null | undefined): number =>
  Number(
    body?.response?.data?.status ?? body?.data?.status ?? body?.response?.code ?? body?.code ?? 0,
  ) || 0;

/** 扫码状态文案 */
export const qqQrStatusText = (status: number): string => {
  switch (status) {
    case 0:
      return "请使用 QQ / 微信扫码并在手机上确认";
    case 1:
      return "已扫码，请在手机上确认";
    case 2:
      return "已确认，正在登录…";
    case 4:
      return "登录成功";
    case 65:
      return "二维码已过期，请点击刷新";
    default:
      return "等待扫码";
  }
};

/* ------------------------------------------------------------------ 用户信息 */

/** QQ 音乐用户信息（Cookie 登录后缓存在设置里，用于用户区头像 / 昵称展示） */
export interface QqUserProfile {
  /** 用户 uin */
  uin: string;
  /** 昵称 */
  nickname: string;
  /** 头像 */
  avatar: string;
  /** VIP 类型：0 非会员 */
  vipType: number;
}

/**
 * `/user/getUserDetail` 响应 → 统一用户信息
 *
 * QQ 音乐该接口字段随登录态变化较大（`creator` / `data` / `profile` 三种包裹），
 * 因此这里按多路候选取值。
 */
export const qqUserToProfile = (body: QqResponse | null | undefined): QqUserProfile | null => {
  const data: any = body?.response?.data ?? body?.data ?? {};
  const source = data?.creator ?? data?.profile ?? data?.user ?? data;
  if (!source || typeof source !== "object") return null;
  const uin = String(source?.uin ?? source?.encrypt_uin ?? data?.uin ?? "").trim();
  const nickname = String(
    source?.nick ?? source?.nickname ?? source?.name ?? data?.nick ?? "",
  ).trim();
  const avatar = qqImage(source?.headpic ?? source?.avatar ?? source?.avatarUrl ?? "");
  if (!uin && !nickname && !avatar) return null;
  return {
    uin,
    nickname,
    avatar,
    vipType: Number(source?.vip ?? source?.vipType ?? source?.isVip ?? 0) || 0,
  };
};
