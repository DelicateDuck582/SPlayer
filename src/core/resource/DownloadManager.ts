import type { SongType, SongLevelType } from "@/types/main";
import { useDataStore, useSettingStore } from "@/stores";
import { isElectron } from "@/utils/env";
import { saveAs } from "file-saver";
import { cloneDeep } from "lodash-es";
import { songDownloadUrl, songLyric, songUrl, unlockSongUrl, songLyricTTML } from "@/api/song";
import { qqMusicMatch } from "@/api/qqmusic";
import { songLevelData } from "@/utils/meta";
import { getPlayerInfoObj } from "@/utils/format";
import { formatFileSize } from "@/utils/helper";
import { isLogin } from "@/utils/auth";
import { LyricProcessor, type LyricProcessorOptions, type LyricResult } from "./LyricProcessor";
import { albumDetail } from "@/api/album";
import {
  ALLOWED_AUDIO_EXTENSIONS,
  assertSafeDownloadUrl,
  sanitizeFileName,
  sanitizeFileType,
} from "@/utils/download-security";

const albumArtistCache = new Map<number, string[] | Promise<string[]>>();
const MAX_ALBUM_ARTIST_CACHE_SIZE = 100;

/** 浏览器端单文件下载体积上限（超过则中止，避免整文件驻留内存导致页面崩溃） */
const MAX_BROWSER_DOWNLOAD_SIZE = 512 * 1024 * 1024;
/** 浏览器端单任务下载超时时间（毫秒，10 分钟） */
const BROWSER_DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

interface DownloadConfig {
  fileName: string;
  fileType: string;
  path: string;
  downloadMeta: boolean;
  downloadCover: boolean;
  downloadLyric: boolean;
  saveMetaFile: boolean;
  songData: SongType;
  lyric: string;
  albumArtists: string[];
  skipIfExist: boolean;
  threadCount: number;
  referer?: string;
  enableDownloadHttp2: boolean;
}

interface DownloadStrategy {
  readonly id: number;
  readonly name: string;
  readonly song: SongType;
  readonly downloadUrl: string;

  // 准备阶段：获取链接，获取歌词，处理元数据
  prepare(): Promise<void>;

  // 执行阶段：返回给 Electron 下载器需要的配置对象
  getDownloadConfig(): DownloadConfig;

  // 收尾阶段：处理 ASS 生成，歌词文件写入
  postProcess(downloadedFilePath: string): Promise<void>;
}

/**
 * 歌曲下载策略
 */
class SongDownloadStrategy implements DownloadStrategy {
  private settingStore = useSettingStore();
  private dataStore = useDataStore();

  // prepare 阶段准备的状态
  private _downloadUrl = "";
  private fileType = "mp3";
  private lyricResult: LyricResult | null = null;
  private basicLyric = "";
  private ttmlLyric = "";
  private yrcLyric = "";
  private albumArtists: string[] = [];

  constructor(
    public readonly song: SongType,
    private quality: SongLevelType,
  ) {}

  get id() {
    return this.song.id;
  }
  get name() {
    return this.song.name;
  }
  get downloadUrl() {
    return this._downloadUrl;
  }
  get qualityLevel() {
    return this.quality;
  }

