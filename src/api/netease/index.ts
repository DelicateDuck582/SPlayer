/**
 * npm 版「NeteaseCloudMusicApi」全量能力入口
 *
 * 与仓库既有的 `src/api/*.ts` 是**并存关系**：
 * - `src/api/*.ts`：既有功能（歌单 / 歌曲 / 播放等）继续使用，二者共用 `@/utils/request`
 *   的请求拦截器，因此**都会自动跟随「设置 → 网络 → API 服务」里切换的 API 源**；
 * - 本目录：npm 版 API 的**全量端点**（377 个，见 `./endpoints`）与新增功能的具名封装，
 *   供「网易云 API 功能补齐」相关页面使用。
 *
 * 三种调用方式：
 * ```ts
 * // 1. 具名封装（推荐，带参数与返回类型）
 * const list = await styleList();
 * // 2. 按模块名调用（与上游 `module/<name>.js`、官方文档一一对应）
 * await neteaseApiByName("user_record", { params: { uid, type: 0 } });
 * // 3. 按路径调用（路径是字面量联合类型，拼错会在编译期报错）
 * await neteaseApi("/mv/detail", { params: { mvid } });
 * ```
 *
 * 端点清单（377 个）可用 `pnpm gen:netease-endpoints` 从上游包重新生成。
 */
import request from "@/utils/request";
import {
  NETEASE_ENDPOINTS,
  NETEASE_ENDPOINT_PATH_BY_NAME,
  type NeteaseEndpointName,
  type NeteaseEndpointPath,
} from "./endpoints";
import type {
  NeteaseAudioMatchResult,
  NeteaseCalendarResult,
  NeteaseDjItem,
  NeteaseDigitalAlbum,
  NeteaseListenReport,
  NeteaseListenToday,
  NeteaseListenTotal,
  NeteaseMessageItem,
  NeteaseMvBrief,
  NeteaseMvDetail,
  NeteaseStyleDetail,
  NeteaseStyleTag,
  NeteaseUserProfile,
  NeteaseUserRecordSong,
  NeteaseVipGrowthPoint,
  NeteaseVipInfo,
  NeteaseVipTask,
  NeteaseYunbeiInfo,
  NeteaseYunbeiTask,
} from "@/types/netease";

export * from "./endpoints";

/** 通用调用参数 */
export interface NeteaseCallOptions {
  /** 请求方法，默认 `get` */
  method?: "get" | "post";
  /** 查询参数 */
  params?: Record<string, unknown>;
  /** 请求体（`post` 时使用） */
  data?: Record<string, unknown>;
  /** 是否附带时间戳（默认 `true`，与仓库其它 api 一致，避免命中服务端 2 分钟缓存） */
  timestamp?: boolean;
}

/** 按端点路径调用（路径受联合类型约束） */
export const neteaseApi = <T = any>(
  path: NeteaseEndpointPath,
  options: NeteaseCallOptions = {},
): Promise<T> => {
  const { method = "get", params = {}, data, timestamp = true } = options;
  return request<T>({
    url: path,
    method,
    params: timestamp ? { ...params, timestamp: Date.now() } : params,
    ...(data ? { data } : {}),
  });
};

/** 按端点模块名调用（与上游文档、`module/<name>.js` 一致） */
export const neteaseApiByName = <T = any>(
  name: NeteaseEndpointName,
  options: NeteaseCallOptions = {},
): Promise<T> => neteaseApi<T>(NETEASE_ENDPOINT_PATH_BY_NAME[name], options);

/**
 * 浏览类（只读、非个性化）调用：**不附加 `timestamp`**
 *
 * 原因：API 服务的响应缓存以完整 URL 为键（上游 `apicache`，默认 2 分钟），
 * 带时间戳参数会让每次请求都变成「新 URL」而穿透缓存；浏览类接口内容与用户无关，
 * 去掉时间戳可以吃到缓存、降低上游压力与首屏耗时。
 */
