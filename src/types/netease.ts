/**
 * npm 版 NeteaseCloudMusicApi 相关响应类型
 *
 * 说明：上游返回体字段极多，这里只声明本项目实际渲染用到的字段（其余字段按需扩展），
 * 并对可能缺失的字段统一标为可选，页面渲染时做兜底处理。
 */

/** 歌手 / 用户等通用精简对象 */
export interface NeteaseArtistBrief {
  id: number;
  name: string;
}

/** 专辑精简对象 */
export interface NeteaseAlbumBrief {
  id: number;
  name: string;
  picUrl?: string;
}

/* ---------------------------------------------------------------- 音乐日历 */

/** 音乐日历中的一首歌 */
export interface NeteaseCalendarSong {
  id: number;
  name: string;
  /** 当天播放次数 */
  playCount?: number;
  ar?: NeteaseArtistBrief[];
  al?: NeteaseAlbumBrief;
}

/** 音乐日历 - 某一天 */
export interface NeteaseCalendarDay {
  /** 日期（yyyy-MM-dd） */
  date: string;
  songs?: NeteaseCalendarSong[];
  /** 上游部分版本会返回该字段表示当天总播放量 */
  count?: number;
}

/** 音乐日历响应 */
export interface NeteaseCalendarResult {
  code: number;
  /** 按天聚合的日历数据 */
  data?: NeteaseCalendarDay[] | Record<string, NeteaseCalendarDay>;
  message?: string;
}

/* ------------------------------------------------------------ 听歌足迹/统计 */

/** 总收听时长 */
export interface NeteaseListenTotal {
  code: number;
  data?: {
    /** 累计收听时长（毫秒） */
    totalDuration?: number;
    /** 累计听歌数量 */
    listenSongs?: number;
  };
}

/** 今日收听 */
export interface NeteaseListenToday {
  code: number;
  data?: {
    /** 今日收听歌曲 */
    songs?: Array<{ songId: number; songName: string; playCount?: number }>;
  };
}

/** 周/月/年收听报告 */
export interface NeteaseListenReport {
  code: number;
  data?: {
    /** 报告开始时间 */
    startTime?: number;
    /** 报告结束时间 */
    endTime?: number;
    /** 收听时长（毫秒） */
    duration?: number;
    /** 收听的歌曲数 */
    songCount?: number;
  };
}

/* -------------------------------------------------------------------- 曲风 */

/** 曲风标签（含子标签） */
export interface NeteaseStyleTag {
  tagId: number;
  tagName: string;
  enName?: string;
  level?: number;
  picUrl?: string;
  colorDeep?: string;
  colorShallow?: string;
  /** 子曲风 */
  childrenTags?: NeteaseStyleTag[];
}

/** 曲风详情 */
export interface NeteaseStyleDetail {
  tagId: number;
  name: string;
  level?: number;
  parentNames?: string[];
  enName?: string;
  desc?: string;
  cover?: string;
  songNum?: number;
  artistNum?: number;
  playRate?: number;
  /** 代表歌曲 */
  favouriteSong?: { id: number; name: string };
}

/* -------------------------------------------------------------------- 会员 */

/** VIP 信息（/vip/info/v2） */
export interface NeteaseVipInfo {
  code: number;
  data?: {
    /** 是否黑胶 VIP */
    redVipLevel?: number;
    /** 是否黑胶 SVIP */
    redVipAnnualCount?: number;
    musicPackage?: { vipCode?: number; vipLevel?: number; expireTime?: number };
    redPlus?: { vipCode?: number; expireTime?: number };
    associator?: { vipCode?: number; vipName?: string };
  };
}

/** 会员成长值 */
export interface NeteaseVipGrowthPoint {
  code: number;
  data?: {
    /** 当前成长值 */
    progress?: number;
    /** 等级 */
    level?: number;
    /** 当日已获取 */
    todayGrowthPoint?: number;
    /** 可领取成长值 */
    obtainableGrowthPoint?: number;
  };
}

/** 会员任务 */
export interface NeteaseVipTask {
  /** 任务名 */
  taskName?: string;
  /** 是否已完成 */
  completed?: boolean;
  /** 可领取的成长值 */
  growthPoint?: number;
  /** 任务描述 */
  description?: string;
}

/* ------------------------------------------------------------------ 云贝 */

/** 云贝账户信息 */
export interface NeteaseYunbeiInfo {
  code: number;
  /** 云贝余额 */
  userPoint?: number;
  /** 会员等级 */
  level?: number;
  /** 移动端是否已签到 */
  mobileSign?: boolean;
  /** PC 端是否已签到 */
  pcSign?: boolean;
  /** 会员类型 */
  viptype?: string;
}