  async prepare(): Promise<void> {
    // 解析下载链接
    const { url, type } = await this.resolveUrl();
    this._downloadUrl = url;
    this.fileType = type;

    // 获取歌词
    if (this.shouldDownloadLyrics()) {
      this.lyricResult = (await songLyric(this.song.id)) as LyricResult;

      const options: LyricProcessorOptions = {
        downloadLyricToTraditional: this.settingStore.downloadLyricToTraditional,
        downloadLyricTranslation: this.settingStore.downloadLyricTranslation,
        downloadLyricRomaji: this.settingStore.downloadLyricRomaji,
        downloadLyricEncoding: this.settingStore.downloadLyricEncoding,
      };

      // 处理基础歌词
      this.basicLyric = await LyricProcessor.processBasic(this.lyricResult, options);

      // 处理逐字歌词 (后续使用)
      const { downloadMakeYrc, downloadSaveAsAss } = this.settingStore;
      if (downloadMakeYrc || downloadSaveAsAss) {
        let ttmlLyric = "";
        const yrcLyric = this.lyricResult?.yrc?.lyric || "";
        let qmResultData;

        try {
          const ttmlRes = await songLyricTTML(this.song.id);
          if (typeof ttmlRes === "string") ttmlLyric = ttmlRes;
        } catch (e) {
          console.error("Failed to fetch TTML", e);
        }

        if (!ttmlLyric && !yrcLyric) {
          try {
            const artistsStr = Array.isArray(this.song.artists)
              ? this.song.artists.map((a) => a.name).join("/")
              : String(this.song.artists || "");
            const keyword = `${this.song.name}-${artistsStr}`;
            const qmResult = await qqMusicMatch(keyword);
            if (qmResult?.code === 200 && qmResult?.qrc) {
              qmResultData = qmResult;
            }
          } catch (e) {
            console.error("QM Fallback failed", e);
          }
        }

        const verbatim = LyricProcessor.parseVerbatim(ttmlLyric, yrcLyric, qmResultData);
        this.ttmlLyric = verbatim.ttml;
        this.yrcLyric = verbatim.yrc;
      }
    }

    // 处理专辑艺术家信息（仅客户端需要写入元数据）
    if (isElectron && this.settingStore.downloadMeta) {
      const album = this.song.album;
      if (typeof album !== "string") {
        const cached = albumArtistCache.get(album.id);
        if (cached instanceof Array) {
          this.albumArtists = cached;
        } else if (cached instanceof Promise) {
          this.albumArtists = await cached;
        } else {
          const promise = albumDetail(album.id)
            .then((res) => {
              if (res.code === 200) {
                const artistName = res?.album?.artists?.map((a) => a.name) || [];
                albumArtistCache.set(album.id, artistName);
                // 控制缓存大小
                if (albumArtistCache.size > MAX_ALBUM_ARTIST_CACHE_SIZE) {
                  for (const [k, v] of albumArtistCache) {
                    if (v instanceof Array) {
                      albumArtistCache.delete(k);
                      if (albumArtistCache.size < MAX_ALBUM_ARTIST_CACHE_SIZE) break;
                    }
                  }
                }
                return artistName;
              }
              return [];
            })
            .catch((e) => {
              console.error(`获取专辑艺术家失败: ${album.id}`, e);
              return [];
            });
          albumArtistCache.set(album.id, promise);
          this.albumArtists = await promise;
        }
      }
    }
  }
  /**
   * 获取下载配置
   * @returns 下载配置
   */
  getDownloadConfig(): DownloadConfig {
    const fileName = this.getFileName();
    const targetPath = this.getDownloadPath();
    const { downloadMeta, downloadCover, saveMetaFile, downloadThreadCount, enableDownloadHttp2 } =
      this.settingStore;

    return {
      fileName,
      fileType: sanitizeFileType(this.fileType),
      path: targetPath,
      downloadMeta: downloadMeta,
      downloadCover: downloadCover && downloadMeta,
      downloadLyric: this.shouldDownloadLyrics(),
      saveMetaFile: downloadMeta && saveMetaFile,
      songData: cloneDeep(this.song),
      lyric: this.basicLyric,
      albumArtists: this.albumArtists,
      skipIfExist: true,
      threadCount: downloadThreadCount,
      enableDownloadHttp2: enableDownloadHttp2,
    };
  }
  /**
   * 后置处理
   * @param downloadedFilePath 下载文件路径
   */
  async postProcess(downloadedFilePath: string): Promise<void> {
    console.log(`Post-processing file: ${downloadedFilePath}`);
    // 使用存储的文件名和路径
    const fileName = this.getFileName();
    const targetPath = this.getDownloadPath();
    const { downloadMakeYrc, downloadSaveAsAss } = this.settingStore;

    const options: LyricProcessorOptions = {
      downloadLyricToTraditional: this.settingStore.downloadLyricToTraditional,
      downloadLyricTranslation: this.settingStore.downloadLyricTranslation,
      downloadLyricRomaji: this.settingStore.downloadLyricRomaji,
      downloadLyricEncoding: this.settingStore.downloadLyricEncoding,
    };

    if (downloadMakeYrc) {
      const result = await LyricProcessor.generateVerbatimContent(
        this.ttmlLyric,
        this.yrcLyric,
        this.lyricResult,
        options,
      );
      if (result && window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("save-file", {
          targetPath,
          fileName,
          ext: result.ext,
          content: result.content,
          encoding: result.encoding,
        });
      }
    }

    if (downloadSaveAsAss) {
      const artist = Array.isArray(this.song.artists)
        ? this.song.artists[0]?.name
        : String(this.song.artists || "");
      const result = await LyricProcessor.generateAssContent(
        this.ttmlLyric,
        this.yrcLyric,
        this.lyricResult,
        this.song.name,
        artist,
        options,
      );

      if (result && window.electron?.ipcRenderer) {
        await window.electron.ipcRenderer.invoke("save-file", {
          targetPath,
          fileName,
          ext: "ass",
          content: result.content,
          encoding: result.encoding,
        });
      }
    }
  }

