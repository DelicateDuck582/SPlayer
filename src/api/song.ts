import { isElectron } from "@/utils/env";
import { defaultAMLLDbServer, songLevelData } from "@/utils/meta";
import { SongUnlockServer } from "@/core/player/SongManager";
import { useSettingStore } from "@/stores";
import request from "@/utils/request";

// 获取歌曲详情
export const songDetail = (ids: number | number[]) => {
  return request({
    url: "/song/detail",
    method: "post",
    params: { timestamp: Date.now() },
    data: { ids: Array.isArray(ids) ? ids.join(",") : ids.toString() },
  });
};

/**
 * 歌曲音质详情
 * @param id 歌曲 id
 */
export const songQuality = (id: number) => {
  return request({
    url: "/song/music/detail",
    params: { id },
  });
};

/** 取链 IP 选项：API 服务出口 IP 被风控时可用 randomCNIP / realIP 规避 */
export interface SongUrlIpOptions {
  randomCNIP?: boolean;
  realIP?: string;
}

/** 将 IP 选项转换为请求参数 */
const toIpParams = (options?: SongUrlIpOptions) => {
  if (options?.realIP) return { realIP: options.realIP };
  if (options?.randomCNIP) return { randomCNIP: true };
  return {};
};

// 获取歌曲 URL
export const songUrl = (
  id: number,
  level:
    | "standard"
    | "higher"
    | "exhigh"
    | "lossless"
    | "hires"
    | "jyeffect"
    | "sky"
    | "dolby"
    | "jymaster" = "exhigh",
  options?: SongUrlIpOptions,
) => {
  const ipParams = toIpParams(options);
  // 杜比全景声使用旧版接口，并传入特殊参数
  if (level === "dolby") {
    return request({
      url: "/song/url",
      params: {
        id,
        br: 999000,
        immerseType: "c51",
        timestamp: Date.now(),
        ...ipParams,
      },
    });
  }

  return request({
    url: "/song/url/v1",
    params: {
      id,
      level,
      timestamp: Date.now(),
      ...ipParams,
    },
  });
};

/**
 * 通过 API 服务匹配歌曲直链（api-enhanced 的 `/song/url/match`）
 * - 由 API 服务端完成匹配/解锁：免费曲目返回官方外链，VIP 曲目可直接返回 CDN 直链
 * - 不依赖本体自建的 `/api/unblock` 服务，因此网页端同样可用
 * @param id 歌曲 id
 * @param options 取链 IP 选项
 */
export const songUrlMatch = (id: number, options?: SongUrlIpOptions) => {
  return request({
    url: "/song/url/match",
    params: {
      id,
      timestamp: Date.now(),
      ...toIpParams(options),
    },
  });
};

// 获取解锁歌曲 URL
export const unlockSongUrl = async (
  id: number,
  keyword: string,
  server: SongUnlockServer,
  songName?: string,
  artist?: string,
) => {
  // NETEASE 源优先走 API 服务的 /song/url/match（网页端与客户端都可用），
  // 失败时再回退本体自建解锁服务（仅客户端/自建服务可用）
  if (server === SongUnlockServer.NETEASE) {
    try {
      const matched: any = await songUrlMatch(id);
      const matchedUrl = typeof matched?.data === "string" ? matched.data : "";
      if (matchedUrl) {
        return {
          code: 200,
          url: matchedUrl,
          type: matchedUrl.toLowerCase().includes(".flac") ? "flac" : "mp3",
        };
      }
    } catch (error) {
      console.warn("song/url/match 不可用，回退 /api/unblock/netease", error);
    }
    return request({
      baseURL: "/api/unblock",
      url: `/${server}`,
      params: { id, noCookie: true },
    });
  }
  return request({
    baseURL: "/api/unblock",
    url: `/${server}`,
    params: { keyword, songName, artist, noCookie: true },
  });
};

// 获取歌曲歌词
export const songLyric = (id: number) => {
  return request({
    url: "/lyric/new",
    params: {
      id,
    },
  });
};

