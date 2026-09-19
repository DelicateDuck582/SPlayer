# 酷狗音乐源接入说明（KuGou API 部署 + 适配层）

> 日期：2026-09-19
> 分支：`NEWAPI`（SPlayer 仓库 `DelicateDuck582/SPlayer`）
> 上游 API：`https://github.com/DelicateDuck582/KuGouMusicApi`（MakcRe/KuGouMusicApi 的 fork，**本次未改动该仓库**）

## 一、目标与结论

| 目标 | 结果 |
| --- | --- |
| 设置页新增「源」（网易云音乐 / 酷狗音乐） | ✅ 设置 → 网络 → **音乐源** |
| 整合酷狗 API（搜索 / 取链 / 歌词） | ✅ 适配层 `src/api/kugou/*`，按源路由，**归一化为网易云形状**，既有页面零改动复用 |
| 在 Vercel 部署酷狗 API | ✅ 项目 `kugou-api`（team `delicateducks-projects`），生产部署 READY |
| 分配域名 `KuGou-API.duckgame-play.top` | ✅ 已在 Vercel 项目上添加；**DNS CNAME 需在域名商处补一条**（见第三节） |
| 链路 / 安全 / 性能审计 | ✅ 见第六节 |
| 推送 SPlayer `NEWAPI` 分支 | ✅ 见提交记录；API 仓库无任何改动 |

## 二、Vercel 部署记录（实测）

| 项 | 值 |
| --- | --- |
| 项目名 | `kugou-api` |
| projectId | `prj_UerfY5e2SDIxSYq8wowPlXCYIGCi` |
| teamId | `team_hZvd5r6yd3ewX3ess2YwLfED`（delicateducks-projects） |
| 生产部署（本次） | `https://kugou-9kwtu5lvo-delicateducks-projects.vercel.app`（Ready in 13s） |
| 项目主域名 | `kugou-api-eight.vercel.app` |
| 自定义域 | `kugou-api.duckgame-play.top`（已添加，`verified=true`，等待 DNS 记录生效） |
| 源码来源 | Git 连接 `DelicateDuck582/KuGouMusicApi`（main），**未修改仓库任何文件** |
| 构建方式 | 仓库自带 `vercel.json`（`builds: ./index.js → @vercel/node` + `routes: /(.*) → /`），框架预设无需接管 |
| 部署保护 | **已关闭**（`ssoProtection=null`、`passwordProtection=null`）。新项目默认继承 `all_except_custom_domains`，会让 API 直接返回 Vercel 鉴权页，必须关掉才是公开 API |
| 环境变量（新增） | `KUGOU_API_GUID`（uuid v4）、`KUGOU_API_DEV`（10 位大写）、`KUGOU_API_MAC`、`KUGOU_API_WEBGL`（固定设备指纹） |
| 端口/平台变量 | 未设置 `platform`（默认手机版）；如需概念版可加 `platform=lite` |

> 说明：`KUGOU_API_PROXY` 可让酷狗 API 的出站请求走 HTTP 代理；Vercel 环境下**只有能公网访问的代理**才有意义（本机 `127.0.0.1:10808` 这类不行）。

## 三、需要手动补的 DNS 记录（唯一一步）

`duckgame-play.top` 的 DNS 托管在 **Cloudflare**（NS：`chan.ns.cloudflare.com` / `tadeo.ns.cloudflare.com`）。
Vercel 侧该域名的配置为 `configuredBy: CNAME`，**官方推荐记录**（来自 Vercel API `recommendedCNAME` / `recommendedIPv4`）为：

| 类型 | 主机记录 | 记录值 | 说明 |
| --- | --- | --- | --- |
| **CNAME（推荐）** | `kugou-api` | `2c31bb9d9db3037d.vercel-dns-017.com` | Cloudflare 里保持 **DNS only**（不要开小云朵代理） |
| 或 A（两条） | `kugou-api` | `64.29.17.1`、`216.198.79.1` | 两条都要加 |

**排障**：浏览器报 `Failed to load resource: net::ERR_CONNECTION_CLOSED`（而不是 `ERR_NAME_NOT_RESOLVED`）通常意味着**记录指到了已失效的旧 IP**（典型是 `76.76.21.21`，Vercel 已停用该地址）。
请到 Cloudflare 删除 `kugou-api` 下冲突的 A/AAAA 记录后再按上表添加。验证方式：

