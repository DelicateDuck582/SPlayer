/**
 * 云盘上传队列（localStorage 持久化）
 *
 * 目的：页面刷新/关闭后仍保留「已直传字节」与上传凭据；
 * 浏览器不允许脚本持有文件句柄，因此用户**重新选择同一文件**即可断点续传。
 */

/** 上传任务（断点续传所需的最小状态） */
export interface CloudUploadTask {
  /** 文件标识（name|size|lastModified），用于重新选择文件时匹配 */
  key: string;
  /** 文件名 */
  fileName: string;
  /** 文件体积（字节） */
  fileSize: number;
  /** 文件 MD5 */
  md5: string;
  /** 云盘曲目 id（token 接口返回，未匹配曲库时为 "0"） */
  songId: string;
  /** NOS 资源 id */
  resourceId: string;
  /** NOS 直传地址（http，使用时升级为 https） */
  uploadUrl: string;
  /** NOS 上传令牌 */
  uploadToken: string;
  /** 已直传字节数（断点位置） */
  uploaded: number;
  /** 最近更新时间（用于过期判断） */
  savedAt: number;
}

/** 续传有效期：中断/凭据超过该时长后不再续传，重新走完整流程 */
export const RESUME_TTL = 30 * 60 * 1000;

/** localStorage 键名 */
const QUEUE_KEY = "cloud-upload-queue";

/**
 * 生成文件标识
 * @param file 文件
 * @returns `name|size|lastModified`
 */
export const fileKey = (file: File) => `${file.name}|${file.size}|${file.lastModified}`;

/**
 * 读取未完成的上传任务（自动过滤已过期/已完成项）
 * @returns 未完成任务列表
 */
export const readUploadQueue = (): CloudUploadTask[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as CloudUploadTask[];
    if (!Array.isArray(list)) return [];
    const now = Date.now();
    return list.filter(
      (task) =>
        task &&
        typeof task.key === "string" &&
        typeof task.uploaded === "number" &&
        task.uploaded < task.fileSize &&
        now - task.savedAt < RESUME_TTL,
    );
  } catch {
    // 数据损坏时视为无任务（避免阻塞上传）
    return [];
  }
};

/**
 * 写入/更新任务
 * @param task 上传任务
 */
export const saveUploadTask = (task: CloudUploadTask) => {
  try {
    const list = readUploadQueue().filter((item) => item.key !== task.key);
    list.push(task);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  } catch {
    // 忽略写入失败（如隐私模式禁写），不影响正常上传
  }
};

/**
 * 移除任务（上传成功或用户放弃）
 * @param key 文件标识
 */
export const removeUploadTask = (key: string) => {
  try {
    const list = readUploadQueue().filter((item) => item.key !== key);
    if (list.length) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  } catch {
    // 忽略
  }
};

/** 清空上传队列 */
export const clearUploadQueue = () => {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // 忽略
  }
};
