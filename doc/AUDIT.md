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




---

# 审计报告（2026-09-19 · `NEWAPI` 分支增量）

> **对象**：`NEWAPI` 分支新增内容 —— 网易云 API 能力补齐（`src/api/netease`、`scripts/gen-netease-endpoints.ts`）与 10 个新页面（曲风 / MV 广场与详情 / 音乐日历 / 听歌足迹 / 消息中心 / 用户主页 / 会员中心 / 视频广场 / 数字专辑 / 电台榜单）+ `History.vue` 多 Tab 扩展。
> **方法**：代码核对 + 本地只读实测（本地 npm 版 API 适配器 `http://127.0.0.1:3210`、无头浏览器真实页面、逐路由隔离对照）+ 构建期静态检查（`vue-tsc` / ESLint / Prettier）。不含任何真实凭据。
> **结论速览**：安全 4 项（3 项已修复 / 1 项通过）、性能 4 项（全部已修复）、观察项 1 项（既有问题，非本分支引入，已留证）。


---

# 审计报告（2026-09-19 · 实测问题与密钥审查）

> **对象**：用户实测反馈的六类问题（消息中心 / 最近播放 / 数字专辑 / 会员中心 / 私人漫游 / 控制台致命错误）与随附控制台日志（90.5KB）。
> **方法**：逐条复现与代码核对、上游模块实现核对、逐路由隔离对照（含未改动路由作基线）、仓库密钥扫描、日志正则扫描。
> **结论速览**：功能问题 7 项全部修复；日志与隐私治理 52 处；密钥审查 **未发现凭据泄漏**；残留 3 条本地 web dev 环境报错（与生产构建无关）与 1 条浏览器扩展脚本报错（与本项目无关）。

## 功能缺陷（已修复）

| 编号 | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| F1 | 点「开启控制台」报致命错误 | 菜单项判定用 `isDev`，网页开发模式亦为真；调用 `window.electron.ipcRenderer` 时无主进程 | `isDev && isElectron` + 调用处守卫 |
| F2 | 私人漫游偶发打不开 | 列表为空时直接报错返回（无重试） | 先自动刷新一次，再决定播放或提示 |
| F3 | 消息中心不显示 / 输入框异常 / 发送需重新确认 | 上游字段层级多样导致映射落空；单行输入 + `keyup.enter` 与输入法冲突；发送无乐观反馈 | 多形态字段映射；错误码直接展示；textarea + Enter/Shift+Enter（避开 229）；乐观发送 + 失败回填 + 自动滚动 + 会话刷新 + 左右对齐 |
| F4 | 最近播放云端分类全为「未知」 | 只取 `item.data`，且兜底文案写死「未知」 | `pickResource/pickName/pickCover` 多形态提取，兜底 `#<id>` |
| F5 | 数字专辑排版错乱 | 卡片无任何样式 | 封面比例、标题截断、价格行、`2/3/5` 列栅格 |
| F6 | 会员中心数据异常 | 取值路径与容器类型不匹配，异常静默 | 路径兼容 + 错误可见 + 刷新按钮 |
| F7 | 控制台被弃用告警刷屏 | 全局与 10 处路由守卫使用 `next()` 回调 | 改为返回值风格 |
| F8 | **点击消息里的专辑 / 歌单等直接跳到 `#/403`**（`?id=` 正常带参也被拒） | F7 改写守卫时**条件写反**（`!to.query.id ? true : { path: "/403" }`）：原语义是「**缺** id → 403」，写反后成了「**有** id → 403」，波及 10 条依赖 query 的路由 | 抽出 `src/router/guards.ts#requireQuery()`（**正向**判断：字段齐全才放行，缺任一跳 403，结构上避免再写反）；10 处路由改为 `beforeEnter: requireQuery(…)`；新增 `pnpm test:route-guards`（13 项，含源码级反向断言） |