export const neteaseBrowse = <T = any>(
  path: NeteaseEndpointPath,
  options: NeteaseCallOptions = {},
): Promise<T> => neteaseApi<T>(path, { ...options, timestamp: false });

/** 端点总数（用于「网易云 API 能力」页展示） */
export const neteaseEndpointList = NETEASE_ENDPOINTS;

/* ------------------------------------------------------------------ 音乐日历 */

/**
 * 音乐日历（默认查询最近一年，可按时间段传入）
 * @param startTime 开始时间（毫秒）
 * @param endTime 结束时间（毫秒）
 */
export const calendar = (startTime?: number, endTime?: number) => {
  const end = endTime ?? Date.now();
  // 默认回溯一年，避免一次拉取过多数据
  const start = startTime ?? end - 365 * 24 * 60 * 60 * 1000;
  return neteaseApi<NeteaseCalendarResult>("/calendar", {
    params: { startTime: start, endTime: end },
  });
};

/* --------------------------------------------------------------- 听歌足迹/统计 */

/** 总收听时长 */
export const listenDataTotal = () => neteaseApi<NeteaseListenTotal>("/listen/data/total");

/** 今日收听歌曲 */
export const listenDataTodaySong = () => neteaseApi<NeteaseListenToday>("/listen/data/today/song");

/** 本周 / 本月收听时长 */
export const listenDataRealtimeReport = () =>
  neteaseApi<NeteaseListenReport>("/listen/data/realtime/report");

/** 周 / 月 / 年收听报告 */
export const listenDataReport = (type: "week" | "month" | "year" = "week") =>
  neteaseApi<NeteaseListenReport>("/listen/data/report", { params: { type } });

/** 年度听歌足迹 */
export const listenDataYearReport = () =>
  neteaseApi<NeteaseListenReport>("/listen/data/year/report");

/* -------------------------------------------------------------------- 曲风 */

/** 曲风列表（含子曲风） */
export const styleList = () =>
  neteaseBrowse<{ code: number; data?: NeteaseStyleTag[] }>("/style/list");

/** 曲风详情 */
export const styleDetail = (tagId: number | string) =>
  neteaseBrowse<{ code: number; data?: NeteaseStyleDetail }>("/style/detail", {
    params: { tagId },
  });

/** 曲风 - 歌曲 */
export const styleSong = (tagId: number | string) =>
  neteaseBrowse("/style/song", { params: { tagId } });

/** 曲风 - 歌单 */
export const stylePlaylist = (tagId: number | string) =>
  neteaseBrowse("/style/playlist", { params: { tagId } });

/** 曲风 - 歌手 */
export const styleArtist = (tagId: number | string) =>
  neteaseBrowse("/style/artist", { params: { tagId } });

/** 曲风 - 专辑 */
export const styleAlbum = (tagId: number | string) =>
  neteaseBrowse("/style/album", { params: { tagId } });

/** 曲风偏好（登录后） */
export const stylePreference = () => neteaseApi("/style/preference");

/* ------------------------------------------------------------- 相似内容推荐 */

/** 相似歌曲 */
export const simiSong = (id: number | string) =>
  neteaseBrowse<{ code: number; songs?: any[] }>("/simi/song", { params: { id } });

/** 相似歌手 */
export const simiArtist = (id: number | string) =>
  neteaseBrowse<{ code: number; artists?: any[] }>("/simi/artist", { params: { id } });

/** 相似歌单 */
export const simiPlaylist = (id: number | string) =>
  neteaseBrowse<{ code: number; playlists?: any[] }>("/simi/playlist", { params: { id } });

/** 相似 MV */
export const simiMv = (mvid: number | string) =>
  neteaseBrowse<{ code: number; mvs?: NeteaseMvBrief[] }>("/simi/mv", { params: { mvid } });

/** 听了这首歌的用户（最近 5 个） */
export const simiUser = (id: number | string) => neteaseBrowse("/simi/user", { params: { id } });

/* -------------------------------------------------------------------- 会员 */

