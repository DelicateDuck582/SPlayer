import { app, ipcMain } from "electron";
import { processLog } from "../logger";

/** 允许注册/取消注册的协议白名单（仅应用自身的自定义协议） */
const ALLOWED_PROTOCOLS = new Set(["orpheus"]);

const initProtocolIpc = (): void => {
  const isAllowed = (protocol: unknown): protocol is string =>
    typeof protocol === "string" && ALLOWED_PROTOCOLS.has(protocol.toLowerCase());

  ipcMain.on("register-protocol", (_, protocol: string) => {
    if (!isAllowed(protocol)) {
      processLog.warn(`🚫 Blocked protocol registration: ${String(protocol)}`);
      return;
    }
    app.setAsDefaultProtocolClient(protocol);
    processLog.info("🔗 Registered custom protocol", protocol);
  });

  ipcMain.on("unregister-protocol", (_, protocol: string) => {
    if (!isAllowed(protocol)) {
      processLog.warn(`🚫 Blocked protocol unregistration: ${String(protocol)}`);
      return;
    }
    app.removeAsDefaultProtocolClient(protocol);
    processLog.info("🔗 Unregistered custom protocol", protocol);
  });
};

export default initProtocolIpc;
