import request from "@/utils/request";
import {
  isKugouSource,
  kugouSearchCompat,
  kugouSearchDefaultCompat,
  kugouSearchHotCompat,
} from "@/api/kugou";

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

// 热搜（酷狗源走酷狗热搜，归一化为网易云 /search/hot/detail 形状）
export const searchHot = () => {
  if (isKugouSource()) return kugouSearchHotCompat();
  return request({
    url: "/search/hot/detail",
  });
};

// 搜索建议
export const searchSuggest = (keywords: string, mobile: boolean = false) => {
  // 酷狗源：「搜索建议」无稳定可用的匿名接口，直接返回空结果（页面退化为无联想词）
  if (isKugouSource()) {
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
  // 音乐源为酷狗时改走酷狗搜索，结果归一化为网易云 /cloudsearch 形状，
  // 各搜索 Tab（单曲/歌手/专辑/歌单）无需改动即可渲染
  if (isKugouSource()) return kugouSearchCompat(keywords, limit, offset, type);
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