  private async resolveUrl(): Promise<{ url: string; type: string }> {
    const usePlayback = this.settingStore.usePlaybackForDownload;
    const levelName = songLevelData[this.quality].level;

    // 尝试使用播放链接
    if (usePlayback) {
      try {
        const result = await songUrl(this.song.id, levelName as Parameters<typeof songUrl>[1]);
        const playbackData = result?.data?.[0];
        if (result.code === 200 && playbackData?.url) {
          this.assertDownloadableData(playbackData);
          return {
            url: playbackData.url,
            type: sanitizeFileType(playbackData.type || playbackData.encodeType || "mp3"),
          };
        }
      } catch (e) {
        console.error("Error fetching playback url for download:", e);
      }
    }

    // 尝试使用解锁链接
    const isVipUser = this.dataStore.userData?.vipType > 0;
    const isRestricted = this.song.free === 1 || this.song.free === 4 || this.song.free === 8;
    const canUseUnlock = !isRestricted || isVipUser;

    if (this.settingStore.useUnlockForDownload && canUseUnlock) {
      try {
        const servers = this.settingStore.songUnlockServer
          .filter((s) => s.enabled)
          .map((s) => s.key);
        const artist =
          (Array.isArray(this.song.artists)
            ? this.song.artists.map((a) => a.name).join(" & ")
            : this.song.artists) || "";
        const keyWord = `${this.song.name}-${artist}`;

        if (servers.length > 0) {
          const results = await Promise.allSettled(
            servers.map((server) =>
              unlockSongUrl(this.song.id, keyWord, server, this.song.name, String(artist)).then(
                (result) => ({
                  server,
                  result,
                  success: result.code === 200 && !!result.url,
                }),
              ),
            ),
          );

          for (const r of results) {
            if (r.status === "fulfilled" && r.value.success) {
              const unlockUrl = r.value?.result?.url;
              if (unlockUrl) {
                // 解锁源属于不受信任来源：额外拦截异常协议与内网/回环地址（防盲 SSRF）
                assertSafeDownloadUrl(unlockUrl, true);
                const extensionMatch = unlockUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
                return {
                  url: unlockUrl,
                  type: sanitizeFileType(extensionMatch ? extensionMatch[1] : "mp3"),
                };
              }
            }
          }
        }
      } catch (e) {
        console.error("Error fetching unlock url for download:", e);
      }
    }

    // 标准下载流程
    const result = await songDownloadUrl(this.song.id, this.quality);
    if (result.code === 200 && result?.data?.url) {
      this.assertDownloadableData(result.data);
      return {
        url: result.data.url,
        type: sanitizeFileType(result.data.type || "mp3"),
      };
    }

    // 下载接口不可用时，回退使用播放链接
    try {
      const playbackResult = await songUrl(
        this.song.id,
        levelName as Parameters<typeof songUrl>[1],
      );
      const playbackData = playbackResult?.data?.[0];
      if (playbackResult.code === 200 && playbackData?.url) {
        this.assertDownloadableData(playbackData);
        return {
          url: playbackData.url,
          type: sanitizeFileType(playbackData.type || playbackData.encodeType || "mp3"),
        };
      }
    } catch (e) {
      console.error("Error fetching playback url for download fallback:", e);
    }

    throw new Error(this.getDownloadErrorMessage(result));
  }
  /**
   * 校验接口返回的下载数据是否可用于完整下载
   * - 仅允许 http/https 协议
   * - 拦截「不可完整收听 / 仅可试听片段」的无权限响应，避免把 30s 试听当成完整文件保存
   * @param data 接口返回的音频数据
   */
  private assertDownloadableData(data: any): void {
    if (!data?.url) throw new Error("获取下载链接失败");
    // 统一按「不受信任来源」校验：拦截内网/回环/保留地址（含 IPv4-mapped IPv6），
    // 避免浏览器/客户端被接口返回值诱导去请求内网（SSRF 型探测）
    assertSafeDownloadUrl(String(data.url), true);
    const privilege = data?.freeTrialPrivilege;
    // 明确标记为无权收听
    if (privilege?.cannotListenReason) {
      throw new Error("当前账号无权下载该歌曲，请检查登录状态或会员权限");
    }
    // 付费资源（仅可试听）：资源可消费但当前用户不可消费
    if (privilege?.resConsumable === true && privilege?.userConsumable === false) {
      throw new Error("该歌曲需要 VIP 会员，当前账号会员等级不足");
    }
    // 试听片段（fragmentType > 0 或存在试听结束时间）
    const trial = data?.freeTrialInfo;
    if (trial && (Number(trial.fragmentType) > 0 || Number(trial.end) > 0)) {
      throw new Error("该歌曲需要 VIP 会员，当前账号会员等级不足");
    }
  }
  /**
   * 解析下载接口错误信息（登录/会员权限等）
   * @param result 下载接口返回数据
   * @returns 错误信息
   */
  private getDownloadErrorMessage(result: any): string {
    const data = result?.data;
    const innerCode = data?.code;
    // -110: 需要会员 / 会员等级不足
    if (innerCode === -110 || innerCode === -447) {
      return "该歌曲需要 VIP 会员，当前账号会员等级不足";
    }
    // 404 / cannotListenReason: 无版权或账号无播放权限
    if (innerCode === 404 || data?.freeTrialPrivilege?.cannotListenReason === 1) {
      return "当前账号无权下载该歌曲，请检查登录状态或会员权限";
    }
    return result?.message || data?.message || "获取下载链接失败";
  }
  /**
   * 获取文件名
   * @returns 文件名
   */
  private getFileName(): string {
    const infoObj = getPlayerInfoObj(this.song) || {
      name: this.song.name || "未知歌曲",
      artist: "未知歌手",
    };
    const baseTitle = sanitizeFileName(infoObj.name || "未知歌曲");
    const safeArtist = sanitizeFileName(infoObj.artist || "未知歌手");
    const { fileNameFormat } = this.settingStore;

    let displayName = baseTitle;
    if (fileNameFormat === "artist-title") displayName = `${safeArtist} - ${baseTitle}`;
    else if (fileNameFormat === "title-artist") displayName = `${baseTitle} - ${safeArtist}`;

    return sanitizeFileName(displayName);
  }
  /**
   * 获取下载路径
   * @returns 下载路径
   */
  private getDownloadPath(): string {
    const finalPath = this.settingStore.downloadPath;
    const infoObj = getPlayerInfoObj(this.song) || { artist: "未知歌手", album: "未知专辑" };
    const safeArtist = sanitizeFileName(infoObj.artist || "未知歌手");
    const safeAlbum = sanitizeFileName(infoObj.album || "未知专辑");
    const { folderStrategy } = this.settingStore;

    if (folderStrategy === "artist") return `${finalPath}/${safeArtist}`;
    else if (folderStrategy === "artist-album") return `${finalPath}/${safeArtist}/${safeAlbum}`;
    return finalPath;
  }

