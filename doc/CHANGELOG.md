# 详细更新日志

> 仓库根目录的 [README](../README.md) 只保留**摘要**；本文件记录每次变更的背景、实现要点、影响范围与验证方式。
>
> 排序：**最新在前**。每条带稳定锚点（`<a id="…">`），便于 README 与其它文档直接链接。
>
> 审计的**问题清单、证据与待办**见 [AUDIT.md](./AUDIT.md)。

## 目录

- [2026-09-19 网易云 API 能力补齐（第二批）+ 审计修复](#v2026-09-19-newapi2)
- [2026-09-19 网易云 API 能力补齐（NEWAPI）](#v2026-09-19-newapi)
- [2026-09-18 API 源运行时切换（多 API 并存）](#v2026-09-18-api-switch)
- [2026-09-18 移动端第三轮：歌单头部按钮重叠与横屏列表滑不动](#v2026-09-18-mobile-header)
- [2026-09-13 移动端适配修复](#v2026-09-13-mobile)
- [2026-09-13 自建 / 隐私歌单打不开（401）修复](#v2026-09-13-playlist)
- [2026-09-13 审计落地：凭据链路、响应头缓存与分包](#v2026-09-13-audit)
- [2026-09-12 我的云盘支持上传](#v2026-09-12-cloud)
- [2026-09-12 播放 / 下载容错（API 服务不改动）](#v2026-09-12-playback)
- [2026-09-12 登录凭据改走请求头（安全加固）](#v2026-09-12-cookieheader)
- [2026-09-12 安全加固补充（第二轮审计项全部落地）](#v2026-09-12-audit2)
- [2026-09-12 安全加固与性能优化（第一轮审计）](#v2026-09-12-audit1)
- [2026-09-12 网页端歌曲下载](#v2026-09-12-download)
- [2026-08-19 适配新版网易云音乐 API](#v2026-08-19-api)

<a id="v2026-09-19-newapi2"></a>

## 2026-09-19 网易云 API 能力补齐（第二批）+ 性能 / 安全审计修复

**背景**：第一批已接入 7 个页面（曲风 / MV / 日历 / 听歌足迹 / 消息 / 用户 / 会员）；本批继续接入「视频广场 / 数字专辑 / 电台榜单 / 最近播放分类」，并对本分支新增代码做性能与安全审计、修复所发现问题。

**新增接入**

- `src/views/VideoSquare.vue` 视频广场：`/video/group/list`（实测 107 个标签）+ `/video/timeline/recommend`（推荐）+ `/video/timeline/all?tagId`（标签时间线，支持加载更多）；点击卡片在**弹窗内播放**（`/video/detail` + `/video/url`）
  > 上游视频 `vid` 是 32 位十六进制字符串，既有 `Video.vue` 走 `Number(id)` 取参无法复用，因此自建播放弹窗而非跳转旧页面
- `src/views/DigitalAlbum.vue` 数字专辑：`/album/list`（新碟上架）、`/album/list/style`（语种风格馆）、`/album/new`（全部新碟）、`/digitalAlbum/purchased`（已购，需登录）；点击进入既有专辑页
- `src/views/RadioBoard.vue` 电台榜单：`/dj/hot`（热门电台）、`/dj/recommend`（推荐电台）、`/dj/program/toplist`（节目榜，含排名与评分）、`/dj/paygift`（付费精品）；点击进入既有电台页
- `src/views/History.vue` 扩展为多 Tab：本地最近播放 + 云端 `/record/recent/{playlist,album,video,voice,dj}`（**按需加载**，切到该 Tab 才请求）
- `src/api/netease/index.ts`：新增电台榜单 / 数字专辑 / 语种风格馆等封装（`djHot`、`djRecommend`、`djProgramToplist`、`djProgramToplistHours`、`djPaygift`、`djTodayPerfered`、`djDetail`、`djProgram`、`djProgramDetail`、`albumListStyle`、`albumSongsaleboard`）
- 路由与侧边栏：新增「视频广场 / 电台榜单 / 数字专辑」入口

**刻意未接入（附依据）**

| 能力 | 未接入原因 |
| --- | --- |
| 听歌识曲 `/audio/match` | 需要音频指纹；上游 demo 依赖第三方 `mos9527/ncm-afp`（`afp.js` 57KB + `afp.wasm` 301KB，许可未明确）→ 不把来源不明的二进制纳入仓库 |
| 播客声音 `/voicelist/*`、`/voice/*` | 实测匿名请求返回空（`total=0` / `code=400`），无法验证；接口已封装，待有权限时接入 |
| 音乐人中心 `/musician/*` | 实测未登录 / 非音乐人返回 `400` / `301`，无法验证 |
| 一起听、Mlog、楼层评论、歌单导入、数字专辑购买链路 | 需要实时房间或额外交互链路，单独评估 |

**审计与修复**（完整证据见 [doc/AUDIT.md](./AUDIT.md) 的 2026-09-19 增量章节）

- 安全
  - **N-S1** 私信内容原本经 URL 查询参数发送（会进入服务端访问日志与浏览器历史）→ 改为 POST body（`/send/text|song|playlist`）
  - **N-S2** 播放地址未校验协议 → 统一 `toSafeUrl()`（`http` → `https` 升级 + 仅接受 http(s)）
  - **N-S3** 会员中心写操作（每日签到 / 云贝签到 / 领成长值 / 完成任务）缺少登录态即时校验 → 统一 `requireLogin()` 前置（登录态中途失效会给出提示并拉起登录）
  - **N-S4**（结论）新增页面无 `v-html`、无动态脚本注入、不引入第三方二进制 → 通过
- 性能
  - **N-P1** 浏览类接口默认附带 `timestamp`，会让每次请求都成为「新 URL」而穿透 API 服务 2 分钟缓存 → 新增 `neteaseBrowse()` 并用于曲风 / 相似内容 / MV / 视频 / 电台 / 专辑 / 播客等只读接口
  - **N-P2** 曲风页来回切换会重复请求同一曲风的 4 个接口 → 增加按 `tagId` 的内存缓存
  - **N-P3** 视频时间线分页可能返回重复条目 → 按 `vid` 去重，列表上限 200 条
  - **N-P4** 377 条端点联合类型对类型检查的影响 → 实测全量 web `vue-tsc` 耗时 8.6s，可忽略
- 观察项（本次未改，已记录）
  - 本地 web dev 模式下存在 3 条既有控制台错误（`window.api` / `window.electron` 未注入）；用**未改动**的对照路由 `/style` 复测，错误数同样为 3 条 → 非本分支引入，建议后续统一守卫

**验证**（本地 dev + 本地 npm 版 API 源 `http://127.0.0.1:3210`）

| 检查项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit`（web） | 通过（8.6s） |
| ESLint（TS；仓库配置不覆盖 `.vue`） | 通过 |
| Prettier | 通过 |
| 端点清单 `--check` | 通过（377 条，幂等） |
| `#/video-square` | 渲染 107 个标签 + 7 张视频卡片（推荐流真实数据） |
| `#/digital-album` | 4 个 Tab，30 张数字专辑（真实名称 / 价格 / 销量） |
| `#/radio-board` | 4 个 Tab，30 个电台（真实主播 / 期数 / 订阅数） |
| `#/history` | 6 个 Tab（歌曲 / 歌单 / 专辑 / 视频 / 声音 / 播客） |
| 控制台错误对照 | 新页面与未改动对照路由均为 3 条既有错误 → 本分支未新增错误 |

**影响范围**：新增 3 个页面与 3 条路由；扩展 `History.vue`；`src/api/netease` 增补封装与 `neteaseBrowse`；未改动既有功能逻辑。

<a id="v2026-09-19-newapi"></a>

## 2026-09-19 网易云 API 能力补齐（NEWAPI 分支）

**背景**：npm 版 `NeteaseCloudMusicApi` 对外提供 **377 个端点**，而 SPlayer 此前只用到其中约 97 个；「每日签到 / 云贝 / 音乐日历 / 听歌足迹 / 曲风 / 消息 / 关注粉丝 / MV / 用户主页」等官方能力一直没有入口。本次在 `NEWAPI` 分支把这些能力补成可用功能，并让新功能**跟随「设置 → 网络 → API 服务」里切换的 API 源**。

**变更**

- `scripts/gen-netease-endpoints.ts`（新增）：从上游包 `module/*.js` 生成端点清单 —— 模块名 → 路径（`_` 换 `/`，含 3 个特殊路由）、首行注释 → 中文说明；上游未写注释的 55 个端点由脚本内置补全表覆盖；支持 `--check` 校验清单是否与上游一致。`package.json` 新增脚本 `gen:netease-endpoints`
- `src/api/netease/endpoints.ts`（自动生成）：377 条端点清单 + `NeteaseEndpointPath` 字面量联合类型
- `src/api/netease/index.ts`（新增，≈470 行）：
  - 通用调用器 `neteaseApi(path, options)` / `neteaseApiByName(name, options)` —— 路径受联合类型约束，**任一官方端点都可直接调用，拼错路径会在编译期报错**；默认附带 `timestamp`（与既有 api 风格一致，避免命中服务端 2 分钟缓存）
  - 按域具名封装：日历、听歌足迹、曲风（含偏好）、相似内容（歌/歌手/歌单/MV/听歌用户）、会员（VIP 信息/成长值/任务/黑胶时光机）、云贝与签到、消息（私信/评论/@我/通知/最近联系人/发送私信）、用户与社交（资料/歌单/听歌排行/关注/粉丝/动态/云盘）、MV 与视频、听歌识曲、最近播放（歌曲/视频/声音/歌单/专辑/播客）、数字专辑、播客声音
- `src/types/netease.ts`（新增）：新功能的响应类型（只声明实际渲染字段，字段名不一致处做兼容）
- 新页面（7 个，均支持移动端栅格）：
  - `src/views/Calendar.vue` 音乐日历（按月查询、按天分组、播放本日；上游只回 id 时自动补一次 `/song/detail`）
  - `src/views/ListenData.vue` 听歌足迹（累计/本周/本月/年度时长 + 今日收听）
  - `src/views/Style.vue` 曲风（34 类一级曲风 → 子曲风 → 歌曲/歌单/歌手三 Tab，曲风同步到地址栏）
  - `src/views/Vip.vue` 会员中心（VIP 状态与到期、成长值与领取、云贝与两种签到、会员任务、云贝任务）
  - `src/views/Message.vue` 消息中心（私信会话 + 会话抽屉 + 发送私信、评论/@我/通知三类通知）
  - `src/views/User.vue` 用户主页（资料卡 + 歌单/关注/粉丝/听歌排行 + 关注/取关）
  - `src/views/Mv.vue` MV 广场与详情（无参数=全部 MV 广场，带 `?id=` 即播放页：1080P→720P→480P 逐级回退取链、相似 MV、收藏、评论入口）
- `src/router/routes.ts`：新增 7 条路由（登录相关页 `meta.needLogin`，交由既有守卫处理）
- `src/components/Layout/Menu.vue`：侧边栏新增「曲风 / MV 广场 / 音乐日历 / 听歌足迹 / 消息中心 / 我的主页 / 会员中心」（登录态相关项按 `isLogin()` 显示）

**验证**（本地 dev + 本地 npm 版 API 源 `http://127.0.0.1:3210`，无头浏览器真实页面）

| 检查项 | 结果 |
| --- | --- |
| `vue-tsc --noEmit`（web） | 通过 |
| ESLint（TS 部分；该仓库 ESLint 不覆盖 `.vue`） | 通过 |
| 端点清单 `--check` | 与上游一致（377 个端点，100% 带中文说明） |
| `#/style` | 渲染 28 类一级曲风、342 个曲风标签、曲风歌曲 21 行（真实数据） |
| `#/mv` | 渲染 40 张 MV 卡片（真实名称/歌手） |
| `#/user`（无 `uid` 且未登录） | 正确跳转 `/403` |
| `#/calendar`、`#/listen-data`、`#/vip`、`#/message`（未登录） | 被 `meta.needLogin` 守卫拦截并弹出登录，符合预期 |

**未接入 UI（API 已就绪，可直接用 `neteaseApi` 调用）**：听歌识曲（`/audio/match` 需上游 300KB WASM 指纹算法）、数字专辑购买链路、一起听、播客声音上传、Mlog、音乐人/云豆、楼层评论、歌单导入、视频标签时间线等 —— 见 README 的「网易云 API 能力」表格。

**影响范围**：全部为**新增文件**，另有 `routes.ts`、`Menu.vue`、`package.json`、`src/types/*` 的增量改动；既有功能与默认 API 源均不受影响（新页面复用 `@/utils/request`，因此同样跟随 API 源切换）。

<a id="v2026-09-18-api-switch"></a>

## 2026-09-18 API 源运行时切换（多 API 并存）

**背景**：上游 API 原作者 Binaryify 的 `NeteaseCloudMusicApi` 仍在 npm 上持续更新（api-enhanced 的 README 也提示以 npm 为准），而其 GitHub 仓库已不再更新；同时原有的自建 api-enhanced 仍要继续用。因此需要在**不重新构建 SPlayer** 的前提下随时切换 API 源。

**变更**

- `src/utils/request.ts`：把原先构建期写死的 `baseURL` 拆为 `DEFAULT_API_BASE`（构建时默认：dev 走 Vite 代理、prod 取 `VITE_API_URL`）与 `getApiBase()`（运行时解析，优先取设置里的自定义地址）；请求拦截器按当前源赋值，切换后**立即生效、无需重启或重建**；新增 `normalizeApiBase()`、`rememberApiBase()`（记录最近 5 条）、`testApiBase()`（匿名请求 `/login/status` 探活）
- `src/stores/setting.ts`：新增 `apiBaseUrl`（当前源，留空 = 默认）与 `apiBaseUrlHistory`（快速切换列表），随既有 `persist` 自动持久化
- `src/components/Setting/config/network.ts`：新增「API 服务」分组 —— API 源下拉（默认 + 历史）、自定义 API 地址输入、测试并记录、恢复默认
- 新增配套部署项目 `ncm-api-vercel`（独立目录，**不并入本仓库**）：把 npm 版 `NeteaseCloudMusicApi@^4.32.0` 跑在 Vercel 上。适配层补了官方实现缺失的两处兼容：
  1. **CORS 放行 `X-Netease-Cookie`**：官方只放行 `X-Requested-With,Content-Type`，跨域预检会被浏览器拦下，带登录态的接口全部失败
  2. **`X-Netease-Cookie` → 标准 Cookie 的翻译**：官方只认标准 `Cookie` 头与 `cookie` 查询参数（`X-Netease-Cookie` 是 api-enhanced fork 的扩展）；且需把 SPlayer 的 `MUSIC_U=xxx;os=pc;`（分号后无空格）归一化为 `; ` 分隔，否则官方 `/;\s+/` 解析会把 `;os=pc;` 粘进 token

**验证**（无头浏览器 + 真实页面）

- API 源设为不可用地址 `http://127.0.0.1:9`：实测请求全部打到该地址并失败 → 歌单页 `songCards: 0`、无详情头
- 运行时切到本地 npm 版适配器 `http://127.0.0.1:3210`：请求全部打到新源，`playlist/track/all` 成功、歌单正常渲染（`songCards: 12`）——同时证明跨域（14558 → 3210）与适配层 CORS 修复有效
- 适配层接口实测：`/healthz` 200；`/login/status` 返回真实账号数据；`/banner` 返回真实数据；`OPTIONS` 预检 204 且 `Access-Control-Allow-Headers` 含 `X-Netease-Cookie`；`X-Netease-Cookie: MUSIC_U=_TEST_LEAK_MARKER_;os=pc;` 被正确拆分为 `MUSIC_U` 与 `os`
- `vue-tsc --noEmit` 与 ESLint 均无报错

**影响范围**：`src/utils/request.ts`、`src/stores/setting.ts`、`src/components/Setting/config/network.ts`（其余请求层行为、默认 API 源与 `cloud.ts` 的本机 API 地址均不受影响）

<a id="v2026-09-18-mobile-header"></a>

## 2026-09-18 移动端第三轮：歌单头部按钮重叠与横屏列表滑不动

**现象**（用户反馈 + 无头实测复现）

1. 横向像素 < 420 时，歌单详情的「播放 / 编辑歌单」按钮与简介、创建者/时间**互相叠住**（390px 重叠 5103px²、360px 重叠 9063px²）。
2. **横屏**下歌单里的歌几乎滑不动：头部仍按桌面 240px、列表也预留 240px，主内容高度仅 258px → 虚拟列表只剩 18px，`n-scrollbar` 可视高度 **0px**。
3. 顺带修掉窄屏歌曲行里被压成 **1px** 的歌手名（320px 实测）。

**原因**

- `ListDetail.vue` 的 `.menu`（操作按钮行）是 `bottom: 0` 的绝对定位；窄屏时信息列只剩 159~189px，`n-flex` 默认换行使两个按钮叠成两行，撑高后向上压住 `.collapse`（简介 + 元信息）。
- 头部高度（`.detail`）、列表预留（`.song-list` 的 `padding-top`）、`useListDetail.getSongListHeight` 三处各自硬编码 240/180/120/100，且媒体查询只看宽度 → 横屏（宽 831、高 328）命中的是桌面分支。
- `SongCard` 的 `.desc` 是 `n-flex :wrap="false"`（`flex-wrap` 为内联样式），320px 下标签占满整行，`.artists`（`flex: 1`，basis 为 0）被压到 1px。

**变更**

- `src/style/main.scss`：列表页预留高度统一由 CSS 变量 `--list-header-height` / `--list-header-height-small` 驱动；新增 `≤512px`（210/128）与 `(max-height: 600px) and (orientation: landscape)`（120/96）两档；`≤768px` 的压缩态预留由 100px 修正为 120px（与 `.small` 头部实际高度一致，避免首行歌曲被按钮盖住）。
- `src/components/List/ListDetail.vue`：头部高度改为读取同一变量（未定义时回退旧值）；`≤512px` 改为「信息行 + 独立全宽操作行」（`.data` 取消定位、`.collapse` 随流、`.menu` 横向铺满贴底），按钮不再换行、也不再压住文字；横屏档头部压到 120px 并收起简介。
- `src/composables/List/useListDetail.ts`：新增 `getHeaderHeight()` 与上述变量同步；`isShortViewport` 用 `(max-height: 600px) and (orientation: landscape)` 判定；列表高度加 160px 兜底，横屏下不再出现 0px 可视高度。
- `src/components/Card/SongCard.vue`：`≤512px` 允许 `.desc` 换行并给 `.artists` `min-width: 50%`，歌手名可独占一行。

**影响范围**：`src/style/main.scss`、`src/components/List/ListDetail.vue`、`src/composables/List/useListDetail.ts`、`src/components/Card/SongCard.vue` —— 涵盖歌单 / 专辑 / 电台 / 我喜欢的音乐 / 本地歌单等所有使用 `ListDetail` 的列表页与歌曲行。

**验证**（自建无头体检工具：Electron + iPhone UA + CDP 触屏模拟；本轮新增「详情头几何」「歌曲列表滚动区」「滚动后压缩态」「歌曲行列宽」「CSS 变量与规则命中」探针）

| 视口 | 头部 / 预留 | 按钮行 | 重叠 | 横向溢出 | 滚动区可视高度 |
| --- | --- | --- | --- | --- | --- |
| 390×844 | 210 / 210 | 单行 | 0 | 0 | 462px |
| 360×640 | 210 / 210 | 单行 | 0 | 0 | 258px |
| 320×568 | 210 / 210 | 单行 | 0 | 0 | 186px |
| 844×390（横屏） | 120 / 120 | 单行 | 0 | 0 | **120px**（修复前 0px） |
| 1280×800（桌面） | 240 / 240 | 单行 | 0 | 0 | 388px |

滚动到压缩态后头部与预留仍然一致（390px → 128/128，横屏 → 96/96，桌面 → 120/120）。首页 / 云盘 / 发现 / 我的收藏（390×844、360×640）回归：横向溢出 0、重叠 0、过小热区 0、弹窗不越界。

**说明**：本轮只改渲染层样式与列表高度计算，未触碰 API，未提交 / 未推送。

<a id="v2026-09-13-mobile"></a>

## 2026-09-13 移动端适配修复

**背景**：移动端存在系统性布局缺陷，最严重的是「发现音乐」页大量内容被裁掉、完全看不到（`#main-content` 为 CSS Grid，但隐式列宽按 `max-content` 计算，宽内容会把列撑破视口，随后被 `overflow` 裁剪）。

**变更**

- **弹窗宽度**（`src/style/main.scss`）：naive-ui 弹窗 / 对话框宽度此前由内联样式硬编码（`src/utils/modal.ts` 内 37 处，400–700px），窄屏超出视口 → 统一按视口夹取 `max-width: calc(100vw - 24px)`（桌面端窗口更宽，不受影响）
- **网格轨道可收缩**：`repeat(N, 1fr)` 中的 `1fr` 隐含 `minmax(auto, 1fr)`，会被内容最小宽度顶大 → 8 个文件统一改为 `minmax(0, 1fr)`；`#main-content` 补 `gridTemplateColumns: 'minmax(0, 1fr)'`，`.router-view` 补 `min-width: 0`
- **视口高度**：13 处 `100vh` 在移动浏览器会被地址栏 / 工具栏遮挡（底部播放条被顶出屏幕）→ 新增 `--vh-full`（`100dvh` 优先、`vh` 回退）并全量替换；`body { width: 100vw }` → `100%`（`100vw` 含滚动条宽度，是横向溢出源）
- **安全区**：`index.html` 增加 `viewport-fit=cover`，`#app-layout` 补 `env(safe-area-inset-*)`，避免底部播放条被 Home 指示条遮挡
- **触屏可用性**（`@media (hover: none)` 常显）：侧栏「漫游」按钮（原为 `pointer-events: none` + hover 显示，触屏**完全无法点击**）、账号列表「删除账号」、云盘容量数字（信息被隐藏）、歌单 / 专辑封面「播放按钮」

**影响范围**：`index.html`、`src/style/main.scss`、`src/layout/AppLayout.vue`、`src/utils/style.ts`、`src/components/{Layout,List,Modal,Player,Search,Setting}/*`、`src/views/{Cloud,DesktopLyric,Home}/*`

**验证**：自建无头体检工具（Electron 隐藏窗口 + iPhone UA + `390×844` 视口 + CDP 触屏媒体模拟），对**构建产物**实测手机首页 / 云盘（触发登录弹窗）/ 发现页 / 歌单页 / 桌面首页 —— 横向溢出 0（发现页修复前 288）、过小热区 0、弹窗不越界、控制台仅 `ResizeObserver` 良性告警

**未覆盖**：播放态底部播放条、登录后的云盘上传 UI（需真机或真实登录态复核）

<a id="v2026-09-13-playlist"></a>

## 2026-09-13 自建 / 隐私歌单打不开（401）修复

**现象**：打开自己创建的歌单（`#/playlist?id=…`）报「获取歌单详情失败」并跳回首页；`GET /playlist/detail?id=…&s=0&noCookie=true` 返回 **401**（官方 App 可正常打开同一歌单）

**原因**：`src/api/playlist.ts` 的 `playlistDetail` 传了 `noCookie: true`，而 `src/utils/request.ts` 的请求拦截器一旦看到该参数就会**完全跳过登录凭据** → 自建 / 隐私歌单（`privacy=10`）被以匿名身份查询，网易云必然 401

**变更**

- 移除 `noCookie: true`（登录态经 `X-Netease-Cookie` 请求头携带；未登录时行为不变）
- 连带修复：响应恢复 `privileges` 字段后，`views/List/playlist.vue` 与 `views/List/liked.vue` 依赖它的「一次拉取全量歌曲」快捷路径重新生效
- 未改动其余 `noCookie`：`api/login.ts` 的 5 处（登录流程必须匿名）、`api/song.ts` / `api/other.ts`（`baseURL` 为 `/api/unblock`、`api.github.com`，本就不应携带网易云凭据）

**验证**：线上 API 匿名实测私有歌单 401 / 公开歌单 200；修复后经本机 API 实测请求 URL 已无 `noCookie`，公开歌单页完整渲染（详情 + 全部歌曲 + 评论）且控制台无报错

<a id="v2026-09-13-audit"></a>

## 2026-09-13 审计落地：凭据链路、响应头缓存与分包

**背景**：以生产控制台日志为线索完成安全 / 性能 / 密钥全量审计（问题清单见 [AUDIT.md](./AUDIT.md)），本节记录对应代码改动。

**变更**

- **凭据链路**（`src/utils/request.ts`）：登录凭据一律经 `X-Netease-Cookie` 请求头传递且**仅对网易云 API 生效**，移除 `params.cookie` 回退（此前会进入 URL、服务端 / CDN 访问日志、浏览器历史，且非网易云请求也会被附加凭据）；移除已无意义的「使用请求头传递登录 Cookie」设置项（字段标记 `@deprecated` 以兼容历史持久化）
- **凭据存储**（`src/utils/cookie.ts`）：写入时补 `SameSite=Lax` 与 HTTPS 下的 `Secure`
- **CSP**（`index.html`）：移除 `script-src` 中的裸 `http:`，补 `'wasm-unsafe-eval'` 与 `form-action 'self'`；`'unsafe-eval'` 因 emscripten 版 ffmpeg 与「自定义 JS」功能依赖 `new Function` 而保留
- **响应头与缓存**（`vercel.json`）：新增 `X-Content-Type-Options` / `Referrer-Policy` / `X-Frame-Options` / `Permissions-Policy` / CSP `frame-ancestors`；`/assets`、`/fonts`、`/icons`、`/wasm`、`/images` 改为 `max-age=31536000, immutable`
- **分包**（`electron.vite.config.ts`）：拆分 `vendor-ui` / `vendor-amll` / `vendor-vueuse` / `vendor-utils`，`stores` chunk 由 2.15MB / gzip 623KB 降至 0.70MB / gzip 212KB
- **字体**：`font-display: swap` + `logo.woff2` preload
- **重试策略**（`src/utils/request.ts`）：指数退避 + 仅重试超时 / 5xx / 429，CORS 等确定性失败不再重复放大
- **开发诊断**（`src/components/Modal/Login/Login.vue`）：移除会打印完整登录响应（含 Cookie）的日志
- **配置**（`.env` / `.env.example`）：`.env` 顶部增加「禁止写入密钥」警示并新增模板文件

**配套 fork（api-enhanced）**：新增 `maskSensitiveQuery()` 对访问日志脱敏（`cookie=***`）；不再下发 `Access-Control-Allow-Credentials`；`CORS_ALLOW_ORIGIN` 未配置或为 `*` 时启动告警

**验证**：本地复现确认脱敏生效（标记串不再出现）；生产构建通过；无头渲染实测应用正常渲染且控制台无错误

<a id="v2026-09-12-cloud"></a>

## 2026-09-12 我的云盘支持上传

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

<a id="v2026-09-12-playback"></a>

## 2026-09-12 播放 / 下载容错（API 服务不改动）

- **取链风控自愈**：API 服务出口 IP 被网易云风控时取链会返回 `code: 404 / -110` 且 `url` 为空；本体在**播放**与**下载**取链失败时自动携带 `randomCNIP=true` 重试一次，恢复播放/下载
- **IP 选项优先级**：调用方显式传入的 `realIP` / `randomCNIP` 优先于设置项，便于按需重试（「设置 → 网络 → 使用真实 IP」保留不变）
- **TTML 歌词**：api-enhanced 未提供 `/lyric/ttml`（远端返回 404），`songLyricTTML()` 改为优先 AMLL TTML DB、客户端再回退本机内嵌服务 `/api/netease/lyric/ttml`
- **解锁播放/下载**：NETEASE 解锁源改为优先调用 API 服务的 `/song/url/match`（服务端完成匹配/解锁，**网页端同样可用**），失败再回退自建 `/api/unblock`

<a id="v2026-09-12-cookieheader"></a>

## 2026-09-12 登录凭据改走请求头（安全加固）

- **背景**：此前登录态以查询参数传递（`?cookie=MUSIC_U%3D...`），凭据会进入 URL、API 访问日志、浏览器历史与 Referer
- **客户端改动**（`src/utils/request.ts`）：默认改为经 **`X-Netease-Cookie` 请求头**传递，且**仅对网易云 API 生效**（不会把凭据附加到 Last.fm / GitHub / QQ 音乐等第三方）；当时保留「设置 → 网络 → 使用请求头传递登录 Cookie」开关可回退查询参数
- **服务端配套**（api-enhanced fork）：支持 `X-Netease-Cookie` / `X-SPlayer-Cookie` 请求头，并加入 CORS 允许头；新增预检缓存 `Access-Control-Max-Age: 600`
- **客户端内嵌服务**（`electron/server/netease`）：同步支持该请求头，dev 模式行为一致
- **顺带修复**：`src/utils/cookie.ts` 不再把 Cookie **值**打印到控制台（仅打印名称）
- **后续（2026-09-13）**：为彻底杜绝凭据进入 URL，该设置项已**移除**，「请求头传递」成为唯一路径（历史持久化字段保留但不再生效）；同时 api-enhanced 侧对访问日志做脱敏（`cookie=***`）

<a id="v2026-09-12-audit2"></a>

## 2026-09-12 安全加固补充（第二轮审计项全部落地）

- **登录窗口隔离**（`electron/main/windows/login-window.ts`）：该窗口加载第三方站点（`music.163.com`），改为 `sandbox: true` + `contextIsolation: true` + `nodeIntegration: false`，恢复正常同源策略与内容安全，并**不注入预加载脚本**（不再向第三方页面暴露任何 IPC 能力）
- **内容安全策略（CSP）**：Electron 通过 `session.defaultSession.webRequest.onHeadersReceived` 统一附加 `Content-Security-Policy`（含 `object-src 'none'` / `base-uri 'self'` / `frame-ancestors 'none'`），网页端同时在 `index.html` 内联同策略 meta，两端一致生效
- **本机 API 服务来源校验**（`electron/server/index.ts`）：`/api/*` 请求校验 `Host`（阻断 DNS rebinding）、`Origin`（阻断跨站页面调用）与 `Sec-Fetch-Site: cross-site`；另支持设置环境变量 `SPLAYER_API_TOKEN` 后强制携带 `x-splayer-token` 头或 `?token=`（默认关闭，便于与第三方整合）
- **IPC 追加加固**：`set-music-metadata` 仅允许写入音频扩展名、`delete-file` 仅允许删除已存在的普通文件并拒绝系统关键目录、`send-to-main-win` 增加事件名白名单（`playPrev` / `playOrPause` / `playNext`）、`register-protocol` 增加协议白名单（仅 `orpheus`）
- **第三方内容净化**：新增 `src/utils/sanitizeHtml.ts`，更新日志（远程 Markdown → HTML）渲染前按标签/属性白名单净化，链接强制 `noopener`
- **安全自检脚本**：`pnpm security:selfcheck`（零依赖，43 项用例：协议白名单、内网/保留地址拦截、IPv4-mapped IPv6 绕过、文件名与扩展名净化）

<a id="v2026-09-12-audit1"></a>

## 2026-09-12 安全加固与性能优化（第一轮审计）

> 基于两轮审计（下载功能专项审计 + 全量安全审计）落地的代码改动。

- **下载链路加固**（`src/core/resource/DownloadManager.ts`）：下载地址协议白名单（拦截 `data:` / `blob:` / `file:`）、内网与回环地址拦截（修复 `::ffff:` IPv4-mapped IPv6 绕过并补全保留网段）、重定向最终地址复校验、文件名非法字符清理与长度限制、扩展名白名单、单文件 512MB 上限、单任务 10 分钟超时、传输完整性校验、试听片段拦截、仅登录态恢复下载队列
- **主进程纵深防御**：`download-file` 与 `save-file` IPC 均增加协议 / 文件名净化和目标路径越界校验（此前渲染进程传入的 `fileName` 含 `../` 可越出下载目录写文件）
- **导航白名单**（`electron/main/windows/main-window.ts`）：主窗口 `will-navigate` 仅允许应用自身源导航。此前可导航到任意外部站点，叠加该窗口的 `nodeIntegration` 将形成「打开恶意页面即获得本机能力」的 RCE 链路；应用内外链仍通过 `window.open` → 系统浏览器打开，功能不受影响
- **健壮性**：下载任务 / 已完成记录的空值防护（历史或损坏的持久化数据不再导致启动、重试或渲染报错）；已完成记录上限 500 条
- **性能优化**：下载进度上报节流（进度变化 ≥1% 且间隔 ≥200ms 才回写，并预计算体积文案）、Blob 构造前释放分块引用、清空下载列表批量化、移除重复的队列恢复调用

<a id="v2026-09-12-download"></a>

## 2026-09-12 网页端歌曲下载

- **下载入口**：底部播放条（爱心右侧）、全屏播放器 / 字幕模式、平板与移动端全屏、右键菜单、批量操作均新增下载入口；仅在 Cookie 登录（`isLogin() === 1`）时可用
- **下载列表**：顶栏右上角新增「下载列表」抽屉（仿播放队列，登录后显示），含「下载中 / 已完成」分页、实时进度、失败重试、移除与清空
- **网页端实现**：浏览器 `fetch` 流式读取 + 进度回写 + `file-saver` 落盘；Electron 端行为不变（仍由原生下载器写入元数据 / 歌词 / 逐字歌词 / ASS）
- **链接回退**：`/song/download/url/v1` 不可用（常见 `code: -105`）时自动回退 `/song/url/v1` 播放链接，保证网页端可用性
- **权限校验**：本体按 `song.free` + `userData.vipType` 预校验；接口侧 `-110 / -447 / 404` 与「试听片段」统一映射为可读提示（避免把 30s 试听当成完整文件保存）

> [!NOTE]
> 网页端下载需使用 Cookie 登录（扫码 / 手机号），UID 登录不支持下载；文件保存至浏览器默认下载目录，暂不支持指定路径（受浏览器沙箱限制）。

<a id="v2026-08-19-api"></a>

## 2026-08-19 适配新版网易云音乐 API

- **API 地址切换**（`.env` → `VITE_API_URL`）：网页端使用的网易云 API 服务切换为持续维护的新版项目（[api-enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced)），修复网易云接口改版后部分「收藏」无法同步的问题
- **CORS 兼容**（`src/utils/request.ts`）：关闭 `withCredentials`。登录态通过 `params.cookie` 显式传递，浏览器无需跨域自动携带凭证，从而兼容新版 API 返回的 `Access-Control-Allow-Origin: *`，避免请求被 CORS 策略拦截
- **缓存健壮性**（`src/utils/cache.ts`）：`getCacheData` 不再缓存 `null/undefined` 结果，防止接口短暂异常时把空值写入 `sessionStorage` 导致页面持续空白

