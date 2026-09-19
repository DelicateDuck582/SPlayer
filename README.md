> [!CAUTION]
>
> # 原项目进入维护模式
>
> 原项目已进入维护模式，后续仅进行必要的维护与重大问题修复，不再主动开发新功能
>
> 新功能及后续版本请移步 [SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)
>
> ## 本仓库说明（个人修改版）
>
> - **原作者 / 原项目**：[imsyy](https://github.com/imsyy)（[imsyy.top](https://imsyy.top)）开发的 [SPlayer](https://github.com/SPlayer-Dev/SPlayer)
> - **原链接（上游）**：https://github.com/SPlayer-Dev/SPlayer
> - **许可证**：[GNU AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html)（与原项目一致，**不改变原许可**；对代码的修改、分发或衍生作品须同样采用 AGPL-3.0，并保留原作者的版权与许可信息，全文见 [LICENSE](./LICENSE)）
> - **本仓库性质**：**个人修改版**，由 [DelicateDuck582](https://github.com/DelicateDuck582) 基于上游二次开发与自行维护；**非官方版本，与原作者、SPlayer 官方团队无关**，不代表官方立场，也未经官方审核或背书
> - **与上游关系**：上游已进入维护模式并归档，本仓库**不跟进上游、不向上游提交**；所有改动集中在 `feat/api-enhanced` 分支，`NEWAPI` 分支在其之上补齐网易云官方 API 能力（曲风、MV、音乐日历、听歌足迹、消息、用户主页、会员/云贝等）
> - **本仓库地址**：https://github.com/DelicateDuck582/SPlayer
> - 变更摘要见 [更新记录](#changelog-summary)，详细更新日志与审计报告见 [doc/](./doc/README.md)
> - 版权与归属的完整说明见 [关于本仓库（版权与归属）](#about-this-repo)

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

<a id="changelog-summary"></a>

## 📝 更新记录（摘要）

> 每条变更的**背景、实现要点与验证方式**见 [doc/CHANGELOG.md](./doc/CHANGELOG.md)；审计问题、证据与待办见 [doc/AUDIT.md](./doc/AUDIT.md)。
> 本仓库为个人维护的 fork，所有改动集中在 `feat/api-enhanced` 分支。

| 日期 | 变更摘要 | 详情 |
| --- | --- | --- |
| 2026-09-19 | **Web 端（Vercel）安全 / 密钥 / 性能审计**：修复登出后凭据残留（其余 Cookie 的 `localStorage` 副本 + 云盘上传令牌未清）；CSP 加固（补 `object-src` / `base-uri` / `form-action`）；消息中心首屏请求 4→1（通知类接口改懒加载）；**AMLL core 移出首屏（首屏 gzip 695.8KB→581.4KB，-16.4%）**；关闭 Vercel 部署保护（此前所有域名 302 到 SSO）。核查：线上产物密钥 0 命中、安全头无缺失、`v-html` 无可用注入点、定时器均有清理。另发现主站域名仍绑定旧分支（`feat/api-enhanced`） | [CHANGELOG § Web 端审计](./doc/CHANGELOG.md#v2026-09-19-web-audit) · [AUDIT § Web 端审计](./doc/AUDIT.md) |
| 2026-09-19 | **实测问题修复 + 日志与密钥治理**：修复消息中心（显示/输入框/发送）、最近播放「未知」、数字专辑排版、会员中心、私人漫游偶发打不开、点「开启控制台」致命错误；**修复私信抽屉/图片预览样式因 Teleport 而完全失效（样式改全局根类）、消息图片限尺寸到 260px 且抽屉不再出现横向滚动条**；**修复路由守卫条件写反导致带参页面（专辑/歌单/评论/视频/播客…共 10 条）全部被弹 403**（新增 `requireQuery()` + `pnpm test:route-guards` 回归测试）；消除 `vue-router` 弃用告警洪水；52 处日志收敛到开发环境（含签名直链/接口响应/用户 id）；删除 md 中的作者 npmjs 与上游 API 仓库链接 | [CHANGELOG § 实测问题修复](./doc/CHANGELOG.md#v2026-09-19-fixes) · [AUDIT § 实测与密钥审查](./doc/AUDIT.md#审计报告2026-09-19--实测问题与密钥审查) |
| 2026-09-19 | **网易云 API 能力补齐（第二批）+ 性能/安全审计修复**：新增 视频广场（含播放）/ 数字专辑 / 电台榜单 页面，`最近播放` 扩展为 6 个 Tab；浏览类接口改走缓存友好的 `neteaseBrowse`、曲风页加缓存、私信改 POST、播放地址协议白名单、写操作登录前置 | [CHANGELOG § 第二批 + 审计](./doc/CHANGELOG.md#v2026-09-19-newapi2) · [AUDIT § 增量审计](./doc/AUDIT.md#审计报告2026-09-19--newapi-分支增量) |
| 2026-09-19 | **网易云 API 能力补齐**（`NEWAPI` 分支）：377 个官方端点清单 + 类型安全通用调用器；新增 曲风 / MV 广场与播放 / 音乐日历 / 听歌足迹 / 消息中心 / 用户主页 / 会员与云贝签到 共 7 个页面 | [CHANGELOG § API 能力补齐](./doc/CHANGELOG.md#v2026-09-19-newapi) |
| 2026-09-18 | **API 源运行时切换**：设置 → 网络 → API 服务，可在多个自建 / npm 版 API 之间随时切换（**立即生效、无需重新构建**）；配套独立部署项目 `ncm-api-vercel`（npm 版 `NeteaseCloudMusicApi`，并补 `X-Netease-Cookie` 兼容） | [CHANGELOG § API 源切换](./doc/CHANGELOG.md#v2026-09-18-api-switch) |
| 2026-09-18 | **移动端第三轮**：歌单头部按钮不再压住简介/元信息（<420px）、横屏列表可正常滑动（滚动区可视高度 0px → 120px）、窄屏歌手名不再被压成 1px | [CHANGELOG § 移动端第三轮](./doc/CHANGELOG.md#v2026-09-18-mobile-header) |
| 2026-09-13 | **移动端适配**：弹窗按视口夹取、网格轨道改 `minmax(0, 1fr)`（修复发现页 288 个元素横向溢出）、`100vh` → `dvh`、安全区适配、4 处 hover-only 控件触屏常显 | [CHANGELOG § 移动端适配](./doc/CHANGELOG.md#v2026-09-13-mobile) |
| 2026-09-13 | **自建 / 隐私歌单 401 修复**：`playlistDetail` 移除 `noCookie`，恢复登录态与 `privileges` | [CHANGELOG § 歌单 401](./doc/CHANGELOG.md#v2026-09-13-playlist) |
| 2026-09-13 | **审计落地（安全 / 性能）**：凭据不再经 URL、API 日志脱敏、CSP 收紧、安全响应头、静态资源 `immutable`、分包、字体、重试策略 | [CHANGELOG § 审计落地](./doc/CHANGELOG.md#v2026-09-13-audit) |
| 2026-09-12 | **我的云盘支持上传**：分片直传网易云 NOS、断点续传、风控规避、错误映射 | [CHANGELOG § 云盘上传](./doc/CHANGELOG.md#v2026-09-12-cloud) |
| 2026-09-12 | **播放 / 下载容错**：取链风控自愈、TTML 歌词、解锁源改为服务端匹配 | [CHANGELOG § 播放下载容错](./doc/CHANGELOG.md#v2026-09-12-playback) |
| 2026-09-12 | **登录凭据改走请求头** `X-Netease-Cookie`（09-13 收敛为唯一路径） | [CHANGELOG § 请求头凭据](./doc/CHANGELOG.md#v2026-09-12-cookieheader) |
| 2026-09-12 | **安全加固补充**（第二轮审计项全部落地）：登录窗口隔离、CSP、本机 API 来源校验、IPC 加固、内容净化、自检脚本 | [CHANGELOG § 安全加固补充](./doc/CHANGELOG.md#v2026-09-12-audit2) |
| 2026-09-12 | **安全加固与性能优化**（第一轮审计）：下载链路加固、主进程纵深防御、导航白名单 | [CHANGELOG § 安全加固一](./doc/CHANGELOG.md#v2026-09-12-audit1) |
| 2026-09-12 | **网页端歌曲下载**：下载入口、下载列表抽屉、流式保存、链接回退 | [CHANGELOG § 歌曲下载](./doc/CHANGELOG.md#v2026-09-12-download) |
| 2026-08-19 | **适配新版网易云音乐 API**：切换到 api-enhanced、CORS 兼容、缓存健壮性 | [CHANGELOG § API 适配](./doc/CHANGELOG.md#v2026-08-19-api) |

### 已知限制与部署提示（摘要）

> 完整清单与待办优先级见 [doc/AUDIT.md § 已知限制与待办](./doc/AUDIT.md#已知限制与待办)。

- 主窗口为兼容远程音频 / 图片仍保留 `webSecurity: false` 等配置，暂以「导航白名单 + CSP + IPC 参数校验」降低风险
- 登录凭据存于前端并经请求头传递：API 为独立域，无法使用 `httpOnly` Cookie；根治需 API 侧引入服务端会话
- 云盘读回为整对象 GET，且 NOS 直连在浏览器必被 CORS 拦截（待改为 API 代理 / 签名 URL）
- 部署网页端时请在构建环境（如 Vercel 项目环境变量）配置 `VITE_API_URL`，指向自建 API 服务地址（结尾不要带 `/`），或直接修改仓库 `.env`
- API 服务建议使用 api-enhanced 最新版本；若其 CORS 配置为通配符 `*`，请勿在播放器侧同时开启凭证模式

## 🔍 审计报告

> 完整报告（安全 S1–S8 / 性能 P1–P6 / 密钥 K1–K4 / 移动端 M1–M5，含问题、证据、状态、复审建议与待办）见 **[doc/AUDIT.md](./doc/AUDIT.md)**。

- 结论速览：安全 6 项已修复 / 1 项部分修复 / 1 项已缓解；性能 4 项已修复、2 项待办；密钥 2 项通过、2 项需注意；移动端 5 项全部已修复
- **2026-09-19 增量（`NEWAPI` 分支）**：安全 4 项（3 项已修复 / 1 项通过）、性能 4 项（全部已修复）、观察项 1 项（web 模式既有控制台报错，已用未改动路由作对照证明非本分支引入）
- 高优先级待办：云盘读回 CORS（P6）、凭据存储根治（S6）、CSP 收紧（S2）

## 🧑‍💻 开发

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
- 🌐 **API 源运行时切换**：设置 → 网络 → API 服务，可在 npm 版 / api-enhanced / 自建 API 之间一键切换，立即生效、无需重新构建
- 🧩 **网易云 API 能力补齐**（`NEWAPI` 分支）：内置官方 377 个端点清单与类型安全通用调用器
- 🎼 曲风浏览（曲风下的歌曲 / 歌单 / 歌手）
- 📹 MV 广场与 MV 播放（多分辨率回退取链、相似 MV、收藏、评论入口）
- 🎬 视频广场（107 个视频标签、推荐流与时间线、弹窗播放）
- 💿 数字专辑 / 新碟上架、语种风格馆与已购
- 📻 电台榜单（热门 / 推荐 / 节目榜 / 付费精品）
- 🕘 最近播放分类（歌曲 / 歌单 / 专辑 / 视频 / 声音 / 播客）
- 🗓️ 音乐日历（按天回看听过的歌，可一键播放当日歌单）
- 📊 听歌足迹（累计 / 本周 / 本月 / 年度收听时长与今日收听）
- 💬 消息中心（私信会话与发送、评论 / @我 / 通知）
- 👤 用户主页（歌单、关注、粉丝、听歌排行，关注 / 取关）
- 💎 会员中心（VIP 状态与到期、成长值领取、云贝与每日签到、会员任务）
- 📱 移动端基础适配

## 🧩 网易云 API 能力（`NEWAPI` 分支）

> npm 版 `NeteaseCloudMusicApi` 共 **377 个端点**。本项目把官方能力整理为一份可校验的端点清单 + 类型安全的通用调用器，并在此基础上补齐了一批此前没有入口的功能。

- **端点清单**：`src/api/netease/endpoints.ts`（自动生成，377 条，每条含中文说明）
  - 生成：`pnpm gen:netease-endpoints -- --pkg <上游包目录>`（或设置 `NCM_PKG_DIR`）
  - 校验：`pnpm gen:netease-endpoints -- --pkg <上游包目录> --check`（CI 可用，清单与上游不一致即失败）
- **通用调用器**：`src/api/netease` 的 `neteaseApi(path, options)` 与 `neteaseApiByName(name, options)`
  - 路径类型是 377 个字面量构成的联合类型，**拼错端点会在编译期报错**；默认附带 `timestamp`，与仓库其它 api 风格一致
- 所有调用都复用 `@/utils/request`，因此**跟随「设置 → 网络 → API 服务」里切换的 API 源**（npm 版 / api-enhanced / 自建服务均可）

### 已接入界面

| 功能 | 主要端点 | 入口 |
| --- | --- | --- |
| 曲风浏览（歌曲 / 歌单 / 歌手） | `/style/list`、`/style/detail`、`/style/song`、`/style/playlist`、`/style/artist` | 侧边栏「曲风」 |
| MV 广场 / MV 播放 | `/mv/all`、`/mv/detail`、`/mv/url`、`/simi/mv`、`/mv/sub` | 侧边栏「MV 广场」 |
| 音乐日历 | `/calendar`（缺歌曲信息时自动用 `/song/detail` 补全） | 侧边栏「音乐日历」 |
| 听歌足迹 | `/listen/data/total`、`/listen/data/realtime/report`、`/listen/data/report`、`/listen/data/year/report`、`/listen/data/today/song` | 侧边栏「听歌足迹」 |
| 会员中心 | `/vip/info/v2`、`/vip/growthpoint`、`/vip/growthpoint/get`、`/vip/tasks` | 侧边栏「会员中心」 |
| 云贝与签到 | `/yunbei/info`、`/yunbei/sign`、`/yunbei/tasks`、`/yunbei/task/finish`、`/daily_signin` | 侧边栏「会员中心」 |
| 消息中心 | `/msg/private`、`/msg/private/history`、`/msg/comments`、`/msg/forwards`、`/msg/notices`、`/send/text` | 侧边栏「消息中心」 |
| 用户主页 | `/user/detail`、`/user/playlist`、`/user/follows`、`/user/followeds`、`/user/record`、`/follow` | 侧边栏「我的主页」 |
| 视频广场（含弹窗播放） | `/video/group/list`、`/video/timeline/recommend`、`/video/timeline/all`、`/video/detail`、`/video/url` | 侧边栏「视频广场」 |
| 数字专辑 / 新碟 | `/album/list`、`/album/list/style`、`/album/new`、`/digitalAlbum/purchased` | 侧边栏「数字专辑」 |
| 电台榜单 | `/dj/hot`、`/dj/recommend`、`/dj/program/toplist`、`/dj/paygift` | 侧边栏「电台榜单」 |
| 最近播放分类 | `/record/recent/{playlist,album,video,voice,dj}` | 侧边栏「最近播放」的 6 个 Tab |

### 已封装 API、暂未接入界面

> 这些能力已在 `src/api/netease` 封装好（含类型与注释），需要时直接调用即可；其余任意端点也可用 `neteaseApi(path, params)` 调用。

| 能力 | 端点 | 未接入原因 |
| --- | --- | --- |
| 听歌识曲 | `/audio/match`、`/check/music` | 需要音频指纹，上游 demo 依赖第三方 `第三方音频指纹库（来源与许可未明确）`（57KB JS + 301KB WASM，许可未明确）→ 不把来源不明的二进制纳入仓库 |
| 播客声音 | `/voicelist/search`、`/voicelist/list`、`/voice/detail`、`/voice/lyric` | 实测匿名请求返回空（`total=0` / `code=400`），无法验证 |
| 音乐人中心 | `/musician/data/overview`、`/musician/play/trend`、`/musician/tasks`、`/musician/cloudbean` | 实测未登录 / 非音乐人返回 `400` / `301`，无法验证 |
| 相似内容 | `/simi/song`、`/simi/artist`、`/simi/playlist`、`/simi/user` | 已封装；MV 页已用 `/simi/mv`，其它入口待设计 |
| 一起听 / Mlog / 楼层评论 / 歌单导入 / 数字专辑购买 | `/listentogether/*`、`/mlog/*`、`/comment/floor`、`/playlist/import/*`、`/digitalAlbum/ordering` | 需要实时房间或额外交互链路，单独评估 |
| 其余全部端点 | 与上游 `module/<name>.js` 一一对应（377 个，见 `endpoints.ts`） | 均可用 `neteaseApi` 调用 |

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

1. 本程序依赖 NeteaseCloudMusicApi 运行，请确保您已成功部署该项目或兼容的项目，并成功取得在线访问地址
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

- NeteaseCloudMusicApi
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

<a id="about-this-repo"></a>

## 🙏 关于本仓库（版权与归属）

本仓库是 [SPlayer](https://github.com/SPlayer-Dev/SPlayer) 的**个人修改版**，非官方发行版。原项目版权与荣誉归原作者所有。

| 项目 | 说明 |
| --- | --- |
| 原作者 | [imsyy](https://github.com/imsyy)（[imsyy.top](https://imsyy.top)） |
| 原项目 | [SPlayer](https://github.com/SPlayer-Dev/SPlayer) |
| **原链接** | **https://github.com/SPlayer-Dev/SPlayer** |
| 许可证 | [GNU Affero General Public License v3.0（AGPL-3.0）](https://www.gnu.org/licenses/agpl-3.0.html)，全文见 [LICENSE](./LICENSE) |
| 本仓库 | [DelicateDuck582/SPlayer](https://github.com/DelicateDuck582/SPlayer)（个人修改版，工作分支 `feat/api-enhanced`） |
| 与官方的关系 | 无隶属关系，未经原作者审核、授权或背书，不代表原项目及 SPlayer-Next 的立场；请以原项目官方发布为准 |
| 上游状态 | 原项目已进入维护模式并归档，本仓库不再跟进上游 |

- 原有代码的版权归原作者 **imsyy** 及原项目的贡献者们所有，并继续按 **AGPL-3.0** 授权；本仓库未修改程序内的原作版权信息
- 本仓库新增的修改由本仓库维护者独立完成，**不代表**原作者的观点或立场，也不构成对原项目的官方维护
- 本仓库同样以 **AGPL-3.0** 开源：如需使用、修改或分发本仓库代码，请一并遵守 AGPL-3.0（保留原作者版权与许可信息、提供对应源代码、并在适当位置注明原作者）
- 若原作者或权利方认为本仓库的任何内容不妥，请联系本仓库维护者，我们会及时调整或移除

## 📜 开源许可

- **本项目仅供个人学习研究使用，禁止用于商业及非法用途**
- 本项目基于 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 许可进行开源
  1. **修改和分发：** 任何对本项目的修改和分发都必须基于 AGPL-3.0 进行，源代码必须一并提供
  2. **派生作品：** 任何派生作品必须同样采用 AGPL-3.0，并在适当的地方注明原始项目的许可证
  3. **注明原作者：** 在任何修改、派生作品或其他分发中，必须在适当的位置明确注明原作者及其贡献
  4. **免责声明：** 根据 AGPL-3.0，本项目不提供任何明示或暗示的担保。请详细阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 以了解完整的免责声明内容
  5. **社区参与：** 欢迎社区的参与和贡献，我们鼓励开发者一同改进和维护本项目
  6. **许可证链接：** 请阅读 [GNU Affero General Public License (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 了解更多详情

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=imsyy/SPlayer&type=Date)](https://star-history.com/#imsyy/SPlayer&Date)