  private shouldDownloadLyrics(): boolean {
    // 网页版浏览器下载不支持写入歌词/元数据文件
    return isElectron && this.settingStore.downloadLyric && this.settingStore.downloadMeta;
  }
}

// 下载管理器核心类

class DownloadManager {
  private queue: DownloadStrategy[] = [];
  private activeDownloads: Set<number> = new Set();
  /** 浏览器端下载的中止控制器 */
  private abortControllers: Map<number, AbortController> = new Map();
  private maxConcurrent: number = 1;
  private initialized: boolean = false;

  constructor() {
    this.setupIpcListeners();
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    const dataStore = useDataStore();

    // 清理卡住的任务状态（仅重置状态，不自动续传）
    dataStore.downloadingSongs.forEach((item) => {
      // 防御：历史/损坏的持久化数据可能出现 song 缺失，跳过避免启动即崩溃
      if (!item?.song?.id) return;
      if (item.status === "downloading") {
        dataStore.updateDownloadStatus(item.song.id, "waiting");
        dataStore.updateDownloadProgress(item.song.id, 0, "0MB", "0MB");
      }
    });

    // 仅在 Cookie 登录态下恢复队列，避免未登录/退出登录后自动发起下载
    if (isLogin() === 1) {
      this.resumeWaitingTasks();
    } else {
      console.log("[DownloadManager] 当前未使用 Cookie 登录，跳过恢复下载队列");
    }
  }
  /**
   * 恢复等待中的下载任务（仅登录态下调用）
   */
  private resumeWaitingTasks() {
    const dataStore = useDataStore();
    dataStore.downloadingSongs.forEach((item) => {
      if (!item?.song?.id) return;
      if (item.status !== "waiting") return;
      const isQueued = this.queue.some((s) => s.id === item.song.id);
      const isActive = this.activeDownloads.has(item.song.id);
      if (!isQueued && !isActive) {
        // 常规歌曲下载
        this.queue.push(new SongDownloadStrategy(item.song as SongType, item.quality));
      }
    });
    this.processQueue();
  }
  /**
   * 设置 IPC 监听器
   */
  private setupIpcListeners() {
    if (typeof window === "undefined" || !window.electron?.ipcRenderer) return;
    window.electron.ipcRenderer.on("download-progress", (_event, progress) => {
      const { id, percent, transferredBytes, totalBytes } = progress;
      if (!id) return;
      const dataStore = useDataStore();
      const transferred = transferredBytes
        ? (transferredBytes / 1024 / 1024).toFixed(2) + "MB"
        : "0MB";
      const total = totalBytes ? (totalBytes / 1024 / 1024).toFixed(2) + "MB" : "0MB";
      dataStore.updateDownloadProgress(id, Number((percent * 100).toFixed(1)), transferred, total);
    });
  }
  /**
   * 获取已下载的歌曲
   * @returns 已下载的歌曲列表
   */
  public async getDownloadedSongs(): Promise<Record<string, unknown>[]> {
    const dataStore = useDataStore();
    // 网页版：返回浏览器下载完成记录
    if (!isElectron) {
      return dataStore.downloadedSongs.map(
        (item) => item.song as unknown as Record<string, unknown>,
      );
    }
    const settingStore = useSettingStore();
    const downloadPath = settingStore.downloadPath;
    if (!downloadPath) return [];
    try {
      return await window.electron.ipcRenderer.invoke("get-downloaded-songs", downloadPath);
    } catch (error) {
      console.error("Failed to get downloaded songs:", error);
      return [];
    }
  }
  /**
   * 添加下载任务
   * @param song 歌曲信息
   * @param quality 歌曲质量
   */
  public async addDownload(song: SongType, quality: SongLevelType) {
    // 下载必须使用 Cookie 登录（isLogin()：0 未登录 / 1 正常登录 / 2 UID 登录）
    const loginState = isLogin();
    if (loginState === 0) {
      window.$message.warning("请登录后使用下载功能");
      return;
    }
    if (loginState !== 1) {
      window.$message.warning("当前登录模式暂不支持下载，请使用 Cookie 登录");
      return;
    }
    // init() 内部已在登录态下恢复历史等待任务，此处无需重复触发
    this.init();
    const dataStore = useDataStore();
    if (this.checkExisting(song.id)) return;
    dataStore.addDownloadingSong(song, quality);
    const strategy = new SongDownloadStrategy(song, quality);
    this.queue.push(strategy);
    this.processQueue();
  }
  /**
   * 移除下载任务
   * @param id 歌曲ID
   */
  public removeDownload(id: number) {
    const dataStore = useDataStore();
    // 如果正在下载，取消浏览器端下载请求
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
    if (this.activeDownloads.has(id)) {
      this.activeDownloads.delete(id);
    }
    // 从队列中移除
    this.queue = this.queue.filter((task) => task.id !== id);
    // 从 store 移除
    dataStore.removeDownloadingSong(id);
    // 尝试处理下一个任务
    this.processQueue();
  }
  /**
   * 移除全部下载任务
   */
  public removeAllDownloads() {
    const dataStore = useDataStore();
    const ids = dataStore.downloadingSongs
      .map((item) => item?.song?.id)
      .filter((id): id is number => typeof id === "number");
    // 批量取消：先统一中止在途请求并清理内存态，再一次性清空列表，
    // 避免逐项 removeDownload → processQueue 造成的重复遍历与多次响应式更新
    ids.forEach((id) => {
      this.abortControllers.get(id)?.abort();
      this.abortControllers.delete(id);
      this.activeDownloads.delete(id);
    });
    this.queue = [];
    dataStore.clearDownloadingSongs();
  }
  /**
   * 重新下载任务
   * @param id 歌曲ID
   */
  public retryDownload(id: number) {
    const dataStore = useDataStore();
    const task = dataStore.downloadingSongs.find((s) => s?.song?.id === id);
    if (!task || !task.song) return;
    // 避免重复入队：同一任务已在队列/正在下载时直接忽略
    if (this.queue.some((s) => s.id === id) || this.activeDownloads.has(id)) return;
    dataStore.updateDownloadStatus(id, "waiting");
    // 重新加入队列
    this.queue.push(new SongDownloadStrategy(task.song as SongType, task.quality));
    this.processQueue();
  }
  /**
   * 重新下载所有失败的任务
   */
  public retryAllDownloads() {
    this.init();
    const dataStore = useDataStore();
    const failedSongs = dataStore.downloadingSongs
      .filter((item) => item.status === "failed" && item?.song?.id)
      .map((item) => item.song.id);
    failedSongs.forEach((id) => this.retryDownload(id));
  }
  /**
   * 检查是否存在相同的下载任务
   * @param id 歌曲ID
   * @returns 是否存在相同的下载任务
   */
  private checkExisting(id: number): boolean {
    const dataStore = useDataStore();
    const existing = dataStore.downloadingSongs.find((item) => item?.song?.id === id);

    if (existing) {
      if (existing.status === "failed") {
        this.retryDownload(id);
        return true;
      }
      const isQueued = this.queue.some((s) => s.id === id);
      const isActive = this.activeDownloads.has(id);
      if (
        isQueued ||
        isActive ||
        existing.status === "waiting" ||
        existing.status === "downloading"
      ) {
        return true;
      }
    }
    return false;
  }
  /**
   * 处理下载队列
   */
  private processQueue() {
    while (this.activeDownloads.size < this.maxConcurrent && this.queue.length > 0) {
      const strategy = this.queue.shift();
      if (strategy) this.startTask(strategy);
    }
  }
  /**
   * 开始下载任务
   * @param strategy 下载策略
   */
  private async startTask(strategy: DownloadStrategy) {
    this.activeDownloads.add(strategy.id);
    // 任务开始即注册中止控制器：保证 prepare（解析下载地址）阶段也能被取消
    const controller = new AbortController();
    this.abortControllers.set(strategy.id, controller);
    const dataStore = useDataStore();
    dataStore.updateDownloadStatus(strategy.id, "downloading");

    try {
      await strategy.prepare();
      // 解析下载地址期间可能已被用户取消，此处必须再次确认
      if (controller.signal.aborted || !this.activeDownloads.has(strategy.id)) {
        console.log(`Download cancelled before start: ${strategy.name} (ID: ${strategy.id})`);
        return;
      }
      const config = strategy.getDownloadConfig();

      if (isElectron) {
        if (!strategy.downloadUrl) throw new Error("Download URL missing");

        const downloadResult = await window.electron.ipcRenderer.invoke(
          "download-file",
          strategy.downloadUrl,
          config,
        );

        if (downloadResult.status === "success" || downloadResult.status === "skipped") {
          await strategy.postProcess(downloadResult.path || config.path); // IPC 返回结果通常包含路径
          dataStore.removeDownloadingSong(strategy.id);
          window.$message.success(`${strategy.name} 下载完成`);
        } else {
          if (downloadResult.status === "cancelled") {
            // 已取消，无需处理
          } else {
            throw new Error(downloadResult.message || "下载失败");
          }
        }
      } else {
        // 浏览器端下载
        if (!strategy.downloadUrl) throw new Error("Download URL missing");
        await this.downloadInBrowser(strategy, config, controller);
      }
    } catch (error: any) {
      // 用户主动取消时不提示失败
      if (error?.name === "AbortError") {
        console.log(`Download cancelled: ${strategy.name} (ID: ${strategy.id})`);
      } else {
        console.error(`Error processing task ${strategy.name} (ID: ${strategy.id}):`, error);
        if (error?.message) console.error("Error message:", error.message);
        dataStore.markDownloadFailed(strategy.id);
        window.$message.error(error.message || "下载出错");
      }
    } finally {
      this.abortControllers.delete(strategy.id);
      this.activeDownloads.delete(strategy.id);
      this.processQueue();
    }
  }
  /**
   * 浏览器端下载（带进度）
   * @param strategy 下载策略
   * @param config 下载配置
   * @param controller 中止控制器（由 startTask 提前注册，使准备阶段也可取消）
   */
  private async downloadInBrowser(
    strategy: DownloadStrategy,
    config: DownloadConfig,
    controller: AbortController,
  ) {
    const dataStore = useDataStore();
    // 网易云 CDN 地址可能为 http，统一升级为 https 避免混合内容拦截
    const url = strategy.downloadUrl.replace(/^http:\/\//i, "https://");
    // 兜底校验：阻断 data: / blob: / file: 等异常协议与内网/回环地址
    assertSafeDownloadUrl(url, true);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, BROWSER_DOWNLOAD_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`下载请求失败（HTTP ${response.status}）`);
      }
      // 跟随重定向后再次校验最终地址：避免被 302 引导到内网/异常协议（受限来源尤其重要）
      assertSafeDownloadUrl(response.url || url, true);

