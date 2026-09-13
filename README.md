> [!CAUTION]
>
> # 仓库说明
>
> - 原项目作者已将原仓库归档，后续版本迁移至 [SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)
> - 本仓库为个人维护的 fork，不做上游贡献；所有修改更新均集中在 `feat/api-enhanced` 分支，详见下方 [更新记录](#-更新记录)

<div align="center">
<img alt="logo" height="100" width="100" src="public/icons/favicon.png" />
<h2> SPlayer </h2>
<p> 一个简约的音乐播放器 </p>

[API Docs](https://splayer.imsyy.top/api.html) | [开发版](https://github.com/imsyy/SPlayer/actions) | [发行版](https://splayer.imsyy.top/download.html)

<br />

[![Stars](https://img.shields.io/github/stars/imsyy/SPlayer?style=flat)](https://github.com/imsyy/SPlayer/stargazers)
[![Version](https://img.shields.io/github/v/release/imsyy/SPlayer)](https://github.com/imsyy/SPlayer/releases)
[![Build Release](https://github.com/imsyy/SPlayer/actions/workflows/release.yml/badge.svg)](https://github.com/imsyy/SPlayer/actions/workflows/release.yml)
[![License](https://img.shields.io/github/license/imsyy/SPlayer)](https://github.com/imsyy/SPlayer/blob/dev/LICENSE)
[![Issues](https://img.shields.io/github/issues/imsyy/SPlayer)](https://github.com/imsyy/SPlayer/issues)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/imsyy/SPlayer)

</div>

![main](/screenshots/SPlayer.jpg)

## 说明

![提示](/screenshots/gitcodes.png)

> [!IMPORTANT]
>
> ### 严肃警告
>
> - 请务必遵守 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 许可协议
> - 在您的修改、演绎、分发或派生项目中，必须同样采用 **AGPL-3.0** 许可协议，**并在适当的位置包含本项目的许可和版权信息**
> - 若您用于售卖或其他盈利用途，**必须提供本项目的源代码及原项目链接**。另外由于本项目涉及第三方，**售卖后可能遭受法律或诉讼风险**。如若发现违反许可协议，作者保留追究法律责任的权利
> - 禁止在二开项目中修改程序原版权信息（ 您可以添加二开作者信息 ）
> - 感谢您的尊重与理解

- 本项目采用 [Vue 3](https://cn.vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Naïve UI](https://www.naiveui.com/) + [Electron](https://www.electronjs.org/zh/docs/latest/) 开发
- Node.js 版本要求：>= 20，包管理器：pnpm >= 10
- 默认会构建原生模块，需准备 Rust 工具链；如仅需要网页端构建或暂时跳过，可设置环境变量 `SKIP_NATIVE_BUILD=true`
- 支持网页端与客户端，由于设备有限，目前仅保证 Windows 系统的适配，其他平台如遇问题可以提 Issue 或自行解决后选择提 PR
<!-- - 仅对移动端做了基础适配，**不保证功能全部可用** -->

<!--  > 请注意，本程序不打算开发移动端，也不会对移动端进行完美适配，仅保证基础可用性 -->

- 欢迎各位大佬 `Star` 😍

## 📝 更新记录

> 以下为本仓库（个人 fork）针对新版网易云音乐 API 适配所做的本地修改记录。

### 2026-08-19 适配新版网易云音乐 API

- **API 地址切换**（`.env` → `VITE_API_URL`）：网页端使用的网易云 API 服务切换为持续维护的新版项目（[api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)），修复网易云接口改版后部分「收藏」无法同步的问题
- **CORS 兼容**（`src/utils/request.ts`）：关闭 `withCredentials`。登录态通过 `params.cookie` 显式传递，浏览器无需跨域自动携带凭证，从而兼容新版 API 返回的 `Access-Control-Allow-Origin: *`，避免请求被 CORS 策略拦截
- **缓存健壮性**（`src/utils/cache.ts`）：`getCacheData` 不再缓存 `null/undefined` 结果，防止接口短暂异常时把空值写入 `sessionStorage` 导致页面持续空白

### 2026-09-12 网页端歌曲下载

- **下载入口**：底部播放条（爱心右侧）、全屏播放器 / 字幕模式、平板与移动端全屏、右键菜单、批量操作均新增下载入口；仅在 Cookie 登录（`isLogin() === 1`）时可用
- **下载列表**：顶栏右上角新增「下载列表」抽屉（仿播放队列，登录后显示），含「下载中 / 已完成」分页、实时进度、失败重试、移除与清空
- **网页端实现**：浏览器 `fetch` 流式读取 + 进度回写 + `file-saver` 落盘；Electron 端行为不变（仍由原生下载器写入元数据 / 歌词 / 逐字歌词 / ASS）
- **链接回退**：`/song/download/url/v1` 不可用（常见 `code: -105`）时自动回退 `/song/url/v1` 播放链接，保证网页端可用性
- **权限校验**：本体按 `song.free` + `userData.vipType` 预校验；接口侧 `-110 / -447 / 404` 与「试听片段」统一映射为可读提示（避免把 30s 试听当成完整文件保存）

> [!NOTE]
> 网页端下载需使用 Cookie 登录（扫码 / 手机号），UID 登录不支持下载；文件保存至浏览器默认下载目录，暂不支持指定路径（受浏览器沙箱限制）。

### 2026-09-12 安全加固与性能优化

> 基于两轮审计（下载功能专项审计 + 全量安全审计）落地的代码改动。

- **下载链路加固**（`src/core/resource/DownloadManager.ts`）：下载地址协议白名单（拦截 `data:` / `blob:` / `file:`）、内网与回环地址拦截（修复 `::ffff:` IPv4-mapped IPv6 绕过并补全保留网段）、重定向最终地址复校验、文件名非法字符清理与长度限制、扩展名白名单、单文件 512MB 上限、单任务 10 分钟超时、传输完整性校验、试听片段拦截、仅登录态恢复下载队列
- **主进程纵深防御**：`download-file` 与 `save-file` IPC 均增加协议 / 文件名净化和目标路径越界校验（此前渲染进程传入的 `fileName` 含 `../` 可越出下载目录写文件）
- **导航白名单**（`electron/main/windows/main-window.ts`）：主窗口 `will-navigate` 仅允许应用自身源导航。此前可导航到任意外部站点，叠加该窗口的 `nodeIntegration` 将形成「打开恶意页面即获得本机能力」的 RCE 链路；应用内外链仍通过 `window.open` → 系统浏览器打开，功能不受影响
- **健壮性**：下载任务 / 已完成记录的空值防护（历史或损坏的持久化数据不再导致启动、重试或渲染报错）；已完成记录上限 500 条
- **性能优化**：下载进度上报节流（进度变化 ≥1% 且间隔 ≥200ms 才回写，并预计算体积文案）、Blob 构造前释放分块引用、清空下载列表批量化、移除重复的队列恢复调用

### 2026-09-12 安全加固补充（第二轮审计项全部落地）

- **登录窗口隔离**（`electron/main/windows/login-window.ts`）：该窗口加载第三方站点（`music.163.com`），改为 `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`，恢复正常同源策略与内容安全，并**不注入预加载脚本**（不再向第三方页面暴露任何 IPC 能力）
- **内容安全策略（CSP）**：Electron 通过 `session.defaultSession.webRequest.onHeadersReceived` 统一附加 `Content-Security-Policy`（含 `object-src 'none'` / `base-uri 'self'` / `frame-ancestors 'none'`），网页端同时在 `index.html` 内联同策略 meta，两端一致生效
- **本机 API 服务来源校验**（`electron/server/index.ts`）：`/api/*` 请求校验 `Host`（阻断 DNS rebinding）、`Origin`（阻断跨站页面调用）与 `Sec-Fetch-Site: cross-site`；另支持设置环境变量 `SPLAYER_API_TOKEN` 后强制携带 `x-splayer-token` 头或 `?token=`（默认关闭，便于与第三方整合）
- **IPC 追加加固**：`set-music-metadata` 仅允许写入音频扩展名、`delete-file` 仅允许删除已存在的普通文件并拒绝系统关键目录、`send-to-main-win` 增加事件名白名单（`playPrev` / `playOrPause` / `playNext`）、`register-protocol` 增加协议白名单（仅 `orpheus`）
- **第三方内容净化**：新增 `src/utils/sanitizeHtml.ts`，更新日志（远程 Markdown → HTML）渲染前按标签/属性白名单净化，链接强制 `noopener`
- **安全自检脚本**：`pnpm security:selfcheck`（零依赖，43 项用例：协议白名单、内网/保留地址拦截、IPv4-mapped IPv6 绕过、文件名与扩展名净化）

### 2026-09-12 登录凭据改走请求头（安全加固）

- **背景**：此前登录态以查询参数传递（`?cookie=MUSIC_U%3D...`），凭据会进入 URL、API 访问日志、浏览器历史与 Referer
- **客户端改动**（`src/utils/request.ts`）：默认改为经 **`X-Netease-Cookie` 请求头**传递，且**仅对网易云 API 生效**（不会把凭据附加到 Last.fm / GitHub / QQ 音乐等第三方）；可在「设置 → 网络 → 使用请求头传递登录 Cookie」关闭以回退查询参数
- **服务端配套**（api-enhanced fork）：支持 `X-Netease-Cookie` / `X-SPlayer-Cookie` 请求头，并加入 CORS 允许头；新增预检缓存 `Access-Control-Max-Age: 600`
- **客户端内嵌服务**（`electron/server/netease`）：同步支持该请求头，dev 模式行为一致
- **顺带修复**：`src/utils/cookie.ts` 不再把 Cookie **值**打印到控制台（仅打印名称）
- **后续（2026-09-13）**：为彻底杜绝凭据进入 URL，该设置项已**移除**，「请求头传递」成为唯一路径（历史持久化字段保留但不再生效）；同时 api-enhanced 侧对访问日志做脱敏（`cookie=***`）

### 2026-09-12 播放/下载容错（API 服务不改动）
- **取链风控自愈**：API 服务出口 IP 被网易云风控时取链会返回 `code: 404 / -110` 且 `url` 为空；本体在**播放**与**下载**取链失败时自动携带 `randomCNIP=true` 重试一次，恢复播放/下载
- **IP 选项优先级**：调用方显式传入的 `realIP` / `randomCNIP` 优先于设置项，便于按需重试（「设置 → 网络 → 使用真实 IP」保留不变）
- **TTML 歌词**：api-enhanced 未提供 `/lyric/ttml`（远端返回 404），`songLyricTTML()` 改为优先 AMLL TTML DB、客户端再回退本机内嵌服务 `/api/netease/lyric/ttml`
- **解锁播放/下载**：NETEASE 解锁源改为优先调用 API 服务的 `/song/url/match`（服务端完成匹配/解锁，**网页端同样可用**），失败再回退自建 `/api/unblock`

### 2026-09-12 我的云盘支持上传

- **入口**：「我的云盘」页新增「上传」按钮（可多选音频文件），串行上传并实时显示进度（`src/views/Cloud.vue`）
- **流程**：对齐新版客户端 —— 计算文件 MD5 → `GET /cloud/upload/token` 换取上传凭据 → **分片直传网易云 NOS**（8MB/片，`x-nos-token` 请求头）→ `POST /cloud/upload/complete` 登记云盘信息（`src/api/cloud.ts`）
- **断点续传**：上传进度与凭据持久化到本地队列（`src/utils/uploadQueue.ts`）；刷新/中断后页面顶部提示「未完成上传」，**重新选择同一文件**即可从断点继续（不会再重传已上传分片）
- **风控规避**：Electron 端上传的元数据请求优先走**本机内置 API**（`127.0.0.1:25884/api/netease`，即用户本机网络出口），避免在线 API 的数据中心 IP 被网易云风控（`-460`）；本机 API 不可用（未启动/版本过旧/返回非预期结构）时自动回退在线 API
- **续传安全**：续传前重新计算 MD5 校验文件身份（同名同体积但内容不同时放弃续传），避免拼接出损坏的云端对象
- **登记容错**：直传完成而「登记云盘信息」失败时，任务保留为「待登记」，重选文件只补登记、不重传任何分片
- **哈希性能**：文件 MD5 在 **Web Worker** 中计算（Worker 不可用自动回退主线程），避免大文件哈希冻结界面
- **直传地址**：LBS 返回的是 HTTP 主机，网页版会被「混合内容」拦截 → 统一升级为 **HTTPS** 直传
- **兼容**：`needUpload === false`（云端已有相同 MD5 文件）时跳过直传；空文件与超限文件前端拦截；上传成功后才刷新云盘列表
- **错误映射**：`-110 / -447`（未登录或权限不足）、`-460`（出口 IP 风控）、`301`（登录失效）、`250`（云盘空间不足）等已转成可读文案
- **上限**：单文件 200MB（MD5 需整文件入内存，收敛上限以控制内存峰值）
- **图标**：新增 `src/assets/icons/Upload.svg`

### 2026-09-13 自建 / 隐私歌单打不开（401）修复

- **现象**：打开自己创建的歌单（`#/playlist?id=…`）报「获取歌单详情失败」并跳回首页；`GET /playlist/detail?id=…&s=0&noCookie=true` 返回 **401**
- **原因**（`src/api/playlist.ts`）：`playlistDetail` 传了 `noCookie: true`，而 `src/utils/request.ts` 的拦截器一旦看到该参数就会**完全跳过登录凭据**；于是自建/隐私歌单（`privacy=10`）被以匿名身份查询 → 网易云直接 401（官方 App 因携带登录态可正常打开）
- **修复**：移除 `noCookie: true`（登录态经 `X-Netease-Cookie` 请求头携带；未登录时行为不变）。顺带修复连带问题：响应恢复 `privileges` 字段后，`views/List/playlist.vue` 与 `views/List/liked.vue` 依赖它的「一次拉取全量歌曲」快捷路径重新可用
- **验证**：线上 API 匿名实测——私有歌单 401 / 公开歌单 200；修复后经本机 API 实测请求 URL 已无 `noCookie`，公开歌单页完整渲染（详情 + 全部歌曲 + 评论）且控制台无报错

### 2026-09-13 移动端适配修复

- **弹窗宽度**（`src/style/main.scss`）：naive-ui 弹窗/对话框宽度此前由内联样式硬编码（`src/utils/modal.ts` 内 37 处，400–700px），窄屏会超出视口并被裁掉 → 统一按视口夹取 `max-width: calc(100vw - 24px)`（桌面端窗口更宽，不受影响；探针实测：请求 700px 在 377px 视口下渲染为 337px）
- **网格轨道可收缩**：`repeat(N, 1fr)` 中的 `1fr` 隐含 `minmax(auto, 1fr)`，会被内容最小宽度顶大（实测发现页列宽 `99.8 / 166.5 / 105.7px`、容器 404px > 可用 345px，**288 个元素横向溢出且被 `overflow` 裁掉、内容不可见**）→ 8 个文件统一改为 `minmax(0, 1fr)`；`#main-content` 补 `gridTemplateColumns: 'minmax(0, 1fr)'`，`.router-view` 补 `min-width: 0`（实测 288 → **0**）
- **移动端视口高度**：13 处 `100vh` 在移动浏览器会被地址栏/工具栏遮挡（底部播放条被顶出屏幕）→ 新增 `--vh-full`（`100dvh` 优先、`vh` 回退）并全量替换；`body { width: 100vw }` → `100%`（`100vw` 含滚动条宽度，是横向溢出源）
- **安全区适配**：`index.html` 增加 `viewport-fit=cover`，`#app-layout` 补 `env(safe-area-inset-*)`，避免底部播放条被 Home 指示条遮挡
- **触屏可用性**（`@media (hover: none)` 常显，构建产物已含 4 条规则）：侧栏「漫游」按钮（原为 `pointer-events: none` + hover 显示，**手机上完全无法点击**）、账号列表「删除账号」、云盘容量数字（信息被隐藏）、歌单/专辑封面「播放按钮」
- **验证方式**：自建无头体检工具（Electron 隐藏窗口 + iPhone UA + 390×844 视口 + CDP 触屏模拟）对**构建产物**实测手机首页 / 云盘（触发登录弹窗）/ 发现页 / 歌单页 / 桌面首页：横向溢出 0、过小热区 0、弹窗不越界、控制台仅 `ResizeObserver` 良性告警
- **未覆盖**：播放态底部播放条与登录后的云盘上传 UI（分别需要播放态与真实登录态），建议真机复核

### 已知限制（架构取舍，记录以便后续迭代）

- 主窗口为兼容远程音频/图片仍保留 `webSecurity: false` / `allowRunningInsecureContent: true` / `nodeIntegration: true`；改为默认安全配置需要较大范围的回归测试，暂以「导航白名单 + CSP + IPC 参数校验」降低风险
- 登录态 Cookie 现已**统一**经 `X-Netease-Cookie` 请求头传递（不再提供查询参数回退，避免凭据进入 URL、服务端日志与浏览器历史）；API 侧已同步支持该请求头并做了日志脱敏
- 由于 API 为独立域、凭据必须由前端**读取后显式传递**，因此无法改用 `httpOnly` Cookie 存放登录态（S6 的根治需要 API 侧改为服务端会话：凭据只存服务端，前端仅持有会话标识）；当前以 `SameSite=Lax` + HTTPS 下 `Secure` + 登出清理 + 缩短上传令牌有效期降低暴露面
- 以域名为形式指向内网的地址（DNS rebinding）无法在前端完全拦截；下载地址与本机 API 已完成可拦截部分的校验

### 部署提示

- 部署网页端时，请在构建环境（如 Vercel 项目环境变量）中配置 `VITE_API_URL`，指向你自行部署的 API 服务地址（结尾不要带 `/`），或直接修改仓库中的 `.env` 文件
- API 服务建议使用 [api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 最新版本；若其部署的 CORS 配置为通配符 `*`，请勿在 API 侧与播放器侧同时开启凭证模式

## 🔍 审计报告（2026-09-13）

> **对象**：本仓库（渲染层 / Electron 主进程 / `vercel.json`）与配套 fork（[api-enhanced](https://github.com/DelicateDuck582/api-enhanced)）。
> **方法**：以生产控制台日志为线索，结合代码核对与线上**只读**实测（`curl -I`、匿名请求、本地复现）。**报告与仓库中不保存任何真实凭据**；涉及凭据链路的验证统一使用无害标记串。

### 安全

| 编号 | 问题 | 证据 | 状态 |
| --- | --- | --- | --- |
| S1 | **登录凭据可进入服务端日志**：客户端在回退路径把 Cookie 放进查询参数（`?cookie=`），而 API 服务直接记录 `req.originalUrl` | 本地复现命中：`[INFO] Request Success: [weapi] /login/status?cookie=MUSIC_U=_TEST_LEAK_MARKER_…` | **已修复**：客户端一律走 `X-Netease-Cookie` 请求头且仅对网易云 API 生效；API 侧新增 `maskSensitiveQuery()`，实测日志变为 `cookie=***` |
| S2 | **CSP 过宽**：`script-src` 含 `'unsafe-eval'` 与任意 `http:`/`https:` 源，且 `frame-ancestors` 无法用 meta 下发 | `index.html` | **部分修复**：移除 `script-src` 中的裸 `http:`、补 `'wasm-unsafe-eval'` 与 `form-action 'self'`；`frame-ancestors` 改由 HTTP 头下发。`'unsafe-eval'` **必须保留**（emscripten ffmpeg 与「自定义 JS」功能依赖 `new Function`） |
| S3 | **站点缺安全响应头** | 线上仅返回 HSTS | **已修复**：`vercel.json` 增加 `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy` / CSP `frame-ancestors` |
| S4 | **本机 API 反射任意 Origin** | 本地实测 `Origin: https://evil.example` → `Access-Control-Allow-Origin: https://evil.example` | **已缓解**：启动时打印告警，建议设置 `CORS_ALLOW_ORIGIN` 白名单 |
| S5 | **`ACAO: *` 与 `Allow-Credentials: true` 并存**（违反 CORS 规范，且放大任意源调用） | 线上 API 响应头实测 | **已修复**：API 不再下发 `Access-Control-Allow-Credentials` |
| S6 | **凭据持久化在 localStorage**，浏览器扩展 / XSS 可直接读取 | `utils/cookie.ts`、`utils/auth.ts`、`utils/uploadQueue.ts`；生产日志中存在浏览器扩展注入的 `content_main.js` | **部分加固**：`SameSite=Lax` + HTTPS 下 `Secure`。**根治需 API 侧 session 化**（见「已知限制」） |
| S7 | **生产剥离 `console.log` 影响线上排障** | `electron.vite.config.ts` 的 `pure_funcs` | **已文档化**：需要线上可见的诊断改用 `console.info`（云盘直传方式日志已如此） |
| S8 | dev 环境打印完整登录响应（含 Cookie） | `components/Modal/Login/Login.vue` | **已修复**：移除该日志 |

### 性能

| 编号 | 问题 | 状态 |
| --- | --- | --- |
| P1 | 哈希静态资源为 `max-age=0, must-revalidate`，每次访问都回源校验（弱网首屏明显变慢） | **已修复**：`/assets`、`/fonts`、`/icons`、`/wasm`、`/images` → `max-age=31536000, immutable` |
| P2 | 首包偏大：`stores` chunk 2.15MB / gzip 623KB | **已修复**：拆分 `vendor-ui` / `vendor-amll` / `vendor-vueuse` / `vendor-utils`，`stores` 降至 0.70MB / gzip 212KB |
| P3 | 弱网字体回退抖动（日志中出现 fallback font 提示） | **已修复**：`font-display: swap` + `logo.woff2` preload（该字体仅约 1KB） |
| P4 | 无谓重试放大确定性失败（CORS / 4xx），日志中同一 NOS URL 出现两次 | **已修复**：指数退避 + 仅重试超时 / 5xx / 429 |
| P5 | 启动期重复歌词解析（`LyricStripper` 三连扫描） | **待办**（收益有限，未改动） |
| P6 | 云盘读回使用整对象 GET，且 NOS 直连在浏览器**必被 CORS 拦截** | **待办**：`nosup-*.127.net` 响应**不返回 `Access-Control-Allow-Origin`**（匿名 HEAD 实测 `400`、仅有 `Timing-Allow-Origin`）→ 需改为 API 代理 / 签名 URL + Range 读取 |

### 密钥

| 编号 | 结论 |
| --- | --- |
| K1 | ✅ **当前代码树与全历史均无真实凭据字面量**：`MUSIC_U=<20+ 位>`、`ghp_`、`AKIA`、`sk-`、`xox[baprs]-`、`BEGIN … PRIVATE KEY` 全部无命中 |
| K2 | ⚠️ `.env` 仍被 git 跟踪：历史变量仅 `VITE_API_URL` / `VITE_WEB_PORT` / `VITE_SERVER_PORT`（**无密钥**）。已在文件顶部加「禁止写入密钥」警示并新增 `.env.example`；如需彻底移出跟踪，请先在 Vercel 项目环境变量中配置 `VITE_*`（否则线上构建的 API 地址会变空） |
| K3 | ✅ api-enhanced 侧仅跟踪 `.env.prod.example`（示例键名）；`util/xeapiKey.js` 的 `sk` 为**运行时**从网易接口获取，未入库；`util/crypto.js` 内为协议固定公开密钥 |
| K4 | ⚠️ 若线上配置了 `NETEASE_COOKIE` 环境变量，需配合 S1 的日志脱敏与定期轮换（凭据集中在服务端，泄漏面为环境配置与日志） |

### 移动端

| 编号 | 问题 | 状态 |
| --- | --- | --- |
| M1 | 弹窗宽度硬编码（37 处 400–700px），窄屏超出视口 | **已修复**（全局夹取；探针实测 700px → 337px） |
| M2 | 网格 `1fr` 轨道不可收缩 → 发现页 288 个元素溢出且被裁剪（内容不可见） | **已修复**（8 个文件；实测 288 → 0） |
| M3 | `100vh` 导致移动端底栏被地址栏遮挡 | **已修复**（`--vh-full` + `100dvh` 回退） |
| M4 | 缺少刘海屏 / Home 指示条安全区适配 | **已修复**（`viewport-fit=cover` + `env(safe-area-inset-*)`） |
| M5 | hover-only 控件在触屏不可用 / 不可见（侧栏漫游按钮、删除账号、云盘容量、封面播放按钮） | **已修复**（`@media (hover: none)`；构建产物已含 4 条规则） |

### 复审建议

1. 部署后执行：`curl -I https://<站点>/assets/<hash>.js` 复核 `immutable` 缓存；`curl -I https://<站点>/` 复核安全响应头
2. 登录后抓一次请求，确认 URL 中不再出现 `cookie=`（凭据只应出现在 `X-Netease-Cookie` 请求头）
3. 待办项优先级：**P6**（云盘读回 CORS/大文件）> S6 根治（API session 化）> S2 CSP 收紧（需回归）> P5


### 快速开始

1. 安装依赖：`pnpm install`
2. 复制 `.env.example` 为 `.env` 并按需修改
3. 启动开发：`pnpm dev`
4. 构建：
   - `pnpm build`
   - `pnpm build:win`

### 跳过原生模块构建

默认会编译 `native/*` 下的原生模块（需要 Rust）。如果你的场景不需要原生能力，可设置 `SKIP_NATIVE_BUILD=true` 后再执行 `pnpm dev` / `pnpm build`。

## 👀 Demo

- 在线演示：[SPlayer](https://music.ciallo.sale/)

  > 原在线演示链接已失效，此处为本项目自建部署的 Demo

## 🎉 功能

- ✨ 支持扫码登录
- 📱 支持手机号登录
- ~~📅 自动进行每日签到及云贝签到~~
- 💻 支持桌面歌词
- 💻 支持切换为本地播放器，此模式将不会连接网络
- 🎨 封面主题色自适应，支持全站着色
- 🌚 Light / Dark / Auto 模式自动切换
- 📁 本地歌曲管理及分类（建议先使用 [音乐标签](https://www.cnblogs.com/vinlxc/p/11347744.html) 进行匹配后再使用）
- 📁 本地音乐标签编辑及封面修改
- ➕ 新建歌单及歌单编辑
- ❤️ 收藏 / 取消收藏歌单或歌手
- ☁️ 云盘音乐上传
- 📂 云盘内歌曲播放
- 🔄 云盘内歌曲纠正
- 🗑️ 云盘歌曲删除
- 🌐 支持 Subsonic / Navidrome 等流媒体服务（多服务器支持、自动连接）
- 📝 支持逐字歌词
- 🔄 歌词滚动以及歌词翻译
- 📹 MV 与视频播放
- 🎶 音乐频谱显示
- ⏭️ 音乐渐入渐出
- 🔄 支持 PWA
- 💬 支持评论区
- 🎵 支持 Last.fm Scrobble（播放记录上报）
- ⬇️ 网页端支持歌曲下载（Cookie 登录后可用，含下载列表与实时进度）
- 📱 移动端基础适配

## 🖼️ 界面展示

> 开发中，仅供参考

<details>
<summary> 主页面 </summary>

![主页面](/screenshots/SPlayer%20-%20主页面.jpg)

</details>

<details>
<summary> 播放页面 </summary>

![播放页面](/screenshots/SPlayer%20-%20播放页面.jpg)

</details>

<details>
<summary> 发现页面 </summary>

![发现页面](/screenshots/SPlayer%20-%20发现页面.jpg)

</details>

<details>
<summary> 歌单页面 </summary>

![发现页面](/screenshots/SPlayer%20-%20歌单页面.jpg)

</details>

<details>
<summary> 评论页面 </summary>

![发现页面](/screenshots/SPlayer%20-%20评论页面.jpg)

</details>

<details>
<summary> 本地音乐 </summary>

![发现页面](/screenshots/SPlayer%20-%20本地音乐.jpg)

</details>

## 📦️ 获取

### 二进制安装方案

#### 稳定版

通常情况下，可以在 [Releases](https://github.com/imsyy/SPlayer/releases) 中获取稳定版

也可前往 [SPlayer 官网](https://splayer.imsyy.top/) 获取稳定版

#### 开发版

可以通过 GitHub Actions 工作流获取最新的开发版

[Dev Workflow](https://github.com/imsyy/SPlayer/actions/workflows/dev.yml)

### 自行部署方案

#### ⚙️ Docker 部署

> 安装及配置 `Docker` 将不在此处说明，请自行解决

##### 本地构建

> 请尽量拉取最新分支后使用本地构建方式，在线部署的仓库可能更新不及时

```bash
# 构建
docker build -t splayer .

# 运行
docker run -d --name SPlayer -p 25884:25884 splayer
# 或使用 Docker Compose
docker-compose up -d
```

Docker 镜像内包含网页端以及运行所需的服务，默认通过 `25884` 端口访问。

##### 在线部署

```bash
# 从 Docker Hub 拉取
docker pull imsyy/splayer:latest
# 从 GitHub ghcr 拉取
docker pull ghcr.io/imsyy/splayer:latest

# 运行
docker run -d --name SPlayer -p 25884:25884 imsyy/splayer:latest
```

以上步骤成功后，将会在本地 [localhost:25884](http://localhost:25884/) 启动，如需更换端口，请自行修改命令行中的第一个端口号

#### ⚙️ Vercel 部署

> 其他部署平台大致相同，在此不做说明

1. 本程序依赖 [NeteaseCloudMusicApi](https://github.com/neteasecloudmusicapienhanced/api-enhanced) 运行，请确保您已成功部署该项目或兼容的项目，并成功取得在线访问地址
2. 点击本仓库右上角的 `Fork`，复制本仓库到你的 `GitHub` 账号
3. 复制 `/.env.example` 文件并重命名为 `/.env`
4. 将 `.env` 文件中的 `VITE_API_URL` 改为第一步得到的 API 地址

   ```js
   VITE_API_URL = "https://example.com";
   ```

5. 将 `Build and Output Settings` 中的 `Output Directory` 改为 `out/renderer`

   ![build](/screenshots/build.jpg)

6. 点击 `Deploy`，即可成功部署

#### ⚙️ 服务器部署

1. 重复 `⚙️ Vercel 部署` 中的 1 - 4 步骤
2. 克隆仓库

   ```bash
   git clone https://github.com/imsyy/SPlayer.git
   ```

3. 安装依赖

   ```bash
   pnpm install
   ```

4. 编译打包

   ```bash
   pnpm build
   ```

5. 将站点运行目录设置为 `out/renderer` 目录

#### ⚙️ 本地部署

1. 本地部署需要用到 `Node.js`（>= 20），可前往 [Node.js 官网](https://nodejs.org/zh-cn/) 下载安装包，请下载最新稳定版
2. 安装 pnpm（>= 10）

   ```bash
   corepack enable
   # 或
   npm install pnpm -g
   ```

3. 克隆仓库并拉取至本地，此处不再赘述
4. 使用 `pnpm install` 安装项目依赖（若安装过程中遇到网络错误，请使用国内镜像源替代，此处不再赘述）
5. 复制 `.env.example` 文件并重命名为 `.env` 并修改配置（如需跳过原生模块构建，可设置 `SKIP_NATIVE_BUILD=true`）
6. 打包客户端，请依据你的系统类型来选择，打包成功后，会输出安装包或可执行文件在 `/dist` 目录中，可自行安装

   > 默认情况下，构建命令仅会构建当前系统架构的版本。如需构建特定架构（如 x64 + arm64），请在命令后追加参数，例如：`pnpm build:win -- --x64 --arm64`

   | 命令               | 系统类型 |
   | ------------------ | -------- |
   | `pnpm build:win`   | Windows  |
   | `pnpm build:linux` | Linux    |
   | `pnpm build:mac`   | macOS    |

## 😘 鸣谢

特此感谢为本项目提供支持与灵感的项目：

- [NeteaseCloudMusicApi](https://github.com/neteasecloudmusicapienhanced/api-enhanced)
- [YesPlayMusic](https://github.com/qier222/YesPlayMusic)
- [UnblockNeteaseMusic](https://github.com/UnblockNeteaseMusic/server)
- [applemusic-like-lyrics](https://github.com/Steve-xmh/applemusic-like-lyrics)
- [Vue-mmPlayer](https://github.com/maomao1996/Vue-mmPlayer)
- [refined-now-playing-netease](https://github.com/solstice23/refined-now-playing-netease)
- [material-color-utilities](https://github.com/material-foundation/material-color-utilities)

## 🗺️ 贡献者联盟

欢迎加入我们 🥰! 一起为 SPlayer 贡献一份力量。
感谢以下所有贡献者 💖

<a href="https://github.com/imsyy/SPlayer/graphs/contributors" target="_blank" rel="noopener">
  <img src="https://contrib.rocks/image?repo=imsyy/SPlayer&max=30&anon=1&v=1"
    alt="SPlayer 项目贡献者"
    width="650"
    loading="lazy"
  />
</a>

## 📢 免责声明

本项目部分功能使用了网易云音乐的第三方 API 服务，**仅供个人学习研究使用，禁止用于商业及非法用途**

同时，本项目开发者承诺 **严格遵守相关法律法规和网易云音乐 API 使用协议，不会利用本项目进行任何违法活动。** 如因使用本项目而引起的任何纠纷或责任，均由使用者自行承担。**本项目开发者不承担任何因使用本项目而导致的任何直接或间接责任，并保留追究使用者违法行为的权利**

请使用者在使用本项目时遵守相关法律法规，**不要将本项目用于任何商业及非法用途。如有违反，一切后果由使用者自负。** 同时，使用者应该自行承担因使用本项目而带来的风险和责任。本项目开发者不对本项目所提供的服务和内容做出任何保证

感谢您的理解

## 📜 开源许可

- **本项目仅供个人学习研究使用，禁止用于商业及非法用途**
- 本项目基于 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 许可进行开源
  1. **修改和分发：** 任何对本项目的修改和分发都必须基于 AGPL-3.0 进行，源代码必须一并提供
  2. **派生作品：** 任何派生作品必须同样采用 AGPL-3.0，并在适当的地方注明原始项目的许可证
  3. **注明原作者：** 在任何修改、派生作品或其他分发中，必须在适当的位置明确注明原作者及其贡献
  4. **免责声明：** 根据 AGPL-3.0，本项目不提供任何明示或暗示的担保。请详细阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 以了解完整的免责声明内容
  5. **社区参与：** 欢迎社区的参与和贡献，我们鼓励开发者一同改进和维护本项目
  6. **许可证链接：** 请阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 了解更多详情
