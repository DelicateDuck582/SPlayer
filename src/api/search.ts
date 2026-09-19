import request from "@/utils/request";
import {
  isKugouSource,
  kugouSearchCompat,
  kugouSearchDefaultCompat,
  kugouSearchHotCompat,
} from "@/api/kugou";
import { isQqSource, qqSearchCompat, qqSearchHotCompat } from "@/api/qq";

// 搜索类型枚举
export enum SearchTypes {
  Single = 1,
  Album = 10,
  Artist = 100,
  Playlist = 1000,
  User = 1002,
  Mv = 1004,
  Lyrics = 1006,
  Radio = 1009,
  Video = 1014,
  All = 1018,
  Audio = 2000,
}

// 热搜（酷狗 / QQ 源分别走对应平台的热搜接口，归一化为网易云形状）
export const searchHot = () => {
  if (isKugouSource()) return kugouSearchHotCompat();
  if (isQqSource()) return qqSearchHotCompat();
  return request({
    url: "/search/hot/detail",
  });
};

// 搜索建议
export const searchSuggest = (keywords: string, mobile: boolean = false) => {
  // 酷狗 / QQ 源：无稳定可用的匿名联想接口，直接返回空结果（页面退化为无联想词）
  if (isKugouSource() || isQqSource()) {
    return Promise.resolve({
      code: 200,
      result: { allMatch: [], albums: [], artists: [], songs: [], order: [] },
    });
  }
  return request({
    url: "/search/suggest",
    params: {
      keywords,
      ...(mobile && { type: "mobile" }),
    },
  });
};

// 搜索多重匹配
export const searchMultimatch = (keywords: string) => {
  return request({
    url: "/search/multimatch",
    params: {
      keywords,
    },
  });
};

// 默认搜索关键词
export const searchDefault = () => {
  if (isKugouSource()) return kugouSearchDefaultCompat();
  // QQ 音乐无「默认关键词」接口：用固定占位，避免误请求网易云
  if (isQqSource())
    return Promise.resolve({
      code: 200,
      data: { showKeyword: "热门歌曲", realkeyword: "热门歌曲" },
    });
  return request({
    url: "/search/default",
    params: {
      timestamp: Date.now(),
    },
  });
};

// 搜索结果
export const searchResult = (
  keywords: string,
  limit: number = 50,
  offset = 0,
  type: SearchTypes = SearchTypes.All,
) => {
  // 音乐源为酷狗 / QQ 时改走对应平台搜索，结果归一化为网易云 /cloudsearch 形状，
  // 各搜索 Tab（单曲/歌手/专辑/歌单）无需改动即可渲染
  if (isKugouSource()) return kugouSearchCompat(keywords, limit, offset, type);
  if (isQqSource()) return qqSearchCompat(keywords, limit, offset, type);
  return request({
    url: "/cloudsearch",
    params: {
      keywords,
      limit,
      offset,
      type,
    },
  });
};
