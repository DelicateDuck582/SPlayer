# 审计报告（2026-09-13）

> **对象**：主仓库（渲染层 / Electron 主进程 / `vercel.json`）与配套 fork（[api-enhanced](https://github.com/DelicateDuck582/api-enhanced)）。
>
> **方法**：以生产控制台日志为线索（`music.duckgame-play.top-*.log`），结合代码核对与线上**只读**实测（`curl -I`、匿名请求、本地复现、无头浏览器体检）。本报告**不包含任何真实凭据**；凭据链路验证统一使用无害标记串 `_TEST_LEAK_MARKER_`。
>
> **结论速览**：安全 8 项（6 项已修复 / 1 项部分修复 / 1 项已缓解）、性能 6 项（4 项已修复、2 项待办）、密钥 4 项（2 项通过、2 项需注意）、移动端 5 项（全部已修复）。

## 安全

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| S1 | **登录凭据可进入服务端日志**：客户端在回退路径把 Cookie 放进查询参数（`?cookie=`），而 API 服务直接记录 `req.originalUrl` | 本地复现命中：`[INFO] Request Success: [weapi] /login/status?cookie=MUSIC_U=_TEST_LEAK_MARKER_…` | **已修复**：客户端一律走 `X-Netease-Cookie` 请求头且仅对网易云 API 生效（`src/utils/request.ts`）；API 侧新增 `maskSensitiveQuery()`，实测日志变为 `cookie=***` |
| S2 | **CSP 过宽**：`script-src` 含 `'unsafe-eval'` 与任意 `http:` / `https:` 源；`frame-ancestors` 无法通过 meta 下发 | `index.html` | **部分修复**：移除 `script-src` 中的裸 `http:`、补 `'wasm-unsafe-eval'` 与 `form-action 'self'`；`frame-ancestors` 改由 HTTP 头下发。`'unsafe-eval'` **必须保留**（emscripten 版 ffmpeg 与「自定义 JS」功能依赖 `new Function`，见 `src/core/audio-player/ffmpeg-engine/ffmpeg.js`、`src/composables/useCustomCode.ts`） |
| S3 | **站点缺安全响应头** | 线上仅返回 HSTS | **已修复**：`vercel.json` 增加 `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy` / CSP `frame-ancestors` |
| S4 | **本机 API 反射任意 Origin** | 本地实测 `Origin: https://evil.example` → `Access-Control-Allow-Origin: https://evil.example`（`CORS_ALLOW_ORIGIN` 未配置时的默认行为） | **已缓解**：启动时打印告警；建议设置 `CORS_ALLOW_ORIGIN` 白名单 |
| S5 | **`ACAO: *` 与 `Allow-Credentials: true` 并存**（违反 CORS 规范，且放大「任意源可携带凭证调用」的语义） | 线上 API 响应头实测 | **已修复**：API 不再下发 `Access-Control-Allow-Credentials`（客户端本就使用 `withCredentials: false`） |
| S6 | **凭据持久化在 localStorage**，浏览器扩展 / XSS 可直接读取 | `src/utils/cookie.ts`、`src/utils/auth.ts`、`src/utils/uploadQueue.ts`；生产日志中存在浏览器扩展注入的 `content_main.js` | **部分加固**：写入时补 `SameSite=Lax` 与 HTTPS 下的 `Secure`。**根治需 API 侧 session 化**（见「已知限制与待办」） |
| S7 | **生产剥离 `console.log` 影响线上排障** | `electron.vite.config.ts` 的 `terserOptions.compress.pure_funcs` | **已文档化**：需要线上可见的诊断改用 `console.info`（云盘直传方式日志即如此） |
| S8 | dev 环境打印完整登录响应（含 Cookie） | `src/components/Modal/Login/Login.vue` | **已修复**：移除该日志 |

## 性能

| 编号 | 问题 | 证据 / 量化 | 状态 |
| --- | --- | --- | --- |
| P1 | 哈希静态资源为 `max-age=0, must-revalidate`，每次访问都要回源校验（弱网首屏明显变慢） | 线上实测 `/assets/index-*.js`、`/fonts/logo.woff2` 均返回 `public, max-age=0, must-revalidate`（`Age: 1990`） | **已修复**：`/assets`、`/fonts`、`/icons`、`/wasm`、`/images` → `max-age=31536000, immutable`（HTML 保持不缓存以便即时更新） |
| P2 | 首包偏大 | 构建产物 `stores` chunk 2.15MB / gzip 623KB；`ffmpeg.wasm` 3.05MB、`ferrous_opencc` wasm 1.12MB | **已修复（分包）**：拆分 `vendor-ui` / `vendor-amll` / `vendor-vueuse` / `vendor-utils`，`stores` 降至 0.70MB / gzip 212KB；wasm 按需加载建议保留后续观察 |
| P3 | 弱网字体回退抖动 | 生产日志首行即 `Slow network is detected … Fallback font … logo.woff2`；`font.css` 缺 `font-display` | **已修复**：`font-display: swap` + `logo.woff2`（仅约 1KB）preload |
| P4 | 无谓重试放大确定性失败 | `axios-retry` 默认 `retries: 3` 无 `retryCondition`；日志中同一 NOS URL 出现两次 | **已修复**：指数退避 + 仅重试超时 / 5xx / 429（CORS 等网络层硬失败不再重试） |
| P5 | 启动期重复歌词解析 | 日志中 `[LyricStripper] 头部/尾部扫描` 连续三组 | **待办**（收益有限，未改动） |
| P6 | 云盘读回使用整对象 GET，且 NOS 直连在浏览器**必被 CORS 拦截** | 生产日志 4 条 `net::ERR_FAILED`；匿名 HEAD 实测 `nosup-hz1.127.net` 返回 `400` 且**无** `Access-Control-Allow-Origin`（仅 `Timing-Allow-Origin`） | **待办**：需改为 API 代理 / 签名 URL + Range 读取 |

## 密钥

| 编号 | 结论 | 依据 |
| --- | --- | --- |
| K1 | ✅ **当前代码树与全历史均无真实凭据字面量** | `git grep` / `git log -S` 扫描 `MUSIC_U=<20+ 位>`、`ghp_`、`AKIA`、`sk-`、`xox[baprs]-`、`BEGIN … PRIVATE KEY` 全部无命中 |
| K2 | ⚠️ `.env` 仍被 git 跟踪（`.gitignore` 已列出但对已跟踪文件无效） | 历史变量仅 `VITE_API_URL` / `VITE_WEB_PORT` / `VITE_SERVER_PORT`（**无密钥**）；已在文件顶部加「禁止写入密钥」警示并新增 `.env.example`。**移出跟踪前**请先在 Vercel 项目环境变量中配置 `VITE_*`，否则线上构建的 API 地址会变空 |
| K3 | ✅ API 服务侧无入库密钥 | 仅跟踪 `.env.prod.example`（示例键名）；`util/xeapiKey.js` 的 `sk` 为**运行时**从网易接口获取；`util/crypto.js` 内为协议固定公开密钥 |
| K4 | ⚠️ 若线上配置了 `NETEASE_COOKIE` 环境变量 | 该凭据集中在服务端（暴露面为环境配置与日志）→ 必须配合 S1 的日志脱敏，并定期轮换 |

## 移动端

| 编号 | 问题 | 证据 / 量化 | 状态 |
| --- | --- | --- | --- |
| M1 | 弹窗 / 对话框宽度硬编码（`src/utils/modal.ts` 内 37 处，400–700px），窄屏超出视口 | 探针实测：请求 700px，在 377px 视口下渲染为 337px | **已修复**：`src/style/main.scss` 统一 `max-width: calc(100vw - 24px)` |
| M2 | 网格 `1fr` 轨道不可收缩 → 页面被内容撑破并被 `overflow` 裁剪（内容不可见） | 发现页实测列宽 `99.8 / 166.5 / 105.7px`、容器 404px > 可用 345px、**288 个元素横向溢出** | **已修复**：8 个文件改 `minmax(0, 1fr)`；`#main-content` 补 `gridTemplateColumns`；`.router-view` 补 `min-width: 0`。实测 288 → **0** |
| M3 | `100vh` 在移动浏览器被地址栏 / 工具栏遮挡（底部播放条被顶出屏幕） | 代码扫描命中 13 处（含 `body`、`AppLayout`、播放列表、全屏播放器、封面） | **已修复**：新增 `--vh-full`（`100dvh` 优先、`vh` 回退）；`body { width: 100vw }` → `100%` |
| M4 | 缺少刘海屏 / 灵动岛 / Home 指示条安全区适配 | `index.html` 无 `viewport-fit=cover`，代码无 `env(safe-area-inset-*)` | **已修复**：`viewport-fit=cover` + `#app-layout` 四向安全区内边距 |
| M5 | hover-only 控件在触屏不可用 / 不可见 | 侧栏「漫游」按钮为 `pointer-events: none` + hover 显示（触屏完全不可点）；账号删除、云盘容量数字、封面播放按钮同理 | **已修复**：4 处补 `@media (hover: none)` 常显（构建产物已含 4 条规则） |

**体检方法与结果**（可复现）：自建无头体检工具（Electron 隐藏窗口 + iPhone UA + `390×844` 视口 + CDP 触屏媒体模拟），对**构建产物**实测 5 个目标：

| 目标 | 横向溢出 | 过小热区 | 弹窗越界 | 控制台错误 |
| --- | --- | --- | --- | --- |
| 手机首页 | 0 | 0 | 否 | 仅 `ResizeObserver` 良性告警 |
| 手机云盘（触发登录弹窗） | 0 | 0 | 否（264px） | 同上 |
| 手机发现页 | 0（修复前 288） | 0 | — | 同上 |
| 手机歌单页 | 0 | 0 | — | 同上 |
| 桌面首页（回归） | 0 | 0 | — | 同上 |

> **局限**：Electron 下 CDP 媒体特性模拟未生效（探针 `matchMedia('(hover: none)')` 返回 `false`），触屏规则仅做**构建产物静态校验**；播放态底部播放条与登录后的云盘上传 UI 未覆盖（分别需要播放态与真实登录态）。

## 复审建议

1. 部署后复核缓存与安全头：
   - `curl.exe -I https://<站点>/assets/<hash>.js` → 期望 `Cache-Control: public, max-age=31536000, immutable`
   - `curl.exe -I https://<站点>/` → 期望含 `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy` / `Content-Security-Policy: frame-ancestors`
2. 登录后抓一次请求，确认 URL 中不再出现 `cookie=`（凭据只应出现在 `X-Netease-Cookie` 请求头）
3. 部署 API 服务时设置 `CORS_ALLOW_ORIGIN=https://<站点>`（替代通配符），并在日志面板确认已无 `cookie=` 明文
4. 真机复核：播放态底部播放条、登录后的云盘上传、歌单页

## 已知限制与待办

| 优先级 | 项 | 说明 |
| --- | --- | --- |
| P0 | **P6 云盘读回 CORS / 大文件** | NOS 不返回 `ACAO`，浏览器直读必失败 → 改为 API 代理或签名 URL，并用 Range 分段 |
| P1 | **S6 凭据存储根治** | API 为独立域、前端必须读取凭据后显式传递，无法使用 `httpOnly` Cookie；根治需 API 侧引入服务端会话（凭据只存服务端，前端仅持会话标识） |
| P2 | **S2 CSP 收紧** | 需先解决 `'unsafe-eval'` 依赖（「自定义 JS」功能与 emscripten ffmpeg），建议先用 `Content-Security-Policy-Report-Only` 观察 |
| P3 | P5 启动期重复歌词解析 | 可对同一曲目的解析结果缓存去重（收益有限） |
| P4 | K2 `.env` 移出跟踪 | 前置条件是先在 Vercel 配置 `VITE_*` 环境变量 |
| P5 | 主窗口安全配置 | 为兼容远程音频/图片仍保留 `webSecurity: false` / `allowRunningInsecureContent: true` / `nodeIntegration: true`；改为默认安全配置需较大范围回归测试，暂以「导航白名单 + CSP + IPC 参数校验」降低风险 |
| P6 | DNS rebinding | 以域名形式指向内网的地址无法在前端完全拦截；下载地址与本机 API 已完成可拦截部分的校验 |



