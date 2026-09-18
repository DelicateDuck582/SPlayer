import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from "axios";
import { isDev } from "./env";
import { useSettingStore } from "@/stores";
import { getCookie } from "./cookie";
import { isLogin } from "./auth";
import axiosRetry from "axios-retry";

// 全局地址（构建时默认值）
/**
 * 构建时默认的网易云 API 地址
 * - 开发环境：走 Vite 代理 `/api/netease`
 * - 生产环境：取 `VITE_API_URL`（Vercel / 服务器部署时注入）
 *
 * 运行时可在「设置 → 网络 → API 服务」中切换为其它自建 API 源，见 `getApiBase`
 */
export const DEFAULT_API_BASE: string = String(
  isDev ? "/api/netease" : import.meta.env["VITE_API_URL"] || "",
).replace(/\/+$/, "");

/**
 * 规范化 API 地址：去除首尾空白与结尾斜杠
 * @param url 原始地址
 */
export const normalizeApiBase = (url: unknown): string =>
  String(url ?? "")
    .trim()
    .replace(/\/+$/, "");

/**
 * 当前生效的网易云 API 地址
 * 优先使用设置中的自定义地址，留空时回退到构建时默认地址
 */
export const getApiBase = (): string => {
  try {
    return normalizeApiBase(useSettingStore().apiBaseUrl) || DEFAULT_API_BASE;
  } catch {
    // pinia 尚未就绪（极早期调用）时回退到默认地址
    return DEFAULT_API_BASE;
  }
};

/**
 * 记录使用过的 API 地址（设置页快速切换用，最多 5 条，最近在前）
 * @param url API 地址（默认地址不入库）
 */
export const rememberApiBase = (url: string): void => {
  const value = normalizeApiBase(url);
  if (!value || value === DEFAULT_API_BASE) return;
  try {
    const settingStore = useSettingStore();
    const history = (settingStore.apiBaseUrlHistory || []).filter((item) => item !== value);
    settingStore.apiBaseUrlHistory = [value, ...history].slice(0, 5);
  } catch {
    // 忽略：仅影响快速切换列表
  }
};

/**
 * 探测指定 API 地址是否可用（匿名请求 `/login/status`）
 * @param url 待测地址；留空则测当前生效地址
 * @returns 是否可用及提示信息
 */
export const testApiBase = async (url?: string): Promise<{ ok: boolean; message: string }> => {
  const base = normalizeApiBase(url) || getApiBase();
  try {
    const response = await axios.get(`${base}/login/status`, {
      timeout: 10000,
      withCredentials: false,
    });
    const body = response.data ?? {};
    const code = body?.data?.code ?? body?.code;
    if (response.status === 200 && (code === undefined || code === 200)) {
      return { ok: true, message: `连接成功：${base}` };
    }
    return { ok: false, message: `接口返回异常（code=${code ?? "未知"}）：${base}` };
  } catch (error) {
    return {
      ok: false,
      message: `连接失败：${(error as Error)?.message || "未知错误"}（${base}）`,
    };
  }
};

// 基础配置
const server: AxiosInstance = axios.create({
  baseURL: DEFAULT_API_BASE,
  // 登录态经 X-Netease-Cookie 请求头显式传递（不经 URL、不依赖浏览器自动携带凭证）。
  // 注意：新版 API 返回 Access-Control-Allow-Origin: *，
  // 若开启 withCredentials(credentials=include)，浏览器会按 CORS 规范拦截该响应。
  withCredentials: false,
  // 超时时间
  timeout: 15000,
});

// 请求重试
axiosRetry(server, {
  // 重试次数
  retries: 3,
  // 指数退避，避免失败时形成瞬时请求风暴
  retryDelay: (retryCount) => axiosRetry.exponentialDelay(retryCount),
  // 只重试「可恢复」的失败：
  // - 超时（服务端慢）值得重试；
  // - 无响应且非超时（CORS 被拦截 / 网络层硬失败）重试必然同样失败，直接放弃，
  //   避免像 NOS 直读那样把同一请求放大成多次失败（日志中曾出现重复 ERR_FAILED）；
  // - 4xx 属确定性失败（429 除外）不重试。
  retryCondition: (error) => {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) return true;
    if (!error.response) return false;
    const status = error.response.status;
    return status >= 500 || status === 429;
  },
});

/** 登录 Cookie 的请求头名称（需 API 服务支持，配套 api-enhanced fork 已实现） */
const COOKIE_HEADER = "X-Netease-Cookie";

/**
 * 本机内置 API 服务地址（Electron 主进程提供，走用户本机网络出口）
 *
 * 用途：在线 API 部署在数据中心（如 Vercel），其出口 IP 会被网易云风控拦截
 * 云盘上传类接口（返回 `-460 检测到您的网络环境存在风险`）；
 * 本机 API 使用用户自己的网络出口，可规避该限制。
 */