      const contentLength = Number(response.headers.get("Content-Length")) || 0;
      if (contentLength > MAX_BROWSER_DOWNLOAD_SIZE) {
        throw new Error(`文件过大（${formatFileSize(contentLength)}），已取消下载`);
      }

      const contentType = response.headers.get("Content-Type") || "audio/mpeg";
      const reader = response.body?.getReader();
      const chunks: BlobPart[] = [];
      let received = 0;
      // 进度上报节流：逐个 chunk 上报会引发高频响应式更新与字符串格式化，
      // 改为「进度变化 ≥1% 或距上次上报 ≥200ms」时上报（肉眼无差别，开销显著下降）
      const totalText = contentLength ? formatFileSize(contentLength) : "未知";
      let lastPercent = -1;
      let lastReportAt = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            // 未声明大小或声明值不准确时，同样需要保护内存占用
            if (received > MAX_BROWSER_DOWNLOAD_SIZE) {
              controller.abort();
              throw new Error(`文件过大（${formatFileSize(received)}），已取消下载`);
            }
            const percent = contentLength ? (received / contentLength) * 100 : 0;
            const now = Date.now();
            if (percent - lastPercent >= 1 || now - lastReportAt >= 200) {
              lastPercent = percent;
              lastReportAt = now;
              dataStore.updateDownloadProgress(
                strategy.id,
                Number(percent.toFixed(1)),
                formatFileSize(received),
                totalText,
              );
            }
          }
        }
      } else {
        // 不支持流式读取时退回整块读取
        const blob = await response.blob();
        chunks.push(blob);
        received = blob.size;
      }

      // 传输不完整（连接中断等）时按失败处理，避免保存损坏文件
      if (contentLength && received < contentLength) {
        throw new Error("下载不完整，请重试");
      }

      // 下载过程中被取消或任务已从列表移除时不再保存
      if (controller.signal.aborted || !this.activeDownloads.has(strategy.id)) {
        console.log(`Download cancelled: ${strategy.name} (ID: ${strategy.id})`);
        return;
      }

      const blob = new Blob(chunks, { type: contentType });
      // Blob 已持有数据副本，及时释放 chunk 引用以降低内存峰值
      chunks.length = 0;
      const fileType = this.resolveAudioFileType(config.fileType, contentType);
      saveAs(blob, `${config.fileName}.${fileType}`);

      // 记录已完成下载
      dataStore.addDownloadedSong({
        song: config.songData,
        quality: (strategy as SongDownloadStrategy).qualityLevel,
        fileName: config.fileName,
        fileType,
        size: formatFileSize(received || blob.size),
        time: Date.now(),
      });
      dataStore.removeDownloadingSong(strategy.id);
      window.$message.success(`${strategy.name} 下载完成`);
    } catch (error: any) {
      // 超时触发的 abort 需要给出明确提示，而不是当成用户取消
      if (timedOut && error?.name === "AbortError") {
        throw new Error("下载超时，请检查网络后重试");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  /**
   * 解析浏览器下载使用的扩展名（白名单，避免保存 .html 等可执行扩展名）
   * @param fileType 接口返回的扩展名
   * @param contentType 响应 Content-Type
   * @returns 安全的音频扩展名
   */
  private resolveAudioFileType(fileType: string, contentType: string): string {
    const candidate = sanitizeFileType(fileType || this.getFileTypeFromType(contentType));
    if (ALLOWED_AUDIO_EXTENSIONS.has(candidate)) return candidate;
    const fromMime = sanitizeFileType(this.getFileTypeFromType(contentType));
    return ALLOWED_AUDIO_EXTENSIONS.has(fromMime) ? fromMime : "mp3";
  }
  /**
   * 从 MIME 类型推断文件扩展名
   * @param contentType MIME 类型
   * @returns 文件扩展名
   */
  private getFileTypeFromType(contentType: string): string {
    if (contentType.includes("flac")) return "flac";
    if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
    if (contentType.includes("wav")) return "wav";
    if (contentType.includes("ogg")) return "ogg";
    return "mp3";
  }
}

export const downloadManager = new DownloadManager();
export const useDownloadManager = () => downloadManager;
export default downloadManager;
