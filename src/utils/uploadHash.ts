/**
 * 内容 MD5 计算（Web Worker）
 *
 * 性能：大文件哈希（200MB ≈ 秒级）若在渲染主线程执行会导致界面卡顿，
 * 这里放到 Worker 中计算；Worker 不可用或启动失败时自动回退主线程。
 * 同一套逻辑同时服务于「整文件 MD5」（上传凭据）与「分片 MD5」（NOS 直传 Content-MD5 头）。
 */
import md5 from "md5";

/** 主线程回退实现 */
const hashOnMainThread = async (blob: Blob) => {
  const buffer = await blob.arrayBuffer();
  return md5(new Uint8Array(buffer));
};

/**
 * 在 Worker 中计算内容 MD5（Worker 不可用时回退主线程）
 * @param blob 待计算内容（文件或分片）
 * @returns 32 位十六进制 MD5
 */
const hashInWorker = async (blob: Blob): Promise<string> => {
  if (typeof Worker === "undefined") return await hashOnMainThread(blob);
  return await new Promise<string>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./uploadHash.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      // 环境不支持 module worker（如极旧内核）→ 回退主线程
      void hashOnMainThread(blob).then(resolve, reject);
      return;
    }
    let settled = false;
    const finish = (value?: string) => {
      if (settled) return false;
      settled = true;
      worker.terminate();
      if (value) resolve(value);
      return true;
    };
    worker.onmessage = (event: MessageEvent<{ md5?: string; error?: string }>) => {
      if (event.data?.md5) {
        finish(event.data.md5);
        return;
      }
      if (finish()) reject(new Error(event.data?.error || "文件校验值计算失败"));
    };
    worker.onerror = () => {
      // Worker 运行异常 → 回退主线程，保证上传可用
      if (settled) return;
      settled = true;
      worker.terminate();
      void hashOnMainThread(blob).then(resolve, reject);
    };
    worker.postMessage({ file: blob });
  });
};

/**
 * 计算文件 MD5
 * @param file 待计算文件
 * @returns 32 位十六进制 MD5
 */
export const hashFileMd5 = async (file: File): Promise<string> => await hashInWorker(file);

/**
 * 计算二进制分片的 MD5
 *
 * 用途：网易云 NOS 直传协议要求请求头 `Content-MD5`，
 * 该值按「请求体」计算（分片直传即当前分片的 MD5；单分片文件等价于整文件 MD5）。
 * @param blob 分片内容
 * @returns 32 位十六进制 MD5
 */
export const md5HexOfBlob = async (blob: Blob): Promise<string> => await hashInWorker(blob);