```powershell
Resolve-DnsName kugou-api.duckgame-play.top   # 应看到 CNAME → 2c31bb9d9db3037d.vercel-dns-017.com 及其 A 记录
```

添加成功前，播放器端**仍可用**：客户端在「主地址网络层失败」时会自动兜底到 Vercel 项目域名 `https://kugou-api-eight.vercel.app`（`KUGOU_API_FALLBACK_BASE`，可用 `VITE_KUGOU_API_FALLBACK_URL` 覆盖），并提示一次「已临时使用备用地址」；也可在「设置 → 网络 → 音乐源 → 酷狗 API 服务地址」手动填该地址。

（若 DNS 服务商是 Cloudflare，请保持 **DNS only**，不要开小云朵代理。）

## 四、SPlayer 侧改动

### 4.1 文件与职责

| 文件 | 说明 |
| --- | --- |
| `src/api/kugou/core.ts` | **纯逻辑**：类型、错误码翻译、合成 ID 注册表、酷狗 → 网易云形状映射（无 pinia / axios / DOM 依赖，可被 Node 直接测试） |
| `src/api/kugou/index.ts` | **网络与设置**：独立 axios 实例、运行时 API 地址、Cookie 传递（请求体）、约 20 个端点封装、兼容层编排 |
| `src/api/search.ts` | 按音乐源路由：`searchResult` / `searchHot` / `searchDefault` / `searchSuggest` |
| `src/api/song.ts` | 按「注册表命中」路由：`songUrl`（取链）/ `songLyric`（歌词）/ `songDetail`（详情） |
| `src/stores/setting.ts` | 新增 `musicSource` / `kugouApiBase` / `kugouCookie`（持久化到 localStorage） |
| `src/components/Setting/config/network.ts` | 新增设置分组「音乐源」：源选择、酷狗 API 地址、酷狗 Cookie、测试连接 |
| `scripts/test-kugou-adapter.mts` + `pnpm test:kugou` | 回归测试（纯逻辑 20 项 + 线上联调 9 项） |

### 4.2 三个关键设计

1. **NetEase 兼容层**：酷狗返回结构与网易云差异极大，适配层把结果转成 `cloudsearch` / `/song/url/v1` / `/lyric/new` / `/song/detail` 的字段形状，因此搜索页、播放器、歌词、下载等**既有消费方完全不用改**。
2. **合成 ID**：酷狗歌曲以 32 位 `hash` 标识，而 `SongType.id` 是 `number`。适配层取 `hash` 前 13 位十六进制（52 bit，仍在安全整数内）作为合成 ID，并写入内存注册表（`hash / album_id / album_audio_id / 歌名 / 歌手 / 封面 / 时长`）。取链、歌词、详情通过注册表反查 —— **确定性、跨会话可复现、无需持久化**。
3. **凭据不进 URL**：KuGouMusicApi 的 `server.js` 会合并 `[req.query, req.body]` 并解析其中的 `cookie`，因此所有请求统一用 **POST + 请求体**：既避免登录凭据出现在 URL / 浏览器历史 / 访问日志，也顺带解决了 GET 传参时酷狗返回 152 的问题（实测）。

### 4.3 设置项

| 设置 | 键 | 默认 | 说明 |
| --- | --- | --- | --- |
| 音乐源 | `musicSource` | `netease` | `netease`（网易云，默认）/ `kugou`（酷狗） |
| 网易云 API 源 / 自定义地址 / 测试 / 恢复默认 | `apiBaseUrl` 等 | — | **仅「网易云音乐」源显示**（原「API 服务」分组已并入本分组） |
| 酷狗 API 服务地址 | `kugouApiBase` | 空（回退 `VITE_KUGOU_API_URL` 或 `https://kugou-api.duckgame-play.top`） | 可运行时切换，无需重建 |
| 酷狗 Cookie | `kugouCookie` | 空 | `token=xxx; userid=xxx`；Cookie 登录后自动填入，也可手动粘贴 |
| 酷狗账号（登录 / 切换） | — | — | 打开酷狗 Cookie 登录弹窗（与点头像登录等效） |
| 退出酷狗登录 | — | — | 清除本机酷狗 Cookie 与账号信息（不影响网易云登录态） |
| 测试酷狗 API | — | — | 匿名请求 `/search/hot` 验证连通性 |

