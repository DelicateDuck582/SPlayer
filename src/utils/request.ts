import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from "axios";
import { isDev } from "./env";
import { useSettingStore } from "@/stores";
import { getCookie } from "./cookie";
import { isLogin } from "./auth";
import axiosRetry from "axios-retry";

// 全局地址
const baseURL: string = String(isDev ? "/api/netease" : import.meta.env["VITE_API_URL"]);

// 基础配置
const server: AxiosInstance = axios.create({
  baseURL,
  // 登录态通过 params.cookie 显式传递，不依赖浏览器跨域自动携带凭证。
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
});

// 请求拦截器
server.interceptors.request.use(
  (request) => {
    // pinia
    const settingStore = useSettingStore();
    if (!request.params) request.params = {};
    // Cookie
    if (!request.params.noCookie && (isLogin() || getCookie("MUSIC_U") !== null)) {
      const cookie = `MUSIC_U=${getCookie("MUSIC_U")};os=pc;`;
      request.params.cookie = cookie;
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