/** 获取 VIP 信息（新版） */
export const vipInfoV2 = (uid?: number) =>
  neteaseApi<NeteaseVipInfo>("/vip/info/v2", { params: { uid } });

/** 获取 VIP 信息（旧版） */
export const vipInfo = (uid?: number) => neteaseApi("/vip/info", { params: { uid } });

/** 会员成长值 */
export const vipGrowthPoint = () => neteaseApi<NeteaseVipGrowthPoint>("/vip/growthpoint");

/** 会员成长值领取记录 */
export const vipGrowthPointDetails = () => neteaseApi("/vip/growthpoint/details");

/** 领取会员成长值 */
export const vipGrowthPointGet = () => neteaseApi("/vip/growthpoint/get", { method: "post" });

/** 会员任务 */
export const vipTasks = () => neteaseApi<{ code: number; data?: NeteaseVipTask[] }>("/vip/tasks");

/** 黑胶时光机 */
export const vipTimemachine = () => neteaseApi("/vip/timemachine");

/* --------------------------------------------------------------- 云贝与签到 */

/** 云贝账户信息 */
export const yunbeiInfo = () => neteaseApi<NeteaseYunbeiInfo>("/yunbei/info");

/** 云贝今日签到信息 */
export const yunbeiToday = () => neteaseApi("/yunbei/today");

/** 云贝签到 */
export const yunbeiSign = () => neteaseApi("/yunbei/sign", { method: "post" });

/** 云贝所有任务 */
export const yunbeiTasks = () =>
  neteaseApi<{ code: number; data?: NeteaseYunbeiTask[] }>("/yunbei/tasks");

/** 云贝 todo 任务 */
export const yunbeiTasksTodo = () =>
  neteaseApi<{ code: number; data?: NeteaseYunbeiTask[] }>("/yunbei/tasks/todo");

/** 云贝完成任务 */
export const yunbeiTaskFinish = (taskId: number | string) =>
  neteaseApi("/yunbei/task/finish", { method: "post", params: { taskId } });

/** 云贝收入明细 */
export const yunbeiReceipt = (limit = 20, offset = 0) =>
  neteaseApi("/yunbei/receipt", { params: { limit, offset } });

/** 云贝支出 */
export const yunbeiExpense = (limit = 20, offset = 0) =>
  neteaseApi("/yunbei/expense", { params: { limit, offset } });

/** 云贝推歌 */
export const yunbeiRcmdSong = (songId: number | string, userId: number | string, reason = "") =>
  neteaseApi("/yunbei/rcmd/song", { params: { songId, userId, reason } });

/** 签到进度 */
export const signinProgress = () => neteaseApi("/signin/progress");

/** 乐签信息 */
export const signHappyInfo = () => neteaseApi("/sign/happy/info");

/** 每日签到（0：安卓端 / 1：PC 端） */
export const dailySignin = (type: 0 | 1 = 1) => neteaseApi("/daily_signin", { params: { type } });

/* -------------------------------------------------------------------- 消息 */

/** 私信（会话列表） */
export const msgPrivate = (limit = 30, offset = 0) =>
  neteaseApi<{ code: number; msgs?: NeteaseMessageItem[] }>("/msg/private", {
    params: { limit, offset },
  });

/** 私信内容 */
export const msgPrivateHistory = (uid: number, limit = 30, before?: number) =>
  neteaseApi("/msg/private/history", { params: { uid, limit, before } });

/** 通知 - 评论 */
export const msgComments = (limit = 30, offset = 0) =>
  neteaseApi<{ code: number; comments?: NeteaseMessageItem[] }>("/msg/comments", {
    params: { limit, offset },
  });

/** 通知 - @我 */
export const msgForwards = (limit = 30, offset = 0) =>
  neteaseApi<{ code: number; forwards?: NeteaseMessageItem[] }>("/msg/forwards", {
    params: { limit, offset },
  });

