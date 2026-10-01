import { debugLog } from "./log";
import { useDataStore, useSettingStore } from "@/stores";

type StorageType = "localStorage" | "sessionStorage";

/** 缓存键统一前缀（便于按账户整体失效） */
const CACHE_PREFIX = "splayer:cache:";

/**
 * 当前账户作用域：音乐源 + 账户 id（未登录为 anon）
 *
 * 首页推荐等接口结果与账户绑定，缓存键必须按账户隔离，
 * 否则切换账号（A → B）会命中上一账户的缓存，看起来像「数据没换」。
 */
export const accountScope = (): string => {
  try {
    const settingStore = useSettingStore();
    const source = settingStore.musicSource;
    if (source === "kugou") return `kugou:${settingStore.kugouUser?.userid || "anon"}`;
    if (source === "qq") return `qq:${settingStore.qqUser?.uin || "anon"}`;
    return `netease:${useDataStore().userData?.userId || "anon"}`;
  } catch {
    // pinia 未就绪（极早期调用）时按未登录处理
    return "anon";
  }
};

/** 生成带账户作用域的存储键 */
const scopedKey = (key: string): string => `${CACHE_PREFIX}${accountScope()}:${key}`;

/**
 * 清理账户级缓存（登出 / 切换账号时调用）
 * @param scope 指定账户作用域时只清该账户，缺省清理全部账户
 */
export const clearCacheData = (scope?: string): void => {
  const prefix = scope ? `${CACHE_PREFIX}${scope}:` : CACHE_PREFIX;
  (["sessionStorage", "localStorage"] as StorageType[]).forEach((name) => {
    try {
      const storage = window[name];
      Object.keys(storage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => storage.removeItem(key));
    } catch {
      // 存储不可用（隐私模式等）时忽略
    }
  });
};

interface CacheOptions {
  key: string;
  time: number; // 缓存时长，单位为分钟
  storage?: StorageType; // 默认为 sessionStorage
  useCache?: boolean; // 是否使用缓存，默认为 true
}

/**
 * 获取接口请求缓存
 * @template T
 * @param {(...args: any[]) => Promise<T>} promiseFunc - 异步请求函数
 * @param {Object} options - 缓存选项
 * @param {string} options.key - 用于存储和检索缓存数据的键值
 * @param {number} options.time - 缓存有效时间（分钟）。如果为 -1，则表示永久有效
 * @param {string} [options.storage="sessionStorage"] - 储存方式，默认为 `sessionStorage`，可选 `localStorage`
 * @param {...any} args - 传递的参数
 * @returns {Promise<T>}
 * @returns
 */
export const getCacheData = async <T>(
  promiseFunc: (...args: any[]) => Promise<T>,
  options: CacheOptions,
  ...args: any[]
): Promise<T> => {
  const { key, time, storage = "sessionStorage", useCache = true } = options;
  // 储存方式
  const storageObj = window[storage];
  // 实际存储键：带账户作用域，避免不同账户互相命中
  const storageKey = scopedKey(key);
  try {
    // 获取缓存数据
    const cachedData = storageObj.getItem(storageKey);
    if (cachedData && useCache) {
      // 判断缓存是否过期
      const { value, expiry } = JSON.parse(cachedData);
      if (expiry === 0 || new Date().getTime() < expiry) {
        debugLog(`✅ Cached data found for key: ${storageKey}`, value);
        return value;
      }
    }
    // 请求数据
    const result = await promiseFunc(...args);
    // 不缓存 null/undefined 结果，避免接口故障时把空值缓存进 sessionStorage，
    // 导致后续刷新持续返回旧空值而不发起新请求（例如历史 CORS 拦截期间缓存了 null）。
    if (result === null || result === undefined) {
      return result;
    }
    const expiry = time === -1 ? -1 : new Date().getTime() + time * 60 * 1000;
    // 存储数据
    storageObj.setItem(storageKey, JSON.stringify({ value: result, expiry }));
    return result;
  } catch (error) {
    console.error(`❌ Error in getCacheData: ${error}`);
    throw error;
  }
};