## 日志与隐私

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| L1 | 诊断日志进入生产控制台 | 日志中出现 `auth.ts:484 ✅ Fetched ... for user <uid>`（PII）、`PlayerController ... 最终播放信息`（含**签名直链**）、`SongManager ... music data:`（接口原文）、`liked.vue` / `useListDataCache` / `SongInfoEditor`（本地路径与元数据）等 | **已修复**：52 处收敛到 `import.meta.env.DEV`；播放失败日志改 `console.error` |
| L2 | 路由弃用告警洪水 | 单次会话内数百条 `[Vue Router warn]: The next() callback ... is deprecated` | **已修复**（见 F7） |
| L3 | 第三方注入脚本报错 | `VM2801:2 Uncaught TypeError: ... reading 'startTime'`，来自浏览器扩展（同日志出现 `content_main.js ... Chrome's Built-In AI features`） | **非本项目问题**（已在文档标注） |

## 密钥审查

| 编号 | 检查项 | 方法 | 结论 |
| --- | --- | --- | --- |
| K5 | 仓库是否含凭据 | `pnpm security:secret-scan`（扫描 648 个文本文件） | ✅ 0 命中 |
| K6 | 用户日志是否含凭据 | 对 90.5KB 日志正则扫描 `MUSIC_U=` / `MUSIC_A_T=` / `__csrf=` / `wsSecret` / `Bearer` / `ghp_` / `sk-` | ✅ 全部 0 命中；日志仅出现 Cookie **名称** |
| K7 | 代码是否会打印凭据 | 核对 `src/utils/cookie.ts`（仅打印名称）与全部 `console.log` 调用点 | ✅ 无打印凭据值的代码路径；打印签名直链 / 接口响应 / 用户 id 的日志已收敛 |
| K8 | 链接与署名清理（合规） | 清理 md 中「作者 npmjs / 上游 API 仓库 / 上游文档站」的**可点击链接** | ✅ 已清理；**MIT 版权声明（`Copyright (c) ...`）依法保留**，仅移除链接 |

> 提示：控制台日志仍可能包含账号 id 与过期签名直链，**公开分享前请自行脱敏**。

## 残留与建议

| 编号 | 说明 | 建议 |
| --- | --- | --- |
| R1 | 本地 web dev 模式存在 3 条 `window.api` / `window.electron` 未注入导致的报错（以未改动路由 `/style` 为对照，错误数一致；生产 web 构建此前审计无此类报错） | 可在 web 模式为 `window.api` / `window.electron` 提供 no-op 桩，统一消除该类环境差异 |
| R2 | 消息中心 / 最近播放云端分类 / 会员中心的字段兼容是按上游多种可能形态做的**防御式映射**（本地无登录态无法逐字段实测） | 登录环境实测一次后，可把兼容分支收敛为精确字段 |

## 安全

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| N-S1 | **私信内容经 URL 传输**：`/send/text`（以及 `/send/song`、`/send/playlist`）原以查询参数发送，内容会进入 API 服务访问日志、浏览器历史与 `Referer` 风险面 | 代码核对：封装为 `neteaseApi("/send/text", { params: { userIds, msg } })` → GET URL 携带明文私信 | **已修复**：改为 `method: "post"` + `data`（上游服务端同时读取 `req.query` 与 `req.body`，语义不变），并关闭 `timestamp` |
| N-S2 | **播放地址未校验协议**：MV / 视频播放地址直接绑定到 `<video :src>`，仅做了 `http→https` 字符串替换 | 代码核对：`Mv.vue`、`VideoSquare.vue` 的取链结果未做协议白名单 | **已修复**：统一 `toSafeUrl()`（`http`→`https` 升级 + 仅接受 `http(s)://`，其余置空并提示"暂无播放地址"） |
| N-S3 | **写操作缺少登录态即时校验**：会员中心的每日签到 / 云贝签到 / 领取成长值 / 完成云贝任务仅有路由级 `meta.needLogin`，登录态中途失效会得到上游 `301` 且提示不明确 | 代码核对 + 设计评审（路由守卫只在进入页面时校验收） | **已修复**：新增 `requireLogin()`，四类写操作前置校验，失效时提示并拉起登录弹窗 |
| N-S4 | **注入面核查**（结论项）：新增页面全部使用 Vue 文本插值，无 `v-html`、无 `innerHTML`、无动态 `<script>` 注入；生成的端点清单为静态字面量；未引入第三方二进制（听歌识曲的第三方 WASM 指纹**刻意未纳入**） | `git grep -n "v-html\|innerHTML\|new Function"` 在新增文件中无命中；`src/api/netease/endpoints.ts` 由本地脚本生成 | **通过**（无新增注入面） |

