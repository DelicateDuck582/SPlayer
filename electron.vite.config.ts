import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "electron-vite";
import { resolve } from "path";
import AutoImport from "unplugin-auto-import/vite";
import { NaiveUiResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";
import viteCompression from "vite-plugin-compression";
import type { MainEnv } from "./env";
// import VueDevTools from "vite-plugin-vue-devtools";
import wasm from "vite-plugin-wasm";

const commonResolve = {
  alias: {
    "@": resolve(__dirname, "src/"),
    "@emi": resolve(__dirname, "native/external-media-integration"),
    "@shared": resolve(__dirname, "src/types/shared"),
    "@opencc": resolve(__dirname, "native/ferrous-opencc-wasm/pkg"),
    "@native": resolve(__dirname, "native"),
    "@windows": resolve(__dirname, "windows"),
  },
};

export default defineConfig(({ mode }) => {
  // 读取环境变量
  const getEnv = (name: keyof MainEnv): string => {
    return loadEnv(mode, process.cwd())[name];
  };
  // 获取端口
  const webPort: number = Number(getEnv("VITE_WEB_PORT") || 14558);
  const servePort: number = Number(getEnv("VITE_SERVER_PORT") || 25884);
  // 返回配置
  return {
    // 主进程
    main: {
      build: {
        publicDir: resolve(__dirname, "public"),
        rollupOptions: {
          input: {
            index: resolve(__dirname, "electron/main/index.ts"),
            "workers/audio-analysis.worker": resolve(
              __dirname,
              "electron/main/workers/audio-analysis.worker.ts",
            ),
          },
        },
      },
      resolve: commonResolve,
    },
    // 预加载
    preload: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, "electron/preload/index.ts"),
          },
        },
      },
      resolve: commonResolve,
    },
    // 渲染进程
    renderer: {
      root: ".",
      plugins: [
        vue(),
        // mode === "development" && VueDevTools(),
        AutoImport({
          imports: [
            "vue",
            "vue-router",
            "@vueuse/core",
            {
              "naive-ui": ["useDialog", "useMessage", "useNotification", "useLoadingBar"],
            },
          ],
          eslintrc: {
            enabled: true,
            filepath: "./auto-eslint.mjs",
          },
        }),
        Components({
          resolvers: [NaiveUiResolver()],
        }),
        viteCompression(),
        wasm(),
      ],
      resolve: commonResolve,
      css: {
        preprocessorOptions: {
          scss: {
            silenceDeprecations: ["legacy-js-api"],
          },
        },
      },
      server: {
        port: webPort,
        // 代理
        proxy: {
          "/api": {
            target: `http://127.0.0.1:${servePort}`,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, "/api"),
          },
        },
      },
      preview: {
        port: webPort,
      },
      build: {
        minify: "terser",
        publicDir: resolve(__dirname, "public"),
        rollupOptions: {
          input: {
            index: resolve(__dirname, "index.html"),
            loading: resolve(__dirname, "web/loading/index.html"),
            "taskbar-lyric": resolve(__dirname, "windows/taskbar-lyric/index.html"),
          },
          external: ["external-media-integration.node"],
          output: {
            // 拆包：把体积最大的第三方依赖与业务 store 分离，避免单个 chunk 过大
            // （实测拆分前 stores chunk ≈ 2.1MB）。
            // 注意：此处只挑明确的大依赖单独成包，其余保持默认分包，
            // 以免制造跨包循环依赖；改动后需做一次生产构建 + 页面渲染验证。
            manualChunks: (id: string) => {
              if (id.includes("node_modules")) {
                if (id.includes("naive-ui") || id.includes("vueuc") || id.includes("@css-render")) {
                  return "vendor-ui";
                }
                if (id.includes("@applemusic-like-lyrics/core")) return "amll-core";
                if (id.includes("@applemusic-like-lyrics")) return "vendor-amll";
                if (id.includes("@vueuse")) return "vendor-vueuse";
                if (id.includes("lodash-es") || id.includes("axios") || id.includes("dayjs")) {
                  return "vendor-utils";
                }
                return undefined;
              }
              if (id.includes("/src/stores/")) return "stores";

              // 第三方音乐源（酷狗 / QQ）的客户端与登录模块单独成 chunk：
              // 它们只被「搜索页 / 首页 / 登录弹窗 / 设置页」按需引用，不应进首屏包
              if (id.includes("/src/api/kugou/index") || id.includes("/src/api/qq/index")) {
                return "thirdparty-api";
              }
              if (id.includes("/src/utils/kugouAuth") || id.includes("/src/utils/qqAuth")) {
                return "thirdparty-api";
              }
              return undefined;
            },
          },
        },
        terserOptions: {
          compress: {
            // 生产构建会剥离 console.log（减小产物体积、避免把排查细节带到线上）。
            // 需要「线上仍可见」的诊断请改用 console.info / console.warn，
            // 例：云盘直传方式日志（src/api/cloud.ts）使用的就是 console.info。
            pure_funcs: ["console.log"],
          },
        },
        sourcemap: false,
      },
    },
  };
});