/**
 * 获取歌曲 TTML 歌词
 * 说明：api-enhanced **未提供** `/lyric/ttml` 路由（远端会返回 404），因此改为：
 * 1) 优先读取 AMLL TTML DB（网页端与客户端一致）
 * 2) 客户端再回退本体自建的本机服务 `/api/netease/lyric/ttml`
 * @param id 音乐 id
 * @returns TTML 格式歌词；均不可用时返回 null
 */
export const songLyricTTML = async (id: number) => {
  const settingStore = useSettingStore();
  const server = settingStore.amllDbServer || defaultAMLLDbServer;
  const url = server.replace("%s", String(id));
  try {
    const response = await fetch(url);
    if (response && response.status === 200) {
      const data = await response.text();
      if (data && data.trim().length > 0) return data;
    }
  } catch (error) {
    console.warn("AMLL TTML DB 获取失败，尝试本机服务", error);
  }
  // 客户端回退：本机内嵌服务（SPlayer 自身实现，不依赖远端 API 路由）
  if (isElectron) {
    try {
      const port = import.meta.env["VITE_SERVER_PORT"] || 25884;
      const response = await fetch(`http://127.0.0.1:${port}/api/netease/lyric/ttml?id=${id}`);
      if (response.status === 200) {
        const data = await response.text();
        if (data && data.trim().length > 0) return data;
      }
    } catch (error) {
      console.warn("本机 TTML 服务不可用", error);
    }
  }
  return null;
};

/**
 * 获取歌曲下载链接
 * @param id 音乐 id
 * @param level 播放音质等级, 分为 standard => 标准,higher => 较高, exhigh=>极高, lossless=>无损, hires=>Hi-Res, jyeffect => 高清环绕声, sky => 沉浸环绕声, `dolby` => `杜比全景声`, jymaster => 超清母带
 * @param options 取链 IP 选项（用于取链失败时重试）
 * @returns
 */
export const songDownloadUrl = (
  id: number,
  level: keyof typeof songLevelData = "h",
  options?: SongUrlIpOptions,
) => {
  // 获取对应音质
  const levelName = songLevelData[level].level;
  return request({
    url: "/song/download/url/v1",
    params: { id, level: levelName, timestamp: Date.now(), ...toIpParams(options) },
  });
};

// 喜欢歌曲
export const likeSong = (id: number, like: boolean = true) => {
  return request({
    url: "/like",
    params: { id, like, timestamp: Date.now() },
  });
};

/**
 * 本地歌曲文件匹配
 * @param {string} title - 文件的标题信息，是文件属性里的标题属性，并非文件名
 * @param {string} album - 文件的专辑信息
 * @param {string} artist - 文件的艺术家信息
 * @param {number} duration - 文件的时长，单位为秒
 * @param {string} md5 - 文件的 md5
 */

export const matchSong = (
  title: string,
  artist: string,
  album: string,
  duration: number,
  md5: string,
) => {
  return request({
    url: "/search/match",
    params: { title, artist, album, duration, md5 },
  });
};

/**
 * 歌曲动态封面
 * @param {number} id - 歌曲 id
 */
export const songDynamicCover = (id: number) => {
  return request({
    url: "/song/dynamic/cover",
    params: { id },
  });
};

/**
 * 副歌时间
 * @param {number} id - 歌曲 id
 */
export const songChorus = (id: number) => {
  return request({
    url: "/song/chorus",
    params: { id },
  });
};

/**
 * 歌曲百科 - 简要信息
 * @param {number} id - 歌曲 id
 */
export const songWikiSummary = (id: number) => {
  return request({
    url: "/song/wiki/summary",
    params: { id },
  });
};

/**
 * 乐谱列表
 * @description 通过歌曲 id 获取该歌曲下的乐谱列表
 */
export const songSheetList = (id: number) => {
  return request({
    url: "/sheet/list",
    params: { id },
  });
};

/**
 * 乐谱内容预览
 * @description 通过乐谱 id 获取乐谱的完整内容
 */
export const songSheetPreview = (id: number) => {
  return request({
    url: "/sheet/preview",
    params: { id },
  });
};

/**
 * 回忆坐标信息
 * @description 获取当前歌曲的回忆坐标信息（同手机 APP 百科页的回忆坐标功能）
 * @param id 歌曲 ID
 */
export const songFirstListenInfo = (id: number) => {
  return request({
    url: "/music/first/listen/info",
    params: { id },
  });
};