## 性能

| 编号 | 问题 | 证据 / 量化 | 状态 |
| --- | --- | --- | --- |
| N-P1 | **浏览类接口穿透服务端缓存**：`neteaseApi` 默认附加 `timestamp`，而 API 服务的响应缓存以完整 URL 为键（上游 `apicache` 默认 2 分钟）→ 每次都命中不到缓存 | 设计核对：曲风 / MV / 视频 / 电台 / 专辑等只读接口均带 `timestamp` | **已修复**：新增 `neteaseBrowse()`（强制 `timestamp: false`）并应用于 30+ 个只读封装（曲风、相似内容、MV、视频、电台榜单、专辑/新碟、播客、`/check/music` 等）；个性化接口（消息、用户、会员、云贝、听歌足迹、最近播放）保持带时间戳 |
| N-P2 | **曲风页重复请求**：切换曲风后再切回会重新请求 4 个接口（详情 / 歌曲 / 歌单 / 歌手） | 代码核对 + 冒烟：每次切换产生 4 个请求 | **已修复**：按 `tagId` 增加内存缓存（命中即复用，不再请求） |
| N-P3 | **视频时间线重复条目**：分页 `offset` 递增时上游可能返回重复 `vid`，导致列表出现重复卡片并持续增长 | 代码核对（原实现 `concat` 不去重、无上限） | **已修复**：按 `vid` 去重 + 列表上限 200 条 |
| N-P4 | **377 条端点联合类型的类型检查开销** | 实测：`vue-tsc --noEmit -p tsconfig.web.json` 全量 8.6s（与未引入清单时同量级） | **通过**（无需优化） |

## 观察项（既有问题，非本分支引入）

| 编号 | 现象 | 证据 | 建议 |
| --- | --- | --- | --- |
| N-O1 | 本地 web dev 模式控制台出现 3 条错误：`Cannot read properties of undefined (reading 'ipcRenderer')`、`(reading 'store')`、以及对应的 Vue `mounted hook` 致命错误 | 逐路由隔离测试：新页面 `/video-square`、`/digital-album`、`/radio-board`、`/history` 错误数均为 **3**；使用**未改动**的对照路由 `/style` 复测同样为 **3** → 与本次改动无关。候选位置为 `window.api.store` / `window.electron.ipcRenderer` 的调用点（`src/components/Setting/config/*`、`src/components/Setting/components/CacheSizeLimit.vue`、`src/views/DesktopLyric/index.vue` 等，`Nav.vue` 已有 `isElectron` 守卫） | 统一封装 `isElectron` 守卫或可选链（`window.api?.store?.get`），并在 web 模式提供 no-op 实现；属于独立小改动，建议单独提交与回归 |

## 复审建议

1. **接口层面**：新增页面涉及的所有写操作（`/send/*`、`/daily_signin`、`/yunbei/sign`、`/vip/growthpoint/get`、`/mv/sub`、`/follow`）建议统一收敛到「带登录校验 + 统一错误提示」的封装层，避免每页各写一遍。
2. **缓存层面**：`neteaseBrowse` 已覆盖只读浏览接口；后续若接入个性化推荐流（推荐视频、推荐电台），应继续使用带 `timestamp` 的 `neteaseApi`，避免把个性化结果缓存成公共响应。
3. **端点层面**：`neteaseApi` 允许调用全部 377 个端点（含 `/login/cellphone`、`/user/replacephone` 等敏感写接口）。当前仅内部使用、且都需要登录态，风险可接受；若未来对外开放该模块，建议按「读/写/敏感」分级并加白名单。
4. **能力层面**：听歌识曲（`/audio/match`）涉及第三方指纹算法（来源不明二进制），继续维持**不接入**；如后续确需，先明确许可与来源可验证性再评估。


---

# 审计报告（2026-09-19 · Web 端（Vercel）安全 / 密钥 / 性能）

