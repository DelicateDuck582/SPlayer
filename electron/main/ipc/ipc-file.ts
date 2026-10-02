import { app, dialog, ipcMain, shell } from "electron";
import { access, mkdir, unlink, writeFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve, extname, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { ipcLog } from "../logger";
import { LocalMusicService } from "../services/LocalMusicService";
import { DownloadService } from "../services/DownloadService";
import { MusicMetadataService } from "../services/MusicMetadataService";
import { useStore } from "../store";
import { chunkArray } from "../utils/helper";
import { processMusicList } from "../utils/format";
import {
  approveDirectory,
  isExistingDirectory,
  isManagedPath,
  isProtectedSystemPath,
  isRootOrTopLevelDir,
} from "../utils/path-security";

/** 允许写入元数据的音频扩展名白名单（set-music-metadata 写入侧防护） */
const WRITABLE_AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "m4b",
  "mp4",
  "aac",
  "wav",
  "ogg",
  "opus",
  "ape",
  "wma",
  "wv",
  "tak",
  "mpc",
  "dsf",
  "dff",
  "aiff",
  "alac",
]);

/** 本地音乐服务 */
const localMusicService = new LocalMusicService();
/** 下载服务 */
const downloadService = new DownloadService();
/** 音乐元数据服务 */
const musicMetadataService = new MusicMetadataService();

/** 旧版路径一次性迁移标志键（electron-store） */
const LEGACY_MIGRATED_KEY = "legacyRootsMigrated";
/** 本次会话内经图片对话框选择的封面文件（允许作为元数据封面来源） */
const approvedCoverFiles = new Set<string>();

