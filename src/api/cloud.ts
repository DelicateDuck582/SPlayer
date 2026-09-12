import md5 from "md5";
import request, { LOCAL_API_BASE } from "@/utils/request";
import { isLogin } from "@/utils/auth";
import { isElectron } from "@/utils/env";
import { RESUME_TTL, fileKey, type CloudUploadTask } from "@/utils/uploadQueue";

// 获取云盘数据
export const userCloud = (limit: number = 50, offset: number = 0) => {
  return request({
    url: "/user/cloud",
    params: {
      limit,
      offset,
      timestamp: Date.now(),
    },
  });
};

// 云盘歌曲删除
export const deleteCloudSong = (id: number) => {
  return request({
    url: "/user/cloud/del",
    params: {
      id,
      timestamp: Date.now(),
    },
  });
};

/**
 * 云盘歌曲信息匹配纠正
 * @param {string} uid - 用户 id
 * @param {string} sid - 原歌曲 id
 * @param {string} asid - 要匹配的歌曲 id
 */
export const matchCloudSong = (uid: number, sid: number, asid: number) => {
  return request({
    url: "/cloud/match",
    params: {
      uid,
      sid,
      asid,
      timestamp: Date.now(),
    },
  });
};

/**
 * 云盘上传类接口调用（带传输通道降级）
 *
 * 1. Electron 端优先走**本机内置 API**（127.0.0.1:25884，由主进程提供）：
 *    请求由用户本机网络发出，可规避在线 API 所在数据中心 IP 被网易云风控
 *    拦截（`-460 检测到您的网络环境存在风险`）的问题。
 * 2. 在线 API 返回 `-460` 且已登录时，携带 `checkToken=v2` 重试一次
 *    （API 侧据此实时换取易盾反作弊 token 并放入 `X-antiCheatToken` 头）。
 *
 * @param url 接口路径
 * @param params 查询参数
 * @param method 请求方法（默认 get）
 * @returns 接口响应
 */
const cloudUploadRequest = async (
  url: string,
  params: Record<string, unknown>,
  method: "get" | "post" = "get",
): Promise<Record<string, unknown>> => {
  const payload = { ...params, timestamp: Date.now() };
  if (isElectron) {
    try {
      const local = await request<Record<string, unknown>>({
        url,
        baseURL: LOCAL_API_BASE,
        method,
        params: payload,
      });
      // 本机 API 有响应即以它为准（其出口为用户本机网络，不受数据中心 IP 风控影响）
      if (local) return local;
    } catch {
      // 本机 API 不可用（未启动 / 内置版本过旧）→ 回退在线 API
    }
  }
  const online = await request<Record<string, unknown>>({ url, method, params: payload });
  if (Number(online?.code) === -460 && isLogin()) {
    return await request<Record<string, unknown>>({
      url,
      method,
      params: { ...payload, checkToken: "v2" },
    });
  }
  return online;
};

/** 云盘上传：换取上传凭据（现代流程第一步） */
export const cloudUploadToken = (params: {
  md5: string;
  fileSize: number;
  filename: string;
  bitrate?: number;
}) => cloudUploadRequest("/cloud/upload/token", { ...params });

/** 云盘上传：直传完成后登记云盘信息（现代流程第三步） */
export const cloudUploadComplete = (params: {
  songId: number | string;
  resourceId: string;
  md5: string;
  filename: string;
  song?: string;
  artist?: string;
  album?: string;
  bitrate?: number;
}) => cloudUploadRequest("/cloud/upload/complete", { ...params }, "post");

/** 直传分片大小（8MB）：分片直传可精确记录断点；小文件只会产生 1 个分片 */
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * 将 NOS 直传地址升级为 HTTPS
 *
 * LBS 返回的直传主机为 `http://nosup-*.127.net`：网页版页面多为 HTTPS，
 * 浏览器会按「混合内容」直接拦截该 PUT；实测 HTTPS 端点可用且 CORS 放行
 * （`Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: *`）。
 * @param url 原始直传地址
 * @returns 升级后的直传地址
 */
export const toSecureUploadUrl = (url: string) =>
  url.startsWith("http://") ? `https://${url.slice("http://".length)}` : url;

/**
 * 生成分片直传地址（改写 NOS 协议中的 offset / complete 参数）
 * @param uploadUrl 直传地址模板（形如 `?offset=0&complete=true&version=1.0`）
 * @param offset 本片起始偏移
 * @param complete 是否为最后一片
 * @returns 分片直传地址
 */
export const buildChunkUrl = (uploadUrl: string, offset: number, complete: boolean) =>
  uploadUrl
    .replace(/([?&])offset=\d+/, `$1offset=${offset}`)
    .replace(/([?&])complete=(?:true|false)/, `$1complete=${complete}`);

/**
 * 直传单个分片到 NOS
 * @param url 分片直传地址
 * @param token NOS 上传令牌（请求头 x-nos-token）
 * @param blob 分片数据
 * @param fileType 文件 MIME
 * @param offset 本片起始偏移
 * @param total 文件总大小
 * @param onProgress 进度回调（percent 0~100）
 */