> 设置项按当前音乐源**自适应显示**：选中「酷狗音乐」时只出现酷狗相关项，选中「网易云音乐」时只出现网易云 API 项，避免同一分组里出现「用不上的开关」。

### 4.4 账号登录（多方式，对齐网易云体验）

登录入口：**左下角用户区头像**（当前音乐源为酷狗时）/「设置 → 网络 → 音乐源 → 酷狗账号」。弹窗内含 4 个 Tab：

| Tab | 端点 | 说明 |
| --- | --- | --- |
| 扫码登录 | `/login/qr/key` → `/login/qr/check` | `key` 接口**直接返回二维码 base64**（`data.qrcode_img`），2s 轮询状态：0 过期 / 1 待扫码 / 2 待确认 / **4 成功（响应体带 `token` + `userid`）**；过期可一键刷新 |
| 验证码登录 | `/captcha/sent` → `/login/cellphone` | 「发送验证码」按钮带 60s 倒计时；手机号做 11 位校验 |
| 账号密码 | `/login` | 酷狗对账密登录有风控，失败时引导改用扫码 / Cookie |
| Cookie 登录 | — | 粘贴 `token` + `userid`（或整段 Cookie）后调用 `/user/detail` 校验 |

- **刷新登录**：底部「刷新登录」按钮 → `/login/token`（用现有 `token`/`userid` 换新令牌并写回 Cookie）；**启动时若距上次登录超过 3 天会自动刷新一次**（与网易云的 `refreshLoginData` 行为一致）。
- **登录态实现**：`src/utils/kugouAuth.ts` —— `parseKugouCookie` / `normalizeKugouCookie` / `isKugouLogin` / `loginKugouByCookie` / `sendKugouCaptcha` / `loginKugouByCellphone` / `loginKugouByAccount` / `checkKugouQrLogin` / `saveKugouSession` / `refreshKugouLogin` / `refreshKugouLoginIfNeeded` / `kugouLogout`。
- **先校验后保存**：任何登录方式都先本地暂存 → 调 `/user/detail` 校验 → 成功才写入 `settingStore.kugouCookie` + `kugouUser`，失败**回滚**。
- **浏览器可取凭据的原因**：上游模块会把解密后的 `secu_params`（含 `token`/`userid`）合并进**响应体**，因此不依赖 JS 不可读的 `Set-Cookie`。
- **用户信息**：昵称 / 头像 / VIP / 等级（`kugouUserToProfile` 兼容多种字段命名）；`lastLoginTime` 单独存放于 `kugouLastLoginTime`，与网易云的 `lastLoginTime` 互不干扰。
- **安全**：Cookie 只存 localStorage，且只在**请求体**中发送；退出登录会同时清空 Cookie、用户信息与登录时间。

### 4.5 与网易云登录的关系

| 维度 | 网易云 | 酷狗 |
| --- | --- | --- |
| 登录方式 | 扫码 / 验证码 / UID / Cookie | 扫码 / 验证码 / 账号密码 / Cookie |
| 凭据存放 | `MUSIC_U` 等 Cookie（`utils/cookie.ts`） | `settingStore.kugouCookie`（仅请求体发送） |
| 刷新登录 | `refreshLogin` + `lastLoginTime`（3 天） | `/login/token` + `kugouLastLoginTime`（3 天） |
| 用户信息 | `dataStore.userData` | `settingStore.kugouUser` |
| 互影响 | 无 —— 切换音乐源时用户区自动展示对应账号 | 无 |

## 五、能力矩阵（2026-09-19 实测）

