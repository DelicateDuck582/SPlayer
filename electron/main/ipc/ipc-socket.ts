import { ipcMain } from "electron";
import { SocketService } from "../services/SocketService";
import { processLog } from "../logger";
import { useStore } from "../store";
import { isValidPort } from "../utils/net-security";

type SocketIpcResult<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
};

const withErrorCatch = async <T>(action: () => Promise<T>): Promise<SocketIpcResult<T>> => {
  try {
    const data = await action();
    return { success: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    processLog.error("❌ IPC socket error:", error);
    return { success: false, message };
  }
};

/**
 * 初始化 WebSocket 相关 IPC
 */
const initSocketIpc = (): void => {
  const socketService = SocketService.getInstance();

  // 启动 WebSocket 服务（端口来自配置，先按 1024-65535 校验）
  ipcMain.handle("socket-start", async (): Promise<SocketIpcResult<{ port: number }>> => {
    return withErrorCatch(async () => {
      const store = useStore();
      const websocketConfig = store.get("websocket");
      const port = websocketConfig?.port ?? 25885;
      if (!isValidPort(port)) {
        processLog.warn(`🚫 拒绝非法端口: ${String(port)}`);
        throw new Error(`端口 ${port} 不合法，请先测试并保存可用端口`);
      }
      // 先检查端口是否可用
      const isAvailable = await socketService.testPort(port);
      if (!isAvailable) {
        throw new Error(`端口 ${port} 不可用，请先测试并保存可用端口`);
      }
      const result = await socketService.start(port, true);
      store.set("websocket", { enabled: true, port });
      return result;
    });
  });

  // 停止 WebSocket 服务
  ipcMain.handle("socket-stop", async (): Promise<SocketIpcResult<null>> => {
    return withErrorCatch(async () => {
      await socketService.stop();
      const store = useStore();
      store.set("websocket.enabled", false);

      return null;
    });
  });

  // 查询当前 WebSocket 状态
  ipcMain.handle(
    "socket-status",
    async (): Promise<SocketIpcResult<{ running: boolean; port: number | null }>> => {
      return withErrorCatch(async () => {
        return {
          running: socketService.isRunning(),
          port: socketService.getPort(),
        };
      });
    },
  );

  // 测试指定端口（仅接受 1024-65535 的整数，避免非法/特权端口）
  ipcMain.handle(
    "socket-test-port",
    async (_event, port: number): Promise<SocketIpcResult<null>> => {
      return withErrorCatch(async () => {
        if (!isValidPort(port)) {
          processLog.warn(`🚫 拒绝非法端口: ${String(port)}`);
          throw new Error("端口必须是 1024-65535 之间的整数");
        }
        const isAvailable = await socketService.testPort(port);
        if (!isAvailable) throw new Error(`端口 ${port} 不可用`);
        return null;
      });
    },
  );

  // 音频事件广播
  ipcMain.on("play-status-change", (_, status) => {
    socketService.broadcast({
      type: "status-change",
      data: { status, timestamp: Date.now() },
    });
  });
  ipcMain.on("play-lyric-change", (_, lyricData) => {
    // 是否存在歌词
    const { lrcData, yrcData } = lyricData;
    if (!lrcData && !yrcData) return;
    socketService.broadcast({
      type: "lyric-change",
      data: { lrcData, yrcData, timestamp: Date.now() },
    });
  });
  ipcMain.on("play-song-change", (_, options) => {
    socketService.broadcast({
      type: "song-change",
      data: { ...options, timestamp: Date.now() },
    });
  });
  ipcMain.on("set-progress", (_, options) => {
    // 解析参数
    const { currentTime, duration } = options;
    // 检查参数
    if (currentTime === undefined || duration === undefined) return;
    socketService.broadcast({
      type: "progress-change",
      data: { currentTime, duration, timestamp: Date.now() },
    });
  });
};

export default initSocketIpc;