const putChunk = (
  url: string,
  token: string,
  blob: Blob,
  fileType: string,
  offset: number,
  total: number,
  onProgress?: (percent: number, loaded: number, total: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    // NOS 直传靠 x-nos-token 鉴权，不携带本站 Cookie（无需 withCredentials）
    xhr.setRequestHeader("x-nos-token", token);
    xhr.setRequestHeader("Content-Type", fileType || "audio/mpeg");
    xhr.upload.onprogress = (event) => {
      const loaded = offset + (event.loaded || 0);
      const size = total || 0;
      onProgress?.(size ? Math.min(100, Math.round((loaded / size) * 100)) : 0, loaded, size);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`文件直传失败（HTTP ${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error("文件直传失败（网络错误或被跨域策略拦截）"));
    xhr.send(blob);
  });

/**
 * 分片直传文件（支持从 startOffset 断点续传）
 * @param file 待上传文件
 * @param target 直传凭据（uploadUrl / uploadToken）
 * @param startOffset 起始偏移（已直传字节数）
 * @param onProgress 进度回调
 * @param onUploaded 分片完成回调（用于持久化断点）
 * @returns 直传完成后的偏移
 */
const uploadFileChunks = async (
  file: File,
  target: Pick<CloudUploadTask, "uploadUrl" | "uploadToken">,
  startOffset: number,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  onUploaded?: (uploaded: number) => void,
) => {
  const url = toSecureUploadUrl(target.uploadUrl);
  const fileType = file.type || "audio/mpeg";
  let offset = Math.max(0, Math.min(startOffset, file.size));
  onProgress?.(file.size ? Math.round((offset / file.size) * 100) : 0, offset, file.size);
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_SIZE, file.size);
    const isLast = end >= file.size;
    await putChunk(
      buildChunkUrl(url, offset, isLast),
      target.uploadToken,
      file.slice(offset, end),
      fileType,
      offset,
      file.size,
      onProgress,
    );
    offset = end;
    onUploaded?.(offset);
  }
  return offset;
};

/**
 * 上传本地音频文件到网易云云盘（含秒传判断与断点续传）
 *
 * 流程（对齐新版客户端 / api-enhanced 现有接口）：
 *   1. 计算文件 MD5（用于秒传判断与云端登记）
 *   2. `GET /cloud/upload/token` 换取 `uploadUrl` / `uploadToken` / `resourceId` / `songId`
 *   3. **分片直传 NOS**（8MB/片，最后一片 `complete=true`；`needUpload === false` 时跳过）
 *   4. `POST /cloud/upload/complete` 登记云盘信息
 *
 * 刷新页面后浏览器不再持有文件句柄，但已直传字节与凭据已持久化在上传队列
 * （`@/utils/uploadQueue`），用户重新选择**同一文件**即可从断点续传。
 *
 * @param file 音频文件
 * @param onProgress 进度回调（percent 0~100）
 * @param options.resume 未完成的上传任务（用于断点续传）
 * @param options.onTask 任务状态变化回调（凭据就绪 / 每个分片完成后触发，用于持久化）
 * @returns 完成接口响应（`code === 200` 为成功；`data.songId` 为空表示未匹配曲库）
 */
export const uploadCloudSong = async (
  file: File,
  onProgress?: (percent: number, loaded: number, total: number) => void,
  options?: {
    resume?: CloudUploadTask;
    onTask?: (task: CloudUploadTask) => void;
  },
) => {
  const key = fileKey(file);
  let task: CloudUploadTask | undefined;

  // 1) 复用未完成任务（同一文件且未超期）
  const resume = options?.resume;
  if (resume && resume.key === key && Date.now() - resume.savedAt < RESUME_TTL && resume.md5) {
    task = { ...resume, savedAt: Date.now() };
  }

  // 2) 新建任务：计算 MD5 并换取上传凭据
  if (!task) {
    // 整文件读入内存计算 MD5（上层已按 UPLOAD_MAX_MB 限制体积）
    const buffer = await file.arrayBuffer();
    const fileMd5 = md5(new Uint8Array(buffer));
    const tokenResult = await cloudUploadToken({
      md5: fileMd5,
      fileSize: file.size,
      filename: file.name,
    });
    const tokenData = (tokenResult?.data ?? {}) as Record<string, unknown>;
    if (Number(tokenResult?.code) !== 200 || !tokenData.resourceId || !tokenData.uploadUrl) {
      // 交由调用方按 code 提示（如 -110 未登录 / -460 风控 / 301 需登录）
      return tokenResult;
    }
    task = {
      key,
      fileName: file.name,
      fileSize: file.size,
      md5: fileMd5,
      songId: String(tokenData.songId ?? 0),
      resourceId: String(tokenData.resourceId),
      uploadUrl: String(tokenData.uploadUrl),
      uploadToken: String(tokenData.uploadToken ?? ""),
      // needUpload === false：云端已有相同 MD5 文件，无需直传（秒传）
      uploaded: tokenData.needUpload === false ? file.size : 0,
      savedAt: Date.now(),
    };
    options?.onTask?.({ ...task });
  }

  // 3) 分片直传（从断点开始）
  if (task.uploaded < file.size) {
    await uploadFileChunks(file, task, task.uploaded, onProgress, (uploaded) => {
      // 每片完成后持久化断点，刷新后可续传
      task = { ...task!, uploaded, savedAt: Date.now() };
      options?.onTask?.({ ...task });
    });
  }
  onProgress?.(100, file.size, file.size);

  // 4) 登记云盘信息
  return await cloudUploadComplete({
    songId: task.songId,
    resourceId: task.resourceId,
    md5: task.md5,
    filename: task.fileName,
  });
};

/**
 * 云盘导入歌曲
 * @param {number} id - 歌曲 id
 * @param {string} song - 歌曲名称
 * @param {string} fileType - 歌曲格式
 * @param {number} fileSize - 歌曲大小
 * @param {number} bitrate - 歌曲比特率
 * @param {string} md5 - 歌曲 md5
 * @param {string} artist - 歌手
 * @param {string} album - 专辑
 */
export const importCloudSong = (
  song: string,
  fileType: string,
  fileSize: number,
  bitrate: number,
  md5: string,
  id?: number,
  artist?: string,
  album?: string,
) => {
  return request({
    url: "/cloud/import",
    method: "POST",
    params: { id, song, fileType, fileSize, bitrate, md5, artist, album, timestamp: Date.now() },
  });
};