/** 云贝任务 */
export interface NeteaseYunbeiTask {
  /** 任务 id */
  taskId?: number;
  /** 任务名 */
  taskName?: string;
  /** 任务描述 */
  description?: string;
  /** 是否已完成 */
  completed?: boolean;
  /** 奖励云贝数 */
  reward?: number;
  /** 状态文本（上游字段不一，做兼容） */
  statusText?: string;
}

/* -------------------------------------------------------------- 消息与社交 */

/** 消息会话 / 通知条目（私信、评论、@我、通知通用） */
export interface NeteaseMessageItem {
  /** 唯一 id（私信为 userId，评论/通知为 id） */
  id?: number;
  /** 发送者用户 id（私信） */
  userId?: number;
  /** 标题（通知类） */
  title?: string;
  /** 内容摘要 */
  lastMessage?: string;
  /** 时间（时间戳或已格式化的时间字符串） */
  time?: number | string;
  /** 未读数 */
  unreadCount?: number;
  /** 发送者昵称 */
  nickname?: string;
  /** 发送者头像 */
  avatarUrl?: string;
}

/** 用户资料 */
export interface NeteaseUserProfile {
  userId: number;
  nickname: string;
  avatarUrl?: string;
  backgroundUrl?: string;
  signature?: string;
  /** 粉丝数 */
  follows?: number;
  /** 关注数（上游语义：followeds 为粉丝，follows 为关注） */
  followeds?: number;
  eventCount?: number;
  playlistCount?: number;
  level?: number;
  listenSongs?: number;
  createTime?: number;
  /** 是否已关注 */
  followed?: boolean;
}

/** 用户播放记录（听歌排行） */
export interface NeteaseUserRecordSong {
  playCount: number;
  score?: number;
  song: {
    id: number;
    name: string;
    ar?: NeteaseArtistBrief[];
    al?: NeteaseAlbumBrief;
    dt?: number;
  };
}

/* ---------------------------------------------------------------- MV / 视频 */

/** 视频条目（视频时间线 / 视频详情） */
export interface NeteaseVideoItem {
  /** 视频 id（字符串，非数字） */
  vid: string;
  title?: string;
  coverUrl?: string;
  /** 时长（毫秒） */
  durationms?: number;
  /** 播放次数 */
  playTime?: number;
  /** 点赞数 */
  praisedCount?: number;
  /** 评论数 */
  commentCount?: number;
  description?: string;
  creator?: { nickname?: string; avatarUrl?: string; userId?: number };
}

/* ---------------------------------------------------------------- 数字专辑 */

/** 数字专辑（新碟上架 / 已购） */
export interface NeteaseDigitalAlbum {
  albumId: number;
  albumName: string;
  artistName?: string;
  artistId?: number;
  /** 价格（分） */
  price?: number;
  coverUrl?: string;
  pubTime?: number;
  /** 销量 */
  saleNum?: number;
  /** 1：专辑 2：单曲 */
  albumType?: number;
}

/* ------------------------------------------------------------ 电台 / 播客 */

/** 电台（榜单 / 推荐）条目，上游各榜单字段不完全一致，这里做兼容 */
export interface NeteaseDjItem {
  id: number;
  name?: string;
  picUrl?: string;
  coverUrl?: string;
  /** 主播昵称 */
  djNickname?: string;
  nickname?: string;
  /** 订阅数 / 播放数 */
  subCount?: number;
  playCount?: number;
  programCount?: number;
  desc?: string;
  /** 榜单排名 */
  rank?: number;
  /** 节目所属电台名 */
  radioName?: string;
  radio?: { name?: string; picUrl?: string };
  dj?: { nickname?: string; avatarUrl?: string };
}

/** MV 详情 */
export interface NeteaseMvDetail {
  id: number;
  name: string;
  artistId?: number;
  artistName?: string;
  briefDesc?: string;
  desc?: string;
  cover?: string;
  playCount?: number;
  subCount?: number;
  shareCount?: number;
  commentCount?: number;
  duration?: number;
  publishTime?: string;
  artists?: NeteaseArtistBrief[];
  commentThreadId?: string;
}

/** MV 精简对象（相似 MV / 推荐 MV） */
export interface NeteaseMvBrief {
  id: number;
  name: string;
  cover?: string;
  picUrl?: string;
  playCount?: number;
  artistName?: string;
  duration?: number;
  briefDesc?: string;
}

/* ---------------------------------------------------------------- 听歌识曲 */

/** 听歌识曲匹配结果 */
export interface NeteaseAudioMatchResult {
  code: number;
  data?: {
    /** 匹配到的歌曲 */
    result?: {
      song?: {
        id: number;
        name: string;
        artists?: NeteaseArtistBrief[];
        album?: NeteaseAlbumBrief;
      };
      /** 匹配得分 */
      score?: number;
    };
  };
  /** 上游失败时的提示 */
  message?: string;
}