/** 通知 - 通知 */
export const msgNotices = (limit = 30, offset = 0) =>
  neteaseApi<{ code: number; notices?: NeteaseMessageItem[] }>("/msg/notices", {
    params: { limit, offset },
  });

/** 最近联系人 */
export const msgRecentContact = () =>
  neteaseApi<{ code: number; data?: NeteaseMessageItem[] }>("/msg/recentcontact");

/** 发送私信（文本）—— 内容走 POST body，避免出现在 URL / 访问日志中 */
export const sendText = (userIds: string, msg: string) =>
  neteaseApi("/send/text", { method: "post", data: { userIds, msg }, timestamp: false });

/** 发送私信（歌曲）—— 同上，走 POST body */
export const sendSong = (userIds: string, id: number | string, msg = "") =>
  neteaseApi("/send/song", { method: "post", data: { userIds, id, msg }, timestamp: false });

/** 发送私信（歌单）—— 同上，走 POST body */
export const sendPlaylist = (userIds: string, playlist: number | string, msg = "") =>
  neteaseApi("/send/playlist", {
    method: "post",
    data: { userIds, playlist, msg },
    timestamp: false,
  });

/* ---------------------------------------------------------------- 用户与社交 */

/** 用户详情 */
export const userDetail = (uid: number) =>
  neteaseApi<{ code: number; profile?: NeteaseUserProfile; level?: number; listenSongs?: number }>(
    "/user/detail",
    { params: { uid } },
  );

/** 用户歌单 */
export const userPlaylist = (uid: number, limit = 50, offset = 0) =>
  neteaseApi("/user/playlist", { params: { uid, limit, offset } });

/** 用户听歌排行（type：0 所有时间 / 1 最近一周） */
export const userRecord = (uid: number, type: 0 | 1 = 1) =>
  neteaseApi<{
    code: number;
    allData?: NeteaseUserRecordSong[];
    weekData?: NeteaseUserRecordSong[];
  }>("/user/record", { params: { uid, type } });

/** 用户关注列表 */
export const userFollows = (uid: number, limit = 30, offset = 0) =>
  neteaseApi("/user/follows", { params: { uid, limit, offset } });

/** 用户粉丝列表 */
export const userFolloweds = (uid: number, limit = 30, offset = 0) =>
  neteaseApi("/user/followeds", { params: { uid, limit, offset } });

/** 关注 / 取关用户（t：1 关注 / 2 取消关注） */
export const follow = (id: number, t: 1 | 2 = 1) =>
  neteaseApi("/follow", { method: "post", params: { id, t } });

/** 用户动态 */
export const userEvent = (uid: number, limit = 30, lasttime = -1) =>
  neteaseApi("/user/event", { params: { uid, limit, lasttime } });

/** 动态（好友动态列表） */
export const event = (limit = 30, lasttime = -1) =>
  neteaseApi("/event", { params: { limit, lasttime } });

/** 用户云盘 */
export const userCloud = (limit = 30, offset = 0) =>
  neteaseApi("/user/cloud", { params: { limit, offset } });

/** 用户订阅数量（歌单 / 收藏 / MV / DJ） */
export const userSubcount = () => neteaseApi("/user/subcount");

/** 用户等级 */
export const userLevel = () => neteaseApi("/user/level");

/** 用户绑定信息 */
export const userBinding = (uid?: number) => neteaseApi("/user/binding", { params: { uid } });

/** 用户账号信息 */
export const userAccount = () => neteaseApi("/user/account");

/* ---------------------------------------------------------------- MV / 视频 */

/** MV 详情 */
export const mvDetail = (mvid: number | string) =>
  neteaseBrowse<{ code: number; data?: NeteaseMvDetail; subed?: boolean }>("/mv/detail", {
    params: { mvid },
  });

/** MV 点赞 / 转发 / 评论数 */
export const mvDetailInfo = (mvid: number | string) =>
  neteaseBrowse("/mv/detail/info", { params: { mvid } });

