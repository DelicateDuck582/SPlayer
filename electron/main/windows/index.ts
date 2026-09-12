import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { windowsLog } from "../logger";
import { appName } from "../utils/config";
import { join } from "path";
import icon from "../../../public/icons/favicon.png?asset";

export const createWindow = (
  options: BrowserWindowConstructorOptions = {},
  // 附加选项：加载不可信第三方页面的窗口应显式关闭预加载脚本，避免向页面暴露 IPC 能力
  extra: { withoutPreload?: boolean } = {},
): BrowserWindow | null => {
  try {
    const defaultOptions: BrowserWindowConstructorOptions = {
      title: appName,
      width: 1280,
      height: 720,
      frame: false, // 是否显示窗口边框
      center: true, // 窗口居中
      icon, // 窗口图标
      autoHideMenuBar: true, // 隐藏菜单栏
      webPreferences: {
        preload: join(__dirname, "../preload/index.mjs"),
        // 禁用渲染器沙盒
        sandbox: false,
        // 禁用同源策略
        webSecurity: false,
        // 允许 HTTP
        allowRunningInsecureContent: true,
        // 禁用拼写检查
        spellcheck: false,
        // 启用 Node.js
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
      },
    };
    // 合并参数
    if (options.webPreferences) {
      options.webPreferences = Object.assign(
        {},
        defaultOptions.webPreferences,
        options.webPreferences,
      );
    }
    options = Object.assign(defaultOptions, options);
    // 显式关闭预加载脚本（用于加载第三方页面的窗口）
    if (extra.withoutPreload && options.webPreferences) {
      delete (options.webPreferences as Record<string, unknown>).preload;
    }
    // 创建窗口
    const win = new BrowserWindow(options);
    return win;
  } catch (error) {
    windowsLog.error(error);
    return null;
  }
};
