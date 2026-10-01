import { debugLog } from "./log";
import { useDataStore, useSettingStore } from "@/stores";

type StorageType = "localStorage" | "sessionStorage";

/** 缓存键统一前缀（便于按账户整体失效） */
const CACHE_PREFIX = "splayer:cache:";

/** 设备级缓存键（与账户无关，不使用缓存前缀，避免被账户级整体清理误伤） */
export const DEVICE_CACHE_KEYS = ["countryListData", "radioTypeData", "updateLog"];

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

/** 删除指定前缀的全部缓存键（含 localStorage / sessionStorage） */
const removeCacheByPrefix = (prefix: string): void => {
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

/**
 * 清理账户级缓存（登出 / 切换账号时调用）
 * @param scope 指定账户作用域时只清该账户，缺省清理全部账户
 */
export const clearCacheData = (scope?: string): void => {
  removeCacheByPrefix(scope ? `${CACHE_PREFIX}${scope}:` : CACHE_PREFIX);
};

/**
 * 按音乐源清理缓存（含未登录的 anon 桶）
 *
 * 用户信息尚未拉取时无法拼出账户作用域，按源清理可避免退化成「只清 anon」。
 * @param source 音乐源
 */
export const clearCacheDataBySource = (source: "kugou" | "qq" | "netease"): void => {
  removeCacheByPrefix(`${CACHE_PREFIX}${source}:`);
};

/**
 * 一次性迁移：清理旧版本设备级缓存残留
 *
 * 旧版本 countryListData / radioTypeData / updateLog 存放在账户作用域下
 * （`splayer:cache:<scope>:<key>`），现改为无前缀独立键名，启动时清掉旧键。
 */
const cleanupLegacyDeviceCacheKeys = (): void => {
  (["sessionStorage", "localStorage"] as StorageType[]).forEach((name) => {
    try {
      const storage = window[name];
      Object.keys(storage)
        .filter(
          (key) =>
            key.startsWith(CACHE_PREFIX) &&
            DEVICE_CACHE_KEYS.some((deviceKey) => key.endsWith(`:${deviceKey}`)),
        )
        .forEach((key) => storage.removeItem(key));
    } catch {
      // 存储不可用（隐私模式等）时忽略
    }
  });
};

// 模块加载（应用启动）时执行一次旧键迁移
cleanupLegacyDeviceCacheKeys();

interface CacheOptions {
  key: string;
  time: number; // 缓存时长，单位为分钟
  storage?: StorageType; // 默认为 sessionStorage
  useCache?: boolean; // 是否使用缓存，默认为 true
  device?: boolean; // 是否为设备级缓存（键名不带账户前缀）
}

/**
 * 获取接口请求缓存
 * @template T
 * @param {(...args: any[]) => Promise<T>} promiseFunc - 异步请求函数
 * @param {Object} options - 缓存选项
 * @param {string} options.key - 用于存储和检索缓存数据的键值
 * @param {number} options.time - 缓存有效时间（分钟）。如果为 -1，则表示永久有效
 * @param {string} [options.storage="sessionStorage"] - 储存方式，默认为 `sessionStorage`，可选 `localStorage`
 * @param {boolean} [options.device=false] - 是否为设备级缓存（键名不带账户作用域前缀）
 * @param {...any} args - 传递的参数
 * @returns {Promise<T>}
 * @returns
 */
export const getCacheData = async <T>(
  promiseFunc: (...args: any[]) => Promise<T>,
  options: CacheOptions,
  ...args: any[]
): Promise<T> => {
  const { key, time, storage = "sessionStorage", useCache = true, device = false } = options;
  // 储存方式
  const storageObj = window[storage];
  // 实际存储键：账户级缓存带作用域，设备级缓存直接用键名
  const storageKey = device ? key : scopedKey(key);
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