/** MV 播放地址（r：分辨率，如 480 / 720 / 1080） */
export const mvUrl = (id: number | string, r = 1080) =>
  neteaseBrowse<{ code: number; data?: { id: number; url: string; r: number; size: number } }>(
    "/mv/url",
    {
      params: { id, r },
    },
  );

/** 收藏 / 取消收藏 MV（t：1 收藏 / 0 取消） */
export const mvSub = (mvid: number | string, t: 0 | 1 = 1) =>
  neteaseApi("/mv/sub", { method: "post", params: { mvid, t } });

/** 全部 MV */
export const mvAll = (area = "全部", type = "全部", order = "上升最快", limit = 30, offset = 0) =>
  neteaseBrowse("/mv/all", { params: { area, type, order, limit, offset } });

/** 最新 MV */
export const mvFirst = (area = "", limit = 30) =>
  neteaseBrowse("/mv/first", { params: { area, limit } });

/** 网易出品 MV */
export const mvExclusiveRcmd = (limit = 30, offset = 0) =>
  neteaseBrowse("/mv/exclusive/rcmd", { params: { limit, offset } });

/** 推荐 MV */
export const personalizedMv = () =>
  neteaseBrowse<{ code: number; result?: NeteaseMvBrief[] }>("/personalized/mv");

/** MV 排行 */
export const topMv = (limit = 30, offset = 0) =>
  neteaseBrowse("/top/mv", { params: { limit, offset } });

/** 收藏的 MV 列表 */
export const mvSublist = (limit = 30, offset = 0) =>
  neteaseApi("/mv/sublist", { params: { limit, offset } });

/** 视频详情 */
export const videoDetail = (id: string) => neteaseBrowse("/video/detail", { params: { id } });

/** 视频播放地址 */
export const videoUrl = (id: string) => neteaseBrowse("/video/url", { params: { id } });

/** 视频分类列表 */
export const videoCategoryList = () => neteaseBrowse("/video/category/list");

/** 视频标签列表 */
export const videoGroupList = () => neteaseBrowse("/video/group/list");

/** 推荐视频（视频时间线） */
export const videoTimelineRecommend = (offset = 0) =>
  neteaseBrowse("/video/timeline/recommend", { params: { offset } });

/** 全部视频（按标签） */
export const videoTimelineAll = (tagId = 0, offset = 0) =>
  neteaseBrowse("/video/timeline/all", { params: { tagId, offset } });

/** 相关视频 */
export const relatedAllvideo = (id: string) =>
  neteaseBrowse("/related/allvideo", { params: { id } });

/* ---------------------------------------------------------------- 听歌识曲 */

/**
 * 听歌识曲（上传音频指纹，返回匹配到的歌曲）
 * @param duration 音频时长（秒）
 * @param audioFP 音频指纹（base64）
 */
export const audioMatch = (duration: number, audioFP: string) =>
  neteaseApi<NeteaseAudioMatchResult>("/audio/match", { params: { duration, audioFP } });

/** 音乐是否可用检查 */
export const checkMusic = (id: number | string, br = 999000) =>
  neteaseApi("/check/music", { params: { id, br } });

/* ------------------------------------------------------- 最近播放与其他 */

/** 最近播放 - 歌曲 */
export const recordRecentSong = () => neteaseApi("/record/recent/song");

/** 最近播放 - 视频 */
export const recordRecentVideo = () => neteaseApi("/record/recent/video");

/** 最近播放 - 声音 */
export const recordRecentVoice = () => neteaseApi("/record/recent/voice");

/** 最近播放 - 歌单 */
export const recordRecentPlaylist = () => neteaseApi("/record/recent/playlist");

/** 最近播放 - 专辑 */
export const recordRecentAlbum = () => neteaseApi("/record/recent/album");

/** 最近播放 - 播客 */
export const recordRecentDj = () => neteaseApi("/record/recent/dj");

/** 回忆坐标（首次听某首歌的信息） */
export const musicFirstListenInfo = (songId: number | string) =>
  neteaseApi("/music/first/listen/info", { params: { songId } });