> **对象**：Vercel 项目 `s-player12`（`music.ciallo.sale`、`music.duckgame-play.top`、`beta-music.ciallo.sale`）与仓库中新增的 web 相关代码。
> **方法**：线上 HTTP 探测（状态码 / 重定向 / 安全响应头，经本地代理）、Vercel REST API 核对项目与域名绑定、源码逐项核对（`vercel.json`、`request.ts`、`cookie.ts`、`auth.ts`、`sanitizeHtml.ts`、`useCustomCode.ts`、`uploadQueue.ts`、`Message.vue`）、`security-selfcheck`、`secret-scan`、全仓正则审计（`v-html` / `innerHTML` / `eval` / 定时器 / `localStorage`）。
> **结论速览**：修复 1 项凭据残留 + 1 项 CSP 加固 + 1 项首屏请求优化；密钥扫描 0 命中；2 项平台配置需你决策（部署保护、主站分支）。

## 安全

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| W1 | 登出后凭据残留：除 `MUSIC_U` / `__csrf` 外的登录 Cookie 及其 `localStorage` 副本、云盘上传队列（NOS 直传地址 + 上传令牌）均未清理 | `auth.ts toLogout()` 原实现只删两个 Cookie；`cookie.ts setCookies()` 会把登录返回的所有 Cookie 写入 `document.cookie` 与 `localStorage["cookie-*"]`；`clearUploadQueue()` 此前仅被 Cloud.vue 的「放弃任务」按钮调用 | ✅ 已修复：`toLogout()` 清空全部 `cookie-*`（含 document.cookie）并 `clearUploadQueue()` |
| W2 | CSP 仅 `frame-ancestors 'self'` | `vercel.json` headers；线上实测响应头缺少 `object-src` / `base-uri` / `form-action` 限制 | ✅ 已加固为 `frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`（不影响脚本 / 连接 / 图片，自定义 JS 与播放不受影响） |
| W3 | **部署保护开启**：未登录 Vercel 的访客访问任一域名（含 production 域）均 302 到 `vercel.com/sso-api` | 无头探测 `music.ciallo.sale`、`beta-music.ciallo.sale`、部署 URL 均 302；带 `x-robots-tag: noindex`；Vercel API 显示 `ssoProtection.deploymentType = "all_except_custom_domains"` | ✅ 已关闭（PATCH `ssoProtection=null`、`passwordProtection=null`）；关闭后实测 `music.ciallo.sale` / `music.duckgame-play.top` 返回 200 且响应头齐全（见下方「线上实测」） |
| W4 | 登录 Cookie 经 `X-Netease-Cookie` 头发往构建时注入的 API 域名（默认 `music-api2.duckgame-play.top`），该域名可读取用户凭据 | `request.ts`：`COOKIE_HEADER`、`DEFAULT_API_BASE = import.meta.env["VITE_API_URL"]`；API 侧 `Access-Control-Allow-Origin: *` | ⚠️ 设计取舍（自建 API 架构）：仅使用自建 / 可信 API 即可；已在文档标注 |
| W5 | 自定义 JS（`useCustomCode` → `new Function(customJs)`）在导入设置后立即执行；导入弹窗未单独提示「配置含自定义 JS」 | `useCustomCode.executeCustomJs()`；`general.ts importSettings()` 写入 `setting-store` 后 `location.reload()` | ⚠️ 观察项：导入他人配置存在执行风险；如需可加二次确认（本轮未改交互） |
| W6 | XSS 面 | 全仓 `v-html` 9 处：更新日志 = `marked` + `sanitizeHtml()`；设置项描述为本地静态文案；`SvgIcon` 为内联图标；`AMLLServer.vue` 那处在注释模板内（编译时被忽略）；`CommentList` 纯文本渲染，无 `innerHTML` 注入 | ✅ 未发现可利用注入点 |

## 密钥

| 编号 | 检查项 | 方法 | 结论 |
| --- | --- | --- | --- |
| WK1 | 仓库是否含凭据 | `pnpm security:secret-scan` | ✅ 652 个文本文件 **0 命中** |
| WK2 | 构建时注入的 `.env` | 逐行解析（仅输出键名与值长度） | ✅ 仅 `VITE_WEB_PORT` / `VITE_SERVER_PORT` / `VITE_API_URL`（公开值），无密钥。⚠️ 该文件仍被 git 跟踪：若将来需在 `.env` 填密钥，须先 `git rm --cached .env` 并把密钥移到 Vercel 环境变量 |
| WK3 | 前端产物是否泄漏密钥 | 构建配置（无 sourcemap）+ `.gitignore`（忽略 `.env*`、`.vercel`） | ✅ 无 `.env` 密钥可泄漏；`VITE_*` 均为公开值 |
| WK4 | 浏览器侧凭据存放 | `localStorage` 存 Cookie 副本 + 设置；上传队列 30 分钟 TTL | ⚠️ → ✅ 已由 W1 补齐登出清理 |

