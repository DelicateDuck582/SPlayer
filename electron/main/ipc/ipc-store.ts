import { ipcMain, dialog } from "electron";
import { writeFile, readFile } from "fs/promises";
import { useStore } from "../store";
import type { StoreType } from "../store";
import { appName, appVersion } from "../utils/config";
import { storeLog } from "../logger";
import { isPrivateHost, isValidPort } from "../utils/net-security";
import { isManagedPath } from "../utils/path-security";

/** 渲染层允许写入的配置键白名单（与渲染层实际调用点一一对应） */
const RENDERER_WRITABLE_KEYS = new Set([
  "window",
  "cacheLimit",
  "websocket",
  "cachePath",
  "amllDbServer",
]);

/** 渲染层允许删除/重置的配置键（渲染层当前无调用点，限定为渲染层自有配置） */
const RENDERER_RESETTABLE_KEYS = new Set([
  "window",
  "cacheLimit",
  "websocket",
  "cachePath",
  "amllDbServer",
]);

/** 判断是否为普通对象 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * 校验配置值是否合法
 * @param key 配置键
 * @param value 配置值
 * @returns 合法返回 null，否则返回失败原因
 */
const validateStoreValue = (key: string, value: unknown): string | null => {
  switch (key) {
    case "window": {
      if (!isPlainObject(value)) return "值必须是对象";
      // 仅校验出现的字段，兼容旧版只保存部分窗口字段的配置
      const { width, height, x, y, maximized, useBorderless, zoomFactor } = value;
      for (const size of [width, height]) {
        if (size !== undefined && (typeof size !== "number" || !Number.isFinite(size) || size <= 0))
          return "窗口宽高无效";
      }
      for (const num of [x, y]) {
        if (num !== undefined && (typeof num !== "number" || !Number.isFinite(num)))
          return "窗口坐标无效";
      }
      for (const flag of [maximized, useBorderless]) {
        if (flag !== undefined && typeof flag !== "boolean") return "窗口标记无效";
      }
      if (
        zoomFactor !== undefined &&
        (typeof zoomFactor !== "number" ||
          !Number.isFinite(zoomFactor) ||
          zoomFactor < 0.5 ||
          zoomFactor > 2)
      ) {
        return "窗口缩放系数无效";
      }
      return null;
    }
    case "cacheLimit": {
      // 与设置界面范围一致（0 表示不限制，上限 9999GB）
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999)
        return "缓存上限超出允许范围";
      return null;
    }
    case "websocket": {
      if (!isPlainObject(value)) return "值必须是对象";
      if (typeof value.enabled !== "boolean") return "websocket.enabled 无效";
      if (!isValidPort(value.port)) return "websocket.port 必须是 1024-65535 的整数";
      return null;
    }
    case "cachePath": {
      // 缓存目录必须已在受管根内（由系统对话框授权），防止渲染层改写到任意位置
      if (typeof value !== "string" || !isManagedPath(value, true)) return "缓存目录未授权";
      return null;
    }
    case "amllDbServer": {
      if (typeof value !== "string" || value.length === 0 || value.length > 2048)
        return "amllDbServer 无效";
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
          return "amllDbServer 仅支持 http/https";
        // 该地址会被歌词服务直接 fetch，字面量拒绝回环/内网主机，防 SSRF
        if (isPrivateHost(parsed.hostname)) return "amllDbServer 不能指向内网地址";
      } catch {
        return "amllDbServer 不是合法地址";
      }
      return null;
    }
    default:
      return "配置键不在白名单内";
  }
};

/**
 * 校验渲染层的配置写入
 * @param key 配置键
 * @param value 配置值
 * @returns 允许返回 null，否则返回失败原因
 */
const validateRendererWrite = (key: unknown, value: unknown): string | null => {
  if (typeof key !== "string" || !RENDERER_WRITABLE_KEYS.has(key)) return "配置键不在白名单内";
  return validateStoreValue(key, value);
};

/**
 * 过滤导入的配置数据，仅保留白名单键且值合法的项
 * @param data 导入文件中的配置对象
 * @param store 当前配置实例，用于合并对象型配置后再校验
 * @returns 过滤后的配置对象
 */
const filterImportData = (
  data: unknown,
  store: ReturnType<typeof useStore>,
): Record<string, unknown> => {
  if (!isPlainObject(data)) return {};
  const result: Record<string, unknown> = {};
  const ignoredKeys: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!RENDERER_WRITABLE_KEYS.has(key)) {
      ignoredKeys.push(key);
      continue;
    }
    // 对象型配置与现值合并后再校验，兼容旧版只导出部分字段的情况
    const current = store.get(key as keyof StoreType);
    const candidate =
      isPlainObject(value) && isPlainObject(current) ? { ...current, ...value } : value;
    if (validateStoreValue(key, candidate)) {
      ignoredKeys.push(key);
      continue;
    }
    result[key] = candidate;
  }
  if (ignoredKeys.length > 0) {
    // 记录被忽略的键，避免备份恢复时静默丢失配置
    storeLog.warn(`⚠️ 导入设置时忽略的键: ${ignoredKeys.join(", ")}`);
  }
  return result;
};

