import { join } from "path";
import { isDev } from "../main/utils/config";
import { serverLog } from "../main/logger";
import { initNcmAPI } from "./netease";
import { initUnblockAPI } from "./unblock";
import { initControlAPI } from "./control";
import { initQQMusicAPI } from "./qqmusic";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify from "fastify";

/** 允许访问本机 API 的主机名（含 IPv6 回环） */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * 判断 Host 头是否为本机地址（可带端口）
 * @param value Host 头原始值
 * @returns 是否为本机
 */
const isLocalHost = (value?: string | null): boolean => {
  if (!value) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(`http://${value}`).hostname.toLowerCase());
  } catch {
    return false;
  }
};

/**
 * 判断 Origin 是否为本机来源
 * @param origin Origin 头原始值
 * @returns 是否为本机来源
 */
const isLocalOrigin = (origin: string): boolean => {
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
};

const initAppServer = async () => {
  try {
    const server = fastify({
      routerOptions: {
        // 忽略尾随斜杠
        ignoreTrailingSlash: true,
      },
    });
    // 注册插件
    server.register(fastifyCookie);
    server.register(fastifyMultipart);
    // 安全：本机 API 服务（/api/*）仅允许本机来源访问
    // - Host 校验：阻断 DNS rebinding（攻击者域名解析到 127.0.0.1 时 Host 头仍是攻击者域名）
    // - Origin 校验：阻断浏览器跨站页面调用（Electron 渲染层 Origin 为 http://localhost:<port>）
    // - Sec-Fetch-Site 校验：阻断跨站请求（浏览器自动携带）
    // - 可选 Token：设置环境变量 SPLAYER_API_TOKEN 后，所有 /api 请求需携带 x-splayer-token 头或 ?token=
    const apiToken = (process.env["SPLAYER_API_TOKEN"] || "").trim();
    server.addHook("onRequest", async (request, reply) => {
      // 仅保护 API，静态资源（网页端页面）不受影响
      if (!request.url.startsWith("/api")) return;
      if (!isLocalHost(request.headers.host)) {
        serverLog.warn(`🚫 Blocked non-local Host header: ${request.headers.host}`);
        await reply.code(403).send({ code: 403, message: "Forbidden: invalid host" });
        return;
      }
      const origin = request.headers.origin;
      if (typeof origin === "string" && origin !== "null" && !isLocalOrigin(origin)) {
        serverLog.warn(`🚫 Blocked cross-site Origin: ${origin}`);
        await reply.code(403).send({ code: 403, message: "Forbidden: invalid origin" });
        return;
      }
      const fetchSite = request.headers["sec-fetch-site"];
      if (typeof fetchSite === "string" && fetchSite === "cross-site") {
        serverLog.warn("🚫 Blocked cross-site request (Sec-Fetch-Site: cross-site)");
        await reply.code(403).send({ code: 403, message: "Forbidden: cross-site" });
        return;
      }
      if (apiToken) {
        const query = request.query as Record<string, unknown> | undefined;
        const provided = request.headers["x-splayer-token"] ?? query?.["token"];
        if (provided !== apiToken) {
          serverLog.warn("🚫 Unauthorized API request (missing/invalid token)");
          await reply.code(401).send({ code: 401, message: "Unauthorized" });
          return;
        }
      }
    });
    // 生产环境启用静态文件
    if (!isDev) {
      serverLog.info("📂 Serving static files from /renderer");
      server.register(fastifyStatic, {
        root: join(__dirname, "../renderer"),
      });
    }
    // 声明
    server.get("/api", (_, reply) => {
      reply.send({
        name: "SPlayer API",
        description: "SPlayer API service",
        author: "@imsyy",
        list: [
          {
            name: "NeteaseCloudMusicApi",
            url: "/api/netease",
          },
          {
            name: "UnblockAPI",
            url: "/api/unblock",
          },
          {
            name: "ControlAPI",
            url: "/api/control",
          },
          {
            name: "QQMusicAPI",
            url: "/api/qqmusic",
          },
        ],
      });
    });
    // 注册接口
    server.register(initNcmAPI, { prefix: "/api" });
    server.register(initUnblockAPI, { prefix: "/api" });
    server.register(initControlAPI, { prefix: "/api" });
    server.register(initQQMusicAPI, { prefix: "/api" });
    // 启动端口
    const port = Number(process.env["VITE_SERVER_PORT"] || 25884);
    await server.listen({ port, host: "127.0.0.1" });
    serverLog.info(`🌐 Starting AppServer on port ${port}`);
    return server;
  } catch (error) {
    serverLog.error("🚫 AppServer failed to start");
    throw error;
  }
};

export default initAppServer;