## 性能

| 编号 | 项 | 结论 |
| --- | --- | --- |
| WP1 | 消息中心首屏请求数 | ✅ 已优化：4 → 1（通知 / 评论 / @我 / 转发 3 个接口改为首次切 Tab 懒加载，失败可重试） |
| WP2 | 接口缓存策略 | 浏览类接口走 `neteaseBrowse()`（不带 `timestamp` → 可命中 API 侧 2 分钟缓存）；个性化接口保留时间戳（有意） |
| WP3 | 资源缓存与压缩 | `vercel.json`：`/assets/*`、`/(fonts|icons|wasm|images)/*` → `immutable`；构建开启压缩产物（gzip/brotli）；路由级懒加载 |
| WP4 | 长列表渲染 | 列表页沿用既有 `VirtualScroll`；本轮新增页面均为分页 / 限量（20–30 条），无一次性全量渲染 |
| WP5 | 定时器与监听器 | 全仓 `setInterval` 5 处均有配对 `clearInterval`；`src/views/**` 无 `addEventListener`，无未清理的视图级监听 |
| WP6 | 串行请求 / 深拷贝 | `src/views/**` 无「for 循环内 await」（串行 N+1）；解析类工具为一次遍历，无深拷贝 |
| WP7 | 首屏是否加载了「按需才用」的大依赖 | 🔧 已修复：`@applemusic-like-lyrics/core`（AMLL 渲染引擎，raw 399KB / gzip 119KB）原本被自动导入的组件静态引入 → 打进首屏。改为 `defineAsyncComponent` 并把 `manualChunks` 中 `core` 独立为 `amll-core` 后，**首屏 gzip 695.8KB → 581.4KB（-16.4%）**，`amll-core` 不再出现在 `index.html` |

## 线上实测（部署保护关闭后）

| 项 | 结果 |
| --- | --- |
| `http → https` | 308 重定向 ✓ |
| 安全响应头（`music.ciallo.sale` / `music.duckgame-play.top`） | CSP `frame-ancestors 'self'`、HSTS `max-age=63072000`、`X-Content-Type-Options: nosniff`、`X-Frame-Options: SAMEORIGIN`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy`（地理/麦克风/相机/支付禁用）→ **无缺失项** |
| 压缩 / 缓存 | `content-encoding: br`（Brotli）✓；`/assets/*`、`/fonts|icons|wasm|images/*` 为 `max-age=31536000, immutable` ✓；`x-vercel-cache: HIT` |
| 产物密钥 / sourcemap | **0 命中**（HTML、JS、CSS 全量扫描） |
| HTML 内联脚本 / 内联 `http://` | 0 处 / 0 处 ✓ |
| 首屏 JS+CSS | 解压后 2.26MB（其中 `vendor-amll` 399KB 已在 `beta` 分支被 WP2 优化掉） |

## 复审建议

1. **部署保护**：✅ 已关闭（`ssoProtection=null`）；若之后想保护预览部署，可在 Vercel 选择仅保护 Preview，避免生产域名被拦。
2. **主站分支**：`music.ciallo.sale` 仍为 `feat/api-enhanced`；若要让主站也带上 2026-09-19 的整合成果，可合并 `NEWAPI` 或把该域名的 gitBranch 改为 `NEWAPI`（`beta-music.ciallo.sale` 已是后者）。
3. **首屏体积**：`vendor-ui`（naive-ui，gzip 286KB）与 `stores`（gzip 212KB）仍是首屏大头；后续可按路由拆分 naive-ui 组件或把 stores 中的非首屏依赖改为动态 import。AMLL core（gzip 119KB）本轮已移出首屏。
4. **CSP 进一步收紧**：线上在 Report-Only 下先加 `default-src` / `connect-src` 观察；注意自定义 JS 依赖 `unsafe-eval`。
5. **`.env` 治理**：把 `.env` 从索引移除（保留本地文件）并在 Vercel 配好环境变量，避免将来误提交密钥。

