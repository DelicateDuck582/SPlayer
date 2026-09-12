/**
 * 文件 MD5 计算 Worker
 *
 * 入参：`{ file: File }`；出参：`{ md5 }` 或 `{ error }`
 * 放在 Worker 中执行可避免大文件哈希阻塞渲染主线程。
 */
import md5 from "md5";

type HashRequest = { file: File };
type HashResponse = { md5?: string; error?: string };

/** Worker 作用域（避免依赖 WebWorker lib 的类型声明） */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage: (message: HashResponse) => void;
};

scope.onmessage = async (event) => {
  try {
    const buffer = await event.data.file.arrayBuffer();
    scope.postMessage({ md5: md5(new Uint8Array(buffer)) });
  } catch (error) {
    scope.postMessage({
      error: error instanceof Error ? error.message : "文件校验值计算失败",
    });
  }
};
