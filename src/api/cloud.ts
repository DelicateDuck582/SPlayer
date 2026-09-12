import md5 from "md5";
import request from "@/utils/request";

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

/** 云盘上传：换取上传凭据（现代流程第一步） */
export const cloudUploadToken = (params: {
  md5: string;
  fileSize: number;
  filename: string;
  bitrate?: number;
}) => {
  return request<Record<string, unknown>>({
    url: "/cloud/upload/token",
    params: { ...params, timestamp: Date.now() },
  });
};

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
}) => {
  return request<Record<string, unknown>>({
    url: "/cloud/upload/complete",
    method: "post",
    params: { ...params, timestamp: Date.now() },
  });
};

/**
 * 直传到网易云 NOS（单请求完整上传：uploadUrl 已带 `offset=0&complete=true`）
 * @param uploadUrl 直传地址（由 /cloud/upload/token 返回）
 * @param token NOS 上传令牌（请求头 x-nos-token）
 * @param file 待上传文件
 * @param onProgress 进度回调（percent 0~100）
 */
const putToNos = (
  uploadUrl: string,
  token: string,
  file: File,
  onProgress?: (percent: number, loaded: number, total: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    // NOS 直传靠 x-nos-token 鉴权，不携带本站 Cookie（无需 withCredentials）
    xhr.setRequestHeader("x-nos-token", token);
    xhr.setRequestHeader("Content-Type", file.type || "audio/mpeg");
    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      const total = event.total || file.size || 0;
      const loaded = event.loaded || 0;
      onProgress(
        total ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
        loaded,
        total,
      );
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`文件直传失败（HTTP ${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error("文件直传失败（网络错误或被跨域策略拦截）"));
    xhr.send(file);
  });

/**
 * 上传本地音频文件到网易云云盘
 *
 * 流程（对齐新版客户端 / api-enhanced 现有接口）：
 *   1. 计算文件 MD5（用于秒传判断与云端登记）
 *   2. `GET /cloud/upload/token` 换取 `uploadUrl` / `uploadToken` / `resourceId` / `songId`
 *   3. 直传 NOS（`needUpload === false` 时跳过：云端已有相同 MD5 文件）
 *   4. `POST /cloud/upload/complete` 登记云盘信息
 *
 * @param file 音频文件
 * @param onProgress 直传阶段进度回调（percent 0~100）
 * @returns 完成接口响应（`code === 200` 为成功；`data.songId` 为空表示未匹配曲库）
 */
export const uploadCloudSong = async (
  file: File,
  onProgress?: (percent: number, loaded: number, total: number) => void,
) => {
  // 1) 计算 MD5（整文件读入内存；上层已做大小上限校验）
  const buffer = await file.arrayBuffer();
  const fileMd5 = md5(new Uint8Array(buffer));

  // 2) 换取上传凭据
  const tokenResult = await cloudUploadToken({
    md5: fileMd5,
    fileSize: file.size,
    filename: file.name,
  });
  const tokenData = (tokenResult?.data ?? {}) as Record<string, unknown>;
  if (Number(tokenResult?.code) !== 200 || !tokenData.resourceId) {
    // 交由调用方按 code 提示（如 -110 未登录 / -447 权限不足）
    return tokenResult;
  }

  // 3) 直传（needUpload === false 表示云端已存在相同文件）
  const uploadUrl = typeof tokenData.uploadUrl === "string" ? tokenData.uploadUrl : "";
  const uploadToken = typeof tokenData.uploadToken === "string" ? tokenData.uploadToken : "";
  if (tokenData.needUpload !== false && uploadUrl && uploadToken) {
    await putToNos(uploadUrl, uploadToken, file, onProgress);
  }

  // 4) 登记云盘信息
  return await cloudUploadComplete({
    songId: String(tokenData.songId ?? 0),
    resourceId: String(tokenData.resourceId),
    md5: fileMd5,
    filename: file.name,
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
