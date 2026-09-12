/**
 * 懒加载资源失败恢复
 *
 * 场景：应用发版后，仍在运行的旧页面会请求已被新部署移除的 lazy chunk（404），
 * 动态导入 reject 未被捕获 → 点击功能「毫无反应」。
 *
 * 策略：自动刷新一次以拉取新版本资源；若 60 秒内已自动刷新过（说明刷新后仍失败），
 * 则只提示用户、不再刷新，避免陷入刷新循环。
 */

/** 上次自动刷新的时间戳（sessionStorage：同一标签页跨导航共享） */
const CHUNK_RELOAD_AT_KEY = "splayer:chunk-reload-at";

/** 自动刷新冷却时间（毫秒）：期内不再自动刷新 */
const RELOAD_COOLDOWN_MS = 60_000;

/** 是否正处于「资源版本更新触发的自动刷新」过程中 */
let chunkRecovering = false;

/**
 * 是否正在进行资源恢复刷新
 *
 * 用途：`beforeunload` 中据此跳过「确认离开」提示，
 * 否则浏览器会拦截该刷新，导致恢复失效。
 * @returns 是否正在恢复刷新
 */
export const isChunkRecovering = (): boolean => chunkRecovering;

/**
 * 尝试从「chunk 加载失败」中恢复
 * @returns 是否已触发页面刷新（true 时调用方无需再提示，页面即将重载）
 */
export const recoverFromChunkError = (): boolean => {
  try {
    const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_AT_KEY) || 0);
    if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) {
      console.error("[chunkRecovery] 资源加载失败，且近期已自动刷新过，交由调用方提示用户");
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_AT_KEY, String(Date.now()));
    console.warn("[chunkRecovery] 检测到资源加载失败，自动刷新以获取新版本资源");
    chunkRecovering = true;
    window.location.reload();
    return true;
  } catch (error) {
    console.error("[chunkRecovery] 资源恢复处理异常：", error);
    return false;
  }
};
