import type { SongMetadata } from "@native/tools";
import { app, BrowserWindow } from "electron";
import { mkdir, access, writeFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { ipcLog } from "../logger";
import { useStore } from "../store";
import { loadNativeModule } from "../utils/native-loader";
import { getArtistNames } from "../utils/format";

type toolModule = typeof import("@native/tools");
const tools: toolModule = loadNativeModule("tools.node", "tools");

/** 非法文件名字符（路径分隔符 + Windows 保留字符 + 控制字符） */
const ILLEGAL_NAME_CHARS = /[\\/:*?"<>|\p{Cc}]/gu;
/** 允许落盘的音频扩展名白名单 */
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "mp4",
  "aac",
  "wav",
  "ogg",
  "opus",
  "ape",
  "wma",
  "dsf",
  "dff",
  "aiff",
]);

/**
 * 净化下载文件名（主进程侧兜底，防止路径穿越与非法字符）
 * @param name 渲染进程传入的文件名
 * @returns 安全文件名；完全非法时返回空字符串
 */
const sanitizeDownloadName = (name?: string): string => {
  return String(name ?? "")
    .replace(ILLEGAL_NAME_CHARS, "&")
    .replace(/^\.+/, "") // 去掉首部点号（避免 ../、隐藏文件）
    .replace(/[.\s]+$/, "") // Windows 不允许以点或空格结尾
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
};

/**
 * 净化扩展名（仅允许音频白名单，其余回退 mp3）
 * @param type 渲染进程传入的扩展名
 * @returns 安全的扩展名
 */
const sanitizeDownloadType = (type?: string): string => {
  const cleaned = String(type ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 6);
  return ALLOWED_AUDIO_EXTENSIONS.has(cleaned) ? cleaned : "mp3";
};

export class DownloadService {
  /** 存储活动下载任务：ID -> DownloadTask 实例 */
  private activeDownloads = new Map<number, any>();