/* ---------------------------------------------------------------- 数字专辑 */

/** 数字专辑详情 */
export const digitalAlbumDetail = (id: number | string) =>
  neteaseBrowse("/digitalAlbum/detail", { params: { id } });

/** 已购数字专辑 */
export const digitalAlbumPurchased = (limit = 30, offset = 0) =>
  neteaseApi("/digitalAlbum/purchased", { params: { limit, offset } });

/** 数字专辑 - 新碟上架 */
export const albumList = (limit = 30, offset = 0) =>
  neteaseBrowse("/album/list", { params: { limit, offset } });

/** 全部新碟 */
export const albumNew = (area = "ALL", limit = 30, offset = 0) =>
  neteaseBrowse("/album/new", { params: { area, limit, offset } });

/* ------------------------------------------------------------------ 播客 */

/** 播客搜索 */
export const voicelistSearch = (keyword: string, limit = 30, offset = 0) =>
  neteaseBrowse("/voicelist/search", { params: { keyword, limit, offset } });

/** 播客声音列表 */
export const voicelistList = (voiceListId: number | string, limit = 30, offset = 0) =>
  neteaseBrowse("/voicelist/list", { params: { voiceListId, limit, offset } });

/** 声音详情 */
export const voiceDetail = (id: number | string) =>
  neteaseBrowse("/voice/detail", { params: { id } });

/** 声音歌词 */
export const voiceLyric = (id: number | string) =>
  neteaseBrowse("/voice/lyric", { params: { id } });

/* ------------------------------------------------------------ 电台榜单/推荐 */

/** 热门电台 */
export const djHot = (limit = 30, offset = 0) =>
  neteaseBrowse<{ code: number; djRadios?: NeteaseDjItem[]; hasMore?: boolean }>("/dj/hot", {
    params: { limit, offset },
  });

/** 推荐电台 */
export const djRecommend = () =>
  neteaseBrowse<{ code: number; djRadios?: NeteaseDjItem[] }>("/dj/recommend");

/** 电台节目榜 */
export const djProgramToplist = (limit = 30, offset = 0) =>
  neteaseBrowse<{ code: number; toplist?: any[]; updateTime?: number }>("/dj/program/toplist", {
    params: { limit, offset },
  });

/** 电台 24 小时节目榜 */
export const djProgramToplistHours = () =>
  neteaseBrowse<{ code: number; data?: any }>("/dj/program/toplist/hours");

/** 电台付费精品榜 */
export const djPaygift = (limit = 30, offset = 0) =>
  neteaseBrowse<{ code: number; data?: any[] }>("/dj/paygift", { params: { limit, offset } });

/** 电台今日优选 */
export const djTodayPerfered = () =>
  neteaseBrowse("/dj/today/perfered", { params: { limit: 30, offset: 0 } });

/** 电台详情 */
export const djDetail = (rid: number | string) =>
  neteaseBrowse<{ code: number; data?: any }>("/dj/detail", { params: { rid } });

/** 电台节目列表 */
export const djProgram = (rid: number | string, limit = 30, offset = 0, asc = false) =>
  neteaseBrowse("/dj/program", { params: { rid, limit, offset, asc } });

/** 电台节目详情 */
export const djProgramDetail = (id: number | string) =>
  neteaseBrowse<{ code: number; data?: any; program?: any }>("/dj/program/detail", {
    params: { id },
  });

/** 数字专辑 - 语种风格馆 */
export const albumListStyle = (limit = 30, offset = 0) =>
  neteaseBrowse<{ code: number; albumProducts?: NeteaseDigitalAlbum[] }>("/album/list/style", {
    params: { limit, offset },
  });

/** 专辑销量榜（付费专辑榜） */
export const albumSongsaleboard = (albumType = 0, type = "daily", year?: number) =>
  neteaseBrowse("/album/songsaleboard", { params: { albumType, type, year } });