| 能力 | 端点 | 匿名（无 Cookie） | 备注 |
| --- | --- | --- | --- |
| 歌曲搜索 | `/search` type=song | ✅ 可用（POST 传参） | 实测返回 28 条；**用 GET query 传参会返回 152 Parameter Error** |
| 歌手 / 专辑 / 歌单搜索 | `/search` type=author/album/special | ✅ 可用 | 已接入搜索页对应 Tab |
| 热搜 / 默认关键词 | `/search/hot`、`/search/default` | ✅ 可用 | 已接入搜索页 |
| 排行榜列表 | `/rank/list`、`/rank/info` | ✅ 可用 | 已封装（`kugouRankList` / `kugouRankInfo`） |
| 新歌速递 | `/top/song` | ✅ 可用 | 已封装（`kugouTopSongs`） |
| 歌单广场 | `/top/playlist` | ✅ 可用 | 已封装（`kugouTopPlaylists`） |
| 歌手单曲 / 专辑歌曲 | `/artist/audios`、`/album/songs` | 未实测（大概率需登录态） | 已封装备用 |
| 取播放地址 | `/song/url` | ❌ `20028 本次请求需要验证` | 需酷狗登录 Cookie；数据中心 IP 仍可能被风控 |
| 歌词 | `/search/lyric` + `/lyric` | ❌ 受限 | 同上；两步流程已实现 |
| 歌单详情 / 歌单歌曲 | `/playlist/detail`、`/playlist/track/all` | ❌ `20028 / 20010` | 同上 |
| 扫码登录（取 key / 查状态） | `/login/qr/key`、`/login/qr/check` | ✅ 可用 | 实测：key 接口**直接返回二维码 base64**；未扫码时状态 = 1；状态 4 时响应体带 `token` + `userid` |
| 刷新登录 | `/login/token` | ⚠️ 需登录态 | 未登录返回 `20017`（已翻译为可读提示） |
| 发送手机验证码 | `/captcha/sent` | ⚠️ 需合法手机号 | 非法手机号返回错误码且不抛异常；短信由酷狗下发 |
| 手机验证码 / 账号密码登录 | `/login/cellphone`、`/login` | ⚠️ 可能触发风控验证 | 风控验证端点 `/verify/user/info` 已封装备用 |

**结论**：匿名状态下「搜索（歌曲/歌手/专辑/歌单）+ 榜单 / 新歌 / 歌单广场浏览」可用；**播放取链与歌词需要酷狗登录 Cookie**（`token` / `userid`）。这是酷狗云端风控，与部署方式无关（已在 Vercel 数据中心 IP 上复现）。

## 六、审计

### 6.1 链路审计

```
浏览器/桌面端
  └─ src/api/search.ts · src/api/song.ts      ← 按「音乐源」/「注册表命中」分流
       └─ src/api/kugou/index.ts              ← 独立 axios 实例（withCredentials:false，15s 超时）
            └─ POST {baseURL}/{endpoint}      ← 参数 + cookie 全在请求体
                 └─ kugou-api.duckgame-play.top（Vercel / @vercel/node，上游自带 2 分钟响应缓存）
                      └─ 酷狗官方接口（服务端签名，设备指纹由 Vercel 环境变量固定）
```

- 网易云链路**完全未受影响**：网易云的 cookie / realIP / 代理参数只在 `@/utils/request` 的实例上注入，酷狗走独立实例，互不串味。
- 播放链路：`SongManager` → `songUrl(id)` → 注册表命中 → 酷狗取链；未命中则保持原网易云逻辑。
- 歌词链路：`LyricManager` → `songLyric(id)` → 注册表命中 → 酷狗「歌词搜索 → 下载」两步；逐字歌词（YRC）留空（酷狗 KRC 与 YRC 不兼容），按普通 LRC 渲染。

### 6.2 安全审计

| 检查项 | 结论 |
| --- | --- |
| 凭据泄漏 | 酷狗 Cookie 只存 localStorage，且**只放在 POST 请求体**，不进 URL / Referer / 访问日志；未填写时请求体完全不含 cookie 字段 |
| 跨源凭据 | 酷狗实例 `withCredentials:false`（酷狗 API 返回 `Access-Control-Allow-Origin: *`，开启会被浏览器按 CORS 规范拦截） |
| 网易云凭据外泄 | 未复用 `@/utils/request`，`MUSIC_U` / `realIP` / 代理参数不会发给酷狗 API |
| XSS / HTML 注入 | 适配层只做字段映射与数字/字符串转换，**不产生 HTML**；封面 URL 只做 `{size}` 占位符替换 |
| 错误信息 | 错误码统一经 `kugouErrorText()` 翻译为固定中文提示，不直接回显上游正文 |
| 注入面 / SSRF | 客户端只传受限参数（keywords/type/page/pagesize/id/quality），**路径为代码内写死的常量**，无用户可控路径拼接 |
| 部署保护 | 项目已关闭 `ssoProtection`/`passwordProtection`（公开 API）；历史已构建的 `*.vercel.app` 部署 URL 仍可直连（Vercel 部署不可变，属已知限制） |
| 密钥扫描 | 新增代码无任何密钥/令牌硬编码；设备指纹以环境变量形式存在于 Vercel，仓库内无值 |