/**
 * 初始化 store IPC 主进程
 */
const initStoreIpc = (): void => {
  const store = useStore();
  if (!store) return;

  // 获取配置项
  ipcMain.handle("store-get", (_event, key: keyof StoreType) => {
    return store.get(key);
  });

  // 设置配置项（仅允许白名单键，且值必须合法）
  ipcMain.handle("store-set", (_event, key: keyof StoreType, value: unknown) => {
    const reason = validateRendererWrite(key, value);
    if (reason) {
      storeLog.warn(`🚫 Blocked store-set: key=${String(key)}, reason=${reason}`);
      return false;
    }
    store.set(key, value as StoreType[typeof key]);
    return true;
  });

  // 判断配置项是否存在
  ipcMain.handle("store-has", (_event, key: keyof StoreType) => {
    return store.has(key);
  });

  // 删除配置项（仅允许白名单键，防止渲染层清空主进程配置）
  ipcMain.handle("store-delete", (_event, key: keyof StoreType) => {
    if (typeof key !== "string" || !RENDERER_RESETTABLE_KEYS.has(key)) {
      storeLog.warn(`🚫 拒绝删除配置项: ${String(key)}`);
      return false;
    }
    store.delete(key);
    return true;
  });

  // 重置配置（仅允许白名单键；整库重置请走主进程 reset-setting 通道）
  ipcMain.handle("store-reset", (_event, keys?: (keyof StoreType)[]) => {
    const list = Array.isArray(keys) ? keys : [];
    const invalid = list.some(
      (key) => typeof key !== "string" || !RENDERER_RESETTABLE_KEYS.has(key),
    );
    if (list.length === 0 || invalid) {
      storeLog.warn(`🚫 拒绝重置配置项: ${JSON.stringify(keys ?? null)}`);
      return false;
    }
    store.reset(...list);
    return true;
  });

  // 导出配置
  ipcMain.handle("store-export", async (_event, rendererData: unknown) => {
    console.log("[IPC] store-export called");
    try {
      const now = new Date();
      // 使用 ISO 格式的时间字符串，文件名更友好
      const timeStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `${appName}_Settings_v${appVersion}_${timeStr}.json`;

      const { filePath } = await dialog.showSaveDialog({
        title: "导出设置",
        defaultPath: filename,
        filters: [{ name: "SPlayer Config", extensions: ["json"] }],
      });

      if (filePath) {
        console.log("[IPC] Exporting to:", filePath);
        const fullData = {
          meta: {
            appName,
            version: appVersion,
            timestamp: now.getTime(),
            date: now.toISOString(),
          },
          electron: store.store,
          renderer: rendererData,
        };
        const data = JSON.stringify(fullData, null, 2);
        await writeFile(filePath, data, "utf-8");
        return { success: true, path: filePath };
      }
      console.log("[IPC] Export cancelled");
      return { success: false, error: "cancelled" };
    } catch (error) {
      console.error("❌ Export settings failed:", error);
      return { success: false, error: String(error) };
    }
  });

  // 导入配置
  ipcMain.handle("store-import", async () => {
    console.log("[IPC] store-import called");
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: "导入设置",
        filters: [{ name: "SPlayer Config", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (filePaths && filePaths.length > 0) {
        console.log("[IPC] Importing from:", filePaths[0]);
        const fileContent = await readFile(filePaths[0], "utf-8");

        let settings;
        try {
          settings = JSON.parse(fileContent);
        } catch {
          return { success: false, error: "invalid_json" };
        }
        // 基础结构验证
        if (!settings || typeof settings !== "object") {
          return { success: false, error: "invalid_format" };
        }
        // 恢复 Electron Store 配置（仅接受白名单键且值合法）
        if (settings.electron) {
          try {
            const filtered = filterImportData(settings.electron, store);
            store.store = { ...store.store, ...filtered };
          } catch (e) {
            console.error("Error restoring electron store:", e);
          }
        } else if (!settings.renderer && !settings.meta) {
          // 兼容旧版纯 Electron Store 导出
          const filtered = filterImportData(settings, store);
          store.store = { ...store.store, ...filtered };
        }
        return { success: true, data: settings };
      }
      console.log("[IPC] Import cancelled");
      return { success: false, error: "cancelled" };
    } catch (error) {
      console.error("❌ Import settings failed:", error);
      return { success: false, error: String(error) };
    }
  });
};

export default initStoreIpc;