  /**
   * 处理文件下载请求
   * @param event IPC 调用事件
   * @param url 下载链接
   * @param options 下载选项
   * @returns 下载结果状态
   */
  async downloadFile(
    event: Electron.IpcMainInvokeEvent,
    url: string,
    options: {
      fileName: string;
      fileType: string;
      path: string;
      downloadMeta?: boolean;
      downloadCover?: boolean;
      downloadLyric?: boolean;
      saveMetaFile?: boolean;
      lyric?: string;
      albumArtists?: string[];
      songData?: any;
      skipIfExist?: boolean;
      threadCount?: number;
      referer?: string;
      enableDownloadHttp2?: boolean;
    } = {
      fileName: "未知文件名",
      fileType: "mp3",
      path: app.getPath("downloads"),
    },
  ): Promise<{ status: "success" | "skipped" | "error" | "cancelled"; message?: string }> {
    try {
      // 获取窗口
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || !win.webContents) return { status: "error", message: "Window not found" };
      // 获取配置
      const {
        fileName: rawFileName,
        fileType: rawFileType,
        path,
        lyric,
        albumArtists,
        downloadMeta,
        downloadCover,
        downloadLyric,
        saveMetaFile,
        songData,
        skipIfExist,
        referer,
      } = options;

      // 纵深防御：主进程不信任渲染进程传入的参数
      // 1) 协议白名单：禁止 file:/data:/blob: 等异常协议
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { status: "error", message: `不支持的下载协议：${parsed.protocol}` };
        }
      } catch {
        return { status: "error", message: "下载地址无效" };
      }
      // 2) 文件名/扩展名净化：去掉路径分隔符、控制字符与首部点号，防止路径穿越
      const fileName = sanitizeDownloadName(rawFileName);
      if (!fileName) return { status: "error", message: "文件名无效，已取消下载" };
      const fileType = sanitizeDownloadType(rawFileType);
      // 规范化路径
      const downloadPath = resolve(path);
      // 3) 目标文件必须落在下载目录内（防止 ../ 逃逸）
      const finalFilePath = fileType
        ? join(downloadPath, `${fileName}.${fileType}`)
        : join(downloadPath, fileName);
      const relativePath = relative(downloadPath, finalFilePath);
      if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
        return { status: "error", message: "目标路径越界，已取消下载" };
      }
      // 检查文件夹是否存在，不存在则自动递归创建
      try {
        await access(downloadPath);
      } catch {
        await mkdir(downloadPath, { recursive: true });
      }
      // 检查文件是否存在
      if (skipIfExist) {
        try {
          await access(finalFilePath);
          return { status: "skipped", message: "文件已存在" };
        } catch {
          // 文件不存在，继续下载
        }
      }
      // 使用隐藏的临时文件夹来避免扫描
      const tempDir = join(downloadPath, ".splayer_temp");
      try {
        await access(tempDir);
      } catch {
        await mkdir(tempDir, { recursive: true });
      }
      const tempFileName = fileType ? `${fileName}.${fileType}` : fileName;
      const tempFilePath = join(tempDir, tempFileName);
      // 准备元数据
      let metadata: SongMetadata | undefined | null = null;
      if (downloadMeta && songData) {
        const artistNames = getArtistNames(songData.artists);
        const artist = artistNames.join(", ") || "未知艺术家";
        const albumArtist = albumArtists?.join(", ");
        const coverUrl =
          downloadCover && (songData.coverSize?.l || songData.cover)
            ? songData.coverSize?.l || songData.cover
            : undefined;
        metadata = {
          title: songData.name || "未知曲目",
          artist: artist,
          album:
            (typeof songData.album === "string" ? songData.album : songData.album?.name) ||
            "未知专辑",
          albumArtist: albumArtist && albumArtist !== "" ? albumArtist : undefined,
          coverUrl: coverUrl,
          lyric: downloadLyric && lyric ? lyric : undefined,
          description: songData.alia || "",
        };
      }
      // 进度回调
      const onProgress = (...args: any[]) => {
        let progressData: any;
        // 处理 (err, value) 或 (value) 签名
        if (args.length > 1 && args[0] === null) {
          progressData = args[1];
        } else if (args.length > 0) {
          progressData = args[0];
        }
        // 处理进度数据
        try {
          if (!progressData) return;
          // 处理对象（新）和 JSON 字符串（旧/回退）
          if (typeof progressData === "string") {
            try {
              progressData = JSON.parse(progressData);
            } catch (e) {
              console.error("Failed to parse progress json", e);
              return;
            }
          }
          // 检查进度数据
          if (!progressData || typeof progressData !== "object") return;
          // 映射 snake_case（Rust）到 camelCase（JS）
          // Rust struct: { percent, transferred_bytes, total_bytes }
          const percent = progressData.percent;
          const transferredBytes =
            progressData.transferredBytes ?? progressData.transferred_bytes ?? 0;
          const totalBytes = progressData.totalBytes ?? progressData.total_bytes ?? 0;
          // 发送进度更新
          win.webContents.send("download-progress", {
            id: songData?.id,
            percent: percent,
            transferredBytes: transferredBytes,
            totalBytes: totalBytes,
          });
        } catch (e) {
          console.error("Error processing progress callback", e, "Args:", args);
        }
      };
      // 检查工具模块
      if (!tools) throw new Error("Native tools not loaded");
      // 获取配置
      const store = useStore();
      // 使用 threadCount（如果可用），否则回退到 store
      const threadCount = options.threadCount || store.get("downloadThreadCount") || 8;
      // 使用 enableDownloadHttp2（如果可用），否则回退到 store
      const enableHttp2 = options.enableDownloadHttp2 ?? store.get("enableDownloadHttp2", true);
      // 如果启用了 HTTP/2，将 HTTP 升级到 HTTPS（HTTP/2 通常需要 HTTPS）
      let finalUrl = url;
      if (enableHttp2 && finalUrl.startsWith("http://")) {
        finalUrl = finalUrl.replace(/^http:\/\//, "https://");
        ipcLog.info(`🔒 Upgraded download URL to HTTPS for HTTP/2 support: ${finalUrl}`);
      }
      // 创建下载任务
      const task = new tools.DownloadTask();
      const downloadId = songData?.id || 0;
      this.activeDownloads.set(downloadId, task);

      try {
        // 下载到临时文件
        await task.download(
          finalUrl,
          tempFilePath,
          metadata,
          threadCount,
          referer,
          onProgress,
          enableHttp2,
        );
        // 下载完成后重命名为最终文件名
        await rename(tempFilePath, finalFilePath);
      } catch (err) {
        // 下载失败或取消，尝试清理临时文件
        try {
          await unlink(tempFilePath);
        } catch {
          // 忽略清理错误
        }
        throw err;
      } finally {
        this.activeDownloads.delete(downloadId);
      }

      // 创建同名歌词文件
      if (lyric && saveMetaFile && downloadLyric) {
        const lrcPath = join(downloadPath, `${fileName}.lrc`);
        await writeFile(lrcPath, lyric, "utf-8");
      }

      return { status: "success" };
    } catch (error: any) {
      ipcLog.error("❌ Error downloading file:", error);
      if ((error.message && error.message.includes("cancelled")) || error.code === "Cancelled") {
        return { status: "cancelled", message: "下载已取消" };
      }
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 取消下载
   * @param songId 歌曲ID
   * @returns 是否成功取消
   */
  cancelDownload(songId: number): boolean {
    const task = this.activeDownloads.get(songId);
    if (task) {
      task.cancel();
      return true;
    }
    return false;
  }
}