### 6.3 性能审计

| 项 | 结论 |
| --- | --- |
| 首屏体积 | 适配层按需加载（仅在切到酷狗源或命中注册表时执行），**不进首屏关键路径**；`pnpm typecheck:web` 与构建均通过 |
| 服务端缓存 | KuGouMusicApi 内置 `apicache`（默认 2 分钟），浏览类接口可吃缓存；客户端未附加 `timestamp` 参数，避免穿透缓存 |
| 客户端请求数 | 搜索一次 = 1 个请求（酷狗 API 侧聚合）；歌词 2 个请求（搜索候选 + 下载）；歌曲详情 0 请求（走内存注册表） |
| 超时与重试 | 酷狗实例 15s 超时；**未套用**网易云的 axios-retry，避免对被风控接口做无效重试放大 |
| 体积影响 | 新增模块仅在引用处打入相应 chunk；无新增依赖（复用既有 axios / pinia） |

## 七、验证命令与结果

```bash
pnpm test:kugou           # 29/29（20 项纯逻辑 + 9 项线上联调；离线时线上部分自动 SKIP）
pnpm typecheck:web        # EXIT=0
pnpm security:selfcheck   # 43/43
pnpm security:secret-scan # 0 命中
```

线上联调（`KUGOU_API_BASE=https://kugou-9kwtu5lvo-delicateducks-projects.vercel.app node --import tsx scripts/test-kugou-adapter.mts`）：

```
✅ CORS 头为 *                       ✅ 热搜可用（匿名）
✅ 新歌速递可用并映射为网易云歌曲      ✅ 新歌速递歌曲已注册（可反查取链）
✅ 排行榜列表可用                     ✅ 歌单广场可用并映射
✅ 歌手搜索可用（匿名）                ✅ 歌曲搜索：有结果或给出可读提示（实测 28 条）
ℹ️ 取链 http=200 err=20028 url=无（无 Cookie 时预期被风控）
```

## 八、已知限制与后续建议

1. **播放取链 / 歌词需要酷狗登录 Cookie**（`token` + `userid`）：在「设置 → 网络 → 音乐源 → 酷狗 Cookie」填入即可（浏览器登录酷狗后从 DevTools → Application → Cookies 复制）。
2. 若填了 Cookie 仍返回 20028，说明 Vercel 出口 IP 被酷狗风控，可考虑：
   - 在 Vercel 项目加 `KUGOU_API_PROXY=<公网 HTTP 代理>` 让服务端出站走代理；
   - 或把 API 部署到能访问酷狗的机器，并在设置里改「酷狗 API 服务地址」。
3. 分页：`hasMore` 依据 `total` 与当前页长度计算；酷狗部分接口 `total` 可能不精确，极端情况下会「提前没有更多」。
4. 未接入的能力：MV / 视频、评论、电台、每日推荐（需登录态）—— 端点已封装，可在后续页面按需调用。
5. 登录方式可用性：**扫码登录**对数据中心 IP 也稳定可用（推荐）；**手机验证码 / 账号密码登录**可能被酷狗风控拦截（返回 `152` / `20010`，或要求在 `/verify/user/info` 完成短信/图形验证），此时建议改用扫码或 Cookie 登录。
5. 酷狗「榜单 / 新歌速递 / 歌单广场」已封装但暂无独立页面入口，可作为下一步（接入现有 Discover 或新增「酷狗」浏览页）。
6. 历史遗留：本项目曾用 `feat/api-enhanced` 分支部署自定义域；切到 `NEWAPI` 后自定义域才是新版本。