/** 生成封面文件比较键（Windows 大小写不敏感） */
const coverFileKey = (filePath: string): string => {
  const resolved = resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

/**
 * 校验旧版路径是否可作为受管根
 * @param dir 待校验目录
 * @returns 绝对路径、目录存在、非系统目录且非盘根及其一级目录时通过
 */
const isValidLegacyRoot = (dir: string): boolean =>
  isAbsolute(dir) &&
  isExistingDirectory(dir) &&
  !isProtectedSystemPath(dir) &&
  !isRootOrTopLevelDir(dir);

const analysisInFlight = new Map<string, Promise<unknown | null>>();

const normalizeAnalysisKey = (filePath: string) => {
  const p = normalize(resolve(filePath));
  return process.platform === "win32" ? p.toLowerCase() : p;
};

const resolveToolsNativeModulePath = () => {
  if (app.isPackaged) {
    return join(process.resourcesPath, "native", "tools.node");
  }
  return join(process.cwd(), "native", "tools", "tools.node");
};

const runToolsJobInWorker = async (payload: Record<string, unknown>) => {
  const worker = new Worker(new URL("./workers/audio-analysis.worker.js", import.meta.url), {});

  try {
    const jobType = typeof payload.type === "string" ? payload.type : "unknown";
    const nativeModulePath = resolveToolsNativeModulePath();
    await access(nativeModulePath).catch(() => {
      ipcLog.warn(`[AudioAnalysis] tools.node 不存在: ${nativeModulePath}`);
      throw new Error("TOOLS_NATIVE_MODULE_MISSING");
    });
    if (
      jobType === "analyzeHead" ||
      jobType === "suggestTransition" ||
      jobType === "suggestLongMix"
    ) {
      ipcLog.info(`[AudioAnalysis] Worker 启动: ${jobType}`);
    }
    const result = await new Promise<unknown | null>((resolvePromise) => {
      const cleanup = () => {
        worker.removeAllListeners("message");
        worker.removeAllListeners("error");
        worker.removeAllListeners("exit");
        worker.terminate().catch(() => {});
      };

      worker.once(
        "message",
        (resp: { ok: true; result?: unknown } | { ok: false; error?: string }) => {
          cleanup();
          if (resp && resp.ok) {
            resolvePromise(resp.result ?? null);
            return;
          }
          if (resp && !resp.ok && resp.error) {
            ipcLog.warn(`[AudioAnalysis] Worker 分析失败: ${resp.error}`);
          }
          resolvePromise(null);
        },
      );

      worker.once("error", (err) => {
        cleanup();
        const message = err instanceof Error ? err.message : String(err);
        ipcLog.warn(`[AudioAnalysis] Worker 线程错误: ${message}`);
        resolvePromise(null);
      });

      worker.once("exit", (code) => {
        cleanup();
        if (code !== 0) {
          ipcLog.warn(`[AudioAnalysis] Worker 异常退出: code=${code}`);
        }
        resolvePromise(null);
      });

      worker.postMessage({ ...payload, nativeModulePath });
    });

    if (
      jobType === "analyzeHead" ||
      jobType === "suggestTransition" ||
      jobType === "suggestLongMix"
    ) {
      ipcLog.info(`[AudioAnalysis] Worker 完成: ${jobType} (${result ? "ok" : "null"})`);
    }
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ipcLog.warn(`[AudioAnalysis] 启动分析失败: ${message}`);
    worker.terminate().catch(() => {});
    return null;
  }
};

const runAnalysisInWorker = async (filePath: string, maxTime: number) => {
  return await runToolsJobInWorker({ type: "analyze", filePath, maxTime });
};

const runHeadAnalysisInWorker = async (filePath: string, maxTime: number) => {
  return await runToolsJobInWorker({ type: "analyzeHead", filePath, maxTime });
};

const runSuggestTransitionInWorker = async (currentPath: string, nextPath: string) => {
  return await runToolsJobInWorker({ type: "suggestTransition", currentPath, nextPath });
};

const runSuggestLongMixInWorker = async (currentPath: string, nextPath: string) => {
  return await runToolsJobInWorker({ type: "suggestLongMix", currentPath, nextPath });
};

/** 获取封面目录路径 */
const getCoverDir = (): string => {
  const store = useStore();
  const localCachePath = join(store.get("cachePath"), "local-data");
  return join(localCachePath, "covers");
};

/**
 * 处理本地音乐同步（批量流式传输）
 * @param event IPC 调用事件
 * @param dirs 需要同步的目录路径数组
 */
const handleLocalMusicSync = async (
  event: Electron.IpcMainInvokeEvent,
  dirs: string[],
): Promise<{ success: boolean; message?: string }> => {
  try {
    const coverDir = getCoverDir();
    // 目录白名单：仅同步受管根目录（目录自身与子目录均可），防止扫描任意路径
    const allDirs = Array.isArray(dirs) ? dirs : [];
    const safeDirs: string[] = [];
    const blockedDirs: string[] = [];
    for (const dir of allDirs) {
      if (isManagedPath(dir, true)) safeDirs.push(dir);
      else blockedDirs.push(dir);
    }
    if (blockedDirs.length > 0) {
      ipcLog.warn(`🚫 已过滤未授权的本地音乐目录: ${blockedDirs.join(", ")}`);
    }
    if (allDirs.length > 0 && safeDirs.length === 0) {
      return { success: false, message: "本地音乐目录未授权，请在设置中重新选择目录" };
    }
    // 刷新本地音乐库
    const allTracks = await localMusicService.refreshLibrary(
      safeDirs,
      (current, total) => {
        event.sender.send("music-sync-progress", { current, total });
      },
      () => {},
    );
    // 处理音乐封面路径
    const finalTracks = processMusicList(allTracks, coverDir);
    // 分块发送
    const CHUNK_SIZE = 1000;
    for (const chunk of chunkArray(finalTracks, CHUNK_SIZE)) {
      event.sender.send("music-sync-tracks-batch", chunk);
      await new Promise((resolve) => setImmediate(resolve));
    }
    // 完成信号
    event.sender.send("music-sync-complete", {
      success: true,
    });
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    // 如果正在扫描中
    if (errorMessage === "SCAN_IN_PROGRESS") {
      return { success: false, message: "扫描正在进行中，请稍候" };
    }
    // 错误信号
    event.sender.send("music-sync-complete", { success: false, message: errorMessage });
    return { success: false, message: errorMessage };
  }
};

/**
 * 初始化文件相关 IPC
 */
const initFileIpc = (): void => {
  // 检查文件是否存在（仅限受管根目录，避免成为任意路径探测工具）
  ipcMain.handle("file-exists", async (_, path: string) => {
    if (!isManagedPath(path)) {
      ipcLog.warn(`🚫 Blocked file check outside managed roots: ${String(path)}`);
      return false;
    }
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  });

  // 保存文件
  ipcMain.handle(
    "save-file",
    async (
      _,
      args: {
        targetPath: string;
        fileName: string;
        ext: string;
        content: string;
        encoding?: BufferEncoding;
      },
    ) => {
      try {
        const { targetPath, fileName, ext, content, encoding } = args;
        // 纵深防御：净化文件名/扩展名，并校验目标路径未越出目录（防 ../../ 逃逸）
        const safeName = String(fileName ?? "")
          .replace(/[\\/:*?"<>|\p{Cc}]/gu, "&")
          .replace(/^\.+/, "")
          .replace(/[.\s]+$/, "")
          .trim()
          .slice(0, 120);
        if (!safeName) throw new Error("文件名无效，已取消保存");
        const safeExt = String(ext ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 8);
        const baseDir = resolve(targetPath);
        const joinedPath = join(baseDir, safeExt ? `${safeName}.${safeExt}` : safeName);
        const relativePath = relative(baseDir, joinedPath);
        // 仅排除真正的上级目录，避免误伤「..foo」这类文件名
        if (
          !relativePath ||
          relativePath === ".." ||
          relativePath.startsWith(`..${sep}`) ||
          isAbsolute(relativePath)
        ) {
          throw new Error("目标路径越界，已取消保存");
        }
        // 目录白名单：仅允许写入受管根目录内（缓存/下载/歌词等用户授权目录）
        if (!isManagedPath(joinedPath)) {
          ipcLog.warn(`🚫 Blocked save outside managed roots: ${joinedPath}`);
          throw new Error("目标路径未授权，已取消保存");
        }
        await mkdir(baseDir, { recursive: true });
        await writeFile(joinedPath, content, { encoding: encoding || "utf-8" });
        return { success: true };
      } catch (err) {
        ipcLog.error("Failed to save file:", err);
        throw err;
      }
    },
  );

  // 默认文件夹
  ipcMain.handle(
    "get-default-dir",
    (_event, type: "documents" | "downloads" | "pictures" | "music" | "videos"): string => {
      return app.getPath(type);
    },
  );

  // 本地音乐同步（批量流式传输）
  ipcMain.handle("local-music-sync", handleLocalMusicSync);

  // 获取已下载音乐（仅允许扫描受管根目录）
  ipcMain.handle("get-downloaded-songs", async (_event, dirPath: string) => {
    if (!isManagedPath(dirPath, true)) {
      ipcLog.warn(`🚫 Blocked directory scan outside managed roots: ${String(dirPath)}`);
      return [];
    }
    try {
      const coverDir = getCoverDir();
      // 扫描指定目录
      const tracks = await localMusicService.scanDirectory(dirPath);
      return processMusicList(tracks, coverDir);
    } catch (err) {
      console.error("Failed to get downloaded songs:", err);
      return [];
    }
  });

  // 获取音乐元信息（仅限受管根目录）
  ipcMain.handle("get-music-metadata", async (_, path: string) => {
    if (!isManagedPath(path)) {
      ipcLog.warn(`🚫 Blocked metadata read outside managed roots: ${String(path)}`);
      throw new Error("路径未授权，已拒绝读取元信息");
    }
    return musicMetadataService.getMetadata(path);
  });

  // 修改音乐元信息（写入侧加固：仅允许受管目录内的音频文件，封面须受管或经对话框选择）
  ipcMain.handle("set-music-metadata", async (_, path: string, metadata) => {
    if (!isManagedPath(path)) {
      ipcLog.warn(`🚫 拒绝写入未受管音频的元信息: ${String(path)}`);
      throw new Error("路径未授权，已拒绝写入元信息");
    }
    const ext = typeof path === "string" ? extname(path).replace(".", "").toLowerCase() : "";
    if (!WRITABLE_AUDIO_EXTENSIONS.has(ext)) {
      ipcLog.warn(`🚫 Blocked metadata write for unsupported file: ${String(path)}`);
      throw new Error("仅支持写入音频文件的元信息");
    }
    // 封面来源：受管目录内文件，或本次会话内经系统图片对话框选择的文件
    const cover = (metadata as { cover?: unknown } | null | undefined)?.cover;
    if (typeof cover === "string" && cover.trim() !== "") {
      if (!isManagedPath(cover) && !approvedCoverFiles.has(coverFileKey(cover))) {
        ipcLog.warn(`🚫 拒绝未授权的封面来源: ${cover}`);
        throw new Error("封面路径未授权，请重新选择封面");
      }
    }
    return musicMetadataService.setMetadata(path, metadata);
  });

  // 获取音乐歌词（仅限受管根目录）
  ipcMain.handle("get-music-lyric", async (_, musicPath: string) => {
    if (!isManagedPath(musicPath)) {
      ipcLog.warn(`🚫 Blocked lyric read outside managed roots: ${String(musicPath)}`);
      return { lyric: "", format: "lrc" };
    }
    return musicMetadataService.getLyric(musicPath);
  });

  // 获取音乐封面（仅限受管根目录）
  ipcMain.handle("get-music-cover", async (_, path: string) => {
    if (!isManagedPath(path)) {
      ipcLog.warn(`🚫 Blocked cover read outside managed roots: ${String(path)}`);
      return null;
    }
    return musicMetadataService.getCover(path);
  });

  // 读取本地歌词（仅允许扫描受管根目录内的目录）
  ipcMain.handle("read-local-lyric", async (_, lyricDirs: string[], id: number) => {
    const allDirs = Array.isArray(lyricDirs) ? lyricDirs : [];
    const safeDirs = allDirs.filter((dir) => isManagedPath(dir, true));
    if (safeDirs.length !== allDirs.length) {
      ipcLog.warn("🚫 Blocked local lyric scan outside managed roots");
    }
    return musicMetadataService.readLocalLyric(safeDirs, id);
  });

  // 删除文件（加固：仅允许删除受管根目录内的普通文件，并拒绝系统关键目录）
  ipcMain.handle("delete-file", async (_, path: string) => {
    try {
      if (typeof path !== "string" || !path.trim()) throw new Error("❌ Invalid path");
      // 规范化路径
      const resolvedPath = resolve(path);
      // 拒绝系统关键目录，避免误删或经该通道删除系统文件
      if (isProtectedSystemPath(resolvedPath)) throw new Error("❌ Protected path");
      // 目录白名单：仅允许删除受管根目录内的文件
      if (!isManagedPath(resolvedPath)) {
        ipcLog.warn(`🚫 Blocked delete outside managed roots: ${resolvedPath}`);
        throw new Error("❌ Path not managed");
      }
      // 检查文件是否存在且为普通文件（避免删除目录/设备文件）
      const fileStat = await stat(resolvedPath).catch(() => null);
      if (!fileStat) throw new Error("❌ File not found");
      if (!fileStat.isFile()) throw new Error("❌ Not a regular file");
      // 删除文件
      await unlink(resolvedPath);
      return true;
    } catch (error) {
      ipcLog.error("❌ File delete error", error);
      return false;
    }
  });

  // 打开文件夹
  ipcMain.on("open-folder", async (_, path: string) => {
    try {
      // 规范化路径
      const resolvedPath = resolve(path);
      // 检查文件夹是否存在
      await access(resolvedPath);
      // 打开文件夹
      shell.showItemInFolder(resolvedPath);
    } catch (error) {
      ipcLog.error("❌ Folder open error", error);
    }
  });

  // 图片选择窗口
  ipcMain.handle("choose-image", async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }],
      });
      if (!filePaths || filePaths.length === 0) return null;
      // 记录用户经对话框选择的封面文件，供元数据写入时校验来源
      approvedCoverFiles.add(coverFileKey(filePaths[0]));
      return filePaths[0];
    } catch (error) {
      ipcLog.error("❌ Image choose error", error);
      return null;
    }
  });

  // 路径选择窗口
  ipcMain.handle("choose-path", async (_, title: string, multiSelect: boolean = false) => {
    try {
      const properties: ("openDirectory" | "createDirectory" | "multiSelections")[] = [
        "openDirectory",
        "createDirectory",
      ];
      if (multiSelect) {
        properties.push("multiSelections");
      }
      const { filePaths } = await dialog.showOpenDialog({
        title: title ?? "选择文件夹",
        defaultPath: app.getPath("downloads"),
        properties,
        buttonLabel: "选择文件夹",
      });
      if (!filePaths || filePaths.length === 0) return null;
      // 记录用户经系统对话框授权的目录，作为路径白名单来源
      filePaths.forEach((dir) => approveDirectory(dir));
      // 多选时返回数组，单选时返回第一个路径
      return multiSelect ? filePaths : filePaths[0];
    } catch (error) {
      ipcLog.error("❌ Path choose error:", error);
      return null;
    }
  });

  // 旧版路径一次性迁移：把仅存于渲染层 localStorage 的目录补录为受管根
  ipcMain.handle("approve-legacy-paths", (_, payload: unknown) => {
    const store = useStore();
    // 一次性标志：迁移完成后拒绝再次调用，防止渲染层被注入后借此扩白名单
    if (store.get(LEGACY_MIGRATED_KEY)) {
      ipcLog.warn("🚫 旧版路径已完成迁移，拒绝重复授权");
      return { success: false, message: "已完成迁移" };
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      ipcLog.warn("🚫 旧版路径迁移参数无效");
      return { success: false, message: "参数无效" };
    }
    const { downloadPath, localLyricPath, localFilesPath } = payload as Record<string, unknown>;
    // 收集候选目录：下载目录 + 本地歌词目录 + 本地音乐目录
    const candidates: string[] = [];
    if (typeof downloadPath === "string" && downloadPath.trim() !== "") {
      candidates.push(downloadPath);
    }
    for (const value of [localLyricPath, localFilesPath]) {
      if (Array.isArray(value)) {
        candidates.push(...value.filter((item): item is string => typeof item === "string"));
      }
    }
    let approved = 0;
    for (const dir of candidates) {
      if (!isValidLegacyRoot(dir)) {
        ipcLog.warn(`🚫 迁移跳过无效目录: ${dir}`);
        continue;
      }
      approveDirectory(dir);
      approved += 1;
    }
    store.set(LEGACY_MIGRATED_KEY, true);
    ipcLog.info(`[PathSecurity] 旧版路径迁移完成，授权 ${approved} 个目录`);
    return { success: true, approved };
  });

  // 下载文件
  ipcMain.handle("download-file", (event, url, options) =>
    downloadService.downloadFile(event, url, options),
  );

  // 取消下载
  ipcMain.handle("cancel-download", async (_, songId: number) => {
    return downloadService.cancelDownload(songId);
  });

  // 检查是否是相同的路径（规范化后比较）
  ipcMain.handle("check-if-same-path", (_, localFilesPath: string[], selectedDir: string) => {
    const resolvedSelectedDir = resolve(selectedDir);
    const allPaths = localFilesPath.map((p) => resolve(p));
    return allPaths.some((existingPath) => existingPath === resolvedSelectedDir);
  });

  // 检查是否是子文件夹
  ipcMain.handle("check-if-subfolder", (_, localFilesPath: string[], selectedDir: string) => {
    const resolvedSelectedDir = resolve(selectedDir);
    const allPaths = localFilesPath.map((p) => resolve(p));
    return allPaths.some((existingPath) => {
      const relativePath = relative(existingPath, resolvedSelectedDir);
      // 仅排除真正的上级目录，避免误伤「..foo」这类目录名
      return (
        relativePath !== "" &&
        relativePath !== ".." &&
        !relativePath.startsWith(`..${sep}`) &&
        !isAbsolute(relativePath)
      );
    });
  });

  // 音频分析
  ipcMain.handle(
    "analyze-audio",
    async (_, filePath: string, options?: { maxAnalyzeTimeSec?: number }) => {
      try {
        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat) return null;

        const maxTime = options?.maxAnalyzeTimeSec ?? 60;
        const CURRENT_VERSION = 11; // 与 Rust 保持一致
        const fileKey = normalizeAnalysisKey(filePath);

        // 1. Check Cache
        const candidateKeys = new Set<string>([fileKey, filePath]);
        if (process.platform === "win32") {
          candidateKeys.add(filePath.replaceAll("/", "\\").toLowerCase());
          candidateKeys.add(filePath.replaceAll("\\", "/").toLowerCase());
        }

        for (const key of candidateKeys) {
          const cached = await localMusicService.getAnalysis(key);
          if (!cached || cached.mtime !== fileStat.mtimeMs || cached.size !== fileStat.size)
            continue;
          try {
            const data = JSON.parse(cached.data);
            if (
              data &&
              data.version === CURRENT_VERSION &&
              data.analyze_window &&
              Math.abs(data.analyze_window - maxTime) < 1.0
            ) {
              if (key !== fileKey) {
                await localMusicService.saveAnalysis(
                  fileKey,
                  cached.data,
                  fileStat.mtimeMs,
                  fileStat.size,
                );
              }
              return data;
            }
          } catch (e) {
            void e;
          }
        }

        // 2. Analyze
        const requestKey = `${fileKey}|${maxTime}`;
        const inFlight = analysisInFlight.get(requestKey);
        if (inFlight) return await inFlight;

        const promise = (async () => {
          const result = await runAnalysisInWorker(filePath, maxTime);
          if (!result) return null;
          try {
            await localMusicService.saveAnalysis(
              fileKey,
              JSON.stringify(result),
              fileStat.mtimeMs,
              fileStat.size,
            );
          } catch (e) {
            void e;
          }
          return result;
        })().finally(() => {
          analysisInFlight.delete(requestKey);
        });

        analysisInFlight.set(requestKey, promise);
        return await promise;
      } catch (err) {
        console.error("Audio analysis failed:", err);
        return null;
      }
    },
  );

  ipcMain.handle(
    "analyze-audio-head",
    async (_, filePath: string, options?: { maxAnalyzeTimeSec?: number }) => {
      try {
        const fileStat = await stat(filePath).catch(() => null);
        if (!fileStat) return null;

        const maxTime = options?.maxAnalyzeTimeSec ?? 60;
        const CURRENT_VERSION = 11;
        const fileKey = normalizeAnalysisKey(filePath);
        const headKey = `${fileKey}|head|${maxTime}`;

        const cached = await localMusicService.getAnalysis(headKey);
        if (cached && cached.mtime === fileStat.mtimeMs && cached.size === fileStat.size) {
          try {
            const data = JSON.parse(cached.data);
            if (data && data.version === CURRENT_VERSION && data.analyze_window) {
              ipcLog.info(`[AudioAnalysis] Head 命中缓存: ${headKey}`);
              return data;
            }
          } catch (e) {
            void e;
          }
        }

        const requestKey = `${headKey}|request`;
        const inFlight = analysisInFlight.get(requestKey);
        if (inFlight) return await inFlight;

        const promise = (async () => {
          ipcLog.info(`[AudioAnalysis] Head 开始分析: ${headKey}`);
          const result = await runHeadAnalysisInWorker(filePath, maxTime);
          if (!result) return null;
          try {
            await localMusicService.saveAnalysis(
              headKey,
              JSON.stringify(result),
              fileStat.mtimeMs,
              fileStat.size,
            );
          } catch (e) {
            void e;
          }
          return result;
        })().finally(() => {
          analysisInFlight.delete(requestKey);
        });

        analysisInFlight.set(requestKey, promise);
        return await promise;
      } catch (err) {
        console.error("Audio head analysis failed:", err);
        return null;
      }
    },
  );

  ipcMain.handle("suggest-transition", async (_, currentPath: string, nextPath: string) => {
    try {
      const a = await stat(currentPath).catch(() => null);
      if (!a) return null;
      const b = await stat(nextPath).catch(() => null);
      if (!b) return null;
      ipcLog.info(`[AudioAnalysis] SuggestTransition: ${currentPath} -> ${nextPath}`);
      return await runSuggestTransitionInWorker(currentPath, nextPath);
    } catch (err) {
      console.error("Suggest transition failed:", err);
      return null;
    }
  });

  ipcMain.handle("suggest-long-mix", async (_, currentPath: string, nextPath: string) => {
    try {
      const a = await stat(currentPath).catch(() => null);
      if (!a) return null;
      const b = await stat(nextPath).catch(() => null);
      if (!b) return null;
      ipcLog.info(`[AudioAnalysis] SuggestLongMix: ${currentPath} -> ${nextPath}`);
      return await runSuggestLongMixInWorker(currentPath, nextPath);
    } catch (err) {
      console.error("Suggest long mix failed:", err);
      return null;
    }
  });
};

export default initFileIpc;