export const LOCAL_API_BASE = `http://127.0.0.1:${
  import.meta.env["VITE_SERVER_PORT"] || 25884
}/api/netease`;

/**
 * 判断请求是否发往网易云 API 服务
 * - 未显式指定 baseURL 时使用本模块的网易云 API 地址
 * - 本机内置 API 同样属于网易云 API（需携带登录凭据）
 * - 其他服务（Last.fm / GitHub / QQ 音乐 / 解锁服务等）不携带登录凭据
 * @param config 请求配置
 * @returns 是否发往网易云 API
 */
const isNeteaseApiRequest = (config: AxiosRequestConfig) => {
  const requestBase = config.baseURL ?? "";
  return (
    !requestBase ||
    requestBase === server.defaults.baseURL ||
    requestBase === getApiBase() ||
    requestBase === LOCAL_API_BASE
  );
};

/**
 * 设置请求头（兼容 AxiosHeaders 实例与普通对象）
 * @param config 请求配置
 * @param key 头名称
 * @param value 头值
 */
const setRequestHeader = (config: AxiosRequestConfig, key: string, value: string) => {
  const headers = config.headers as
    | (Record<string, unknown> & { set?: (k: string, v: string) => void })
    | undefined;
  if (typeof headers?.set === "function") {
    headers.set(key, value);
    return;
  }
  config.headers = { ...(config.headers ?? {}), [key]: value } as AxiosRequestConfig["headers"];
};

// 请求拦截器
server.interceptors.request.use(
  (request) => {
    // 运行时 API 源：未显式指定 baseURL 的请求（绝大多数）跟随当前设置，
    // 在「设置 → 网络 → API 服务」切换源后立即生效，无需重启或重新构建
    if (!request.baseURL || request.baseURL === server.defaults.baseURL) {
      request.baseURL = getApiBase();
    }
    // pinia
    const settingStore = useSettingStore();
    if (!request.params) request.params = {};
    // Cookie：一律经请求头传递，且只发给网易云 API
    //
    // 为什么不再走 `params.cookie`：
    // 1. 查询参数会进入服务端 / 代理 / CDN 访问日志与浏览器历史，等于把 MUSIC_U 明文落盘；
    // 2. 历史实现在非网易云请求（Last.fm / GitHub / 解锁服务等）上也会写入 params，
    //    会把登录凭据附带发送给第三方服务；
    // 3. 线上 API（api-enhanced fork）与 Electron 内置 API 均已支持 X-Netease-Cookie。
    if (
      !request.params.noCookie &&
      isNeteaseApiRequest(request) &&
      (isLogin() || getCookie("MUSIC_U") !== null)
    ) {
      setRequestHeader(request, COOKIE_HEADER, `MUSIC_U=${getCookie("MUSIC_U")};os=pc;`);
    }
    // 自定义 realIP（调用方显式传入 realIP/randomCNIP 时以其为准，便于取链失败后按需重试）
    const hasExplicitIpOption =
      request.params.realIP !== undefined || request.params.randomCNIP !== undefined;
    if (!hasExplicitIpOption && settingStore.useRealIP) {
      if (settingStore.realIP) {
        request.params.realIP = settingStore.realIP;
      } else {
        request.params.randomCNIP = true;
      }
    }
    // proxy
    if (settingStore.proxyProtocol !== "off") {
      const protocol = settingStore.proxyProtocol.toLowerCase();
      const server = settingStore.proxyServe;
      const port = settingStore.proxyPort;
      const proxy = `${protocol}://${server}:${port}`;
      if (proxy) request.params.proxy = proxy;
    }
    // 发送请求
    return request;
  },
  (error: AxiosError) => {
    console.error("请求发送失败：", error);
    return Promise.reject(error);
  },
);

// 响应拦截器
server.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    // 超时/网络错误
    if (
      error.code === "ECONNABORTED" ||
      error.message.includes("timeout") ||
      error.message.includes("Network Error")
    ) {
      window.$message?.warning("网络请求超时，请检查网络连接");
      // 返回 null 而非 reject，业务代码需要检查返回值
      return Promise.resolve({ data: null });
    }

    const { response } = error;
    // 状态码处理（仅记录日志，不触发弹窗）
    switch (response?.status) {
      case 400:
        console.warn("客户端错误：", response.status, response.statusText);
        break;
      case 401:
        console.warn("未授权：", response.status, response.statusText);
        break;
      case 403:
        console.warn("禁止访问：", response.status, response.statusText);
        break;
      case 404:
        console.warn("未找到资源：", response.status, response.statusText);
        break;
      case 500:
        console.warn("服务器错误：", response.status, response.statusText);
        break;
      default:
        console.warn("未处理的错误：", error.message);
    }
    // 返回错误
    return Promise.reject(error);
  },
);

// 请求
const request = async <T = any>(config: AxiosRequestConfig): Promise<T> => {
  // 返回请求数据
  const { data } = await server.request(config);
  return data as T;
};

export default request;
