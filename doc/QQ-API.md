# QQ 音乐源接入说明（qq-music-api 部署 + 适配层）

> 日期：2026-09-19 ｜ 分支：`NEWAPI` ｜ 上游：`https://github.com/DelicateDuck582/qq-music-api`（**未改动仓库**）

## 一、结论

| 目标                                                 | 结果                                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 设置 → 网络 → 音乐源新增「QQ 音乐」                  | ✅ 与网易云 / 酷狗三源并存，按源自适应显示设置项                                                                            |
| 整合 QQ 音乐 API（搜索 / 歌词 / 榜单 / 歌单 / 取链） | ✅ `src/api/qq/*`，结果归一化为网易云形状，既有页面零改动复用                                                               |
| 在 Vercel 部署                                       | ✅ 项目 `qq-music-api`，生产别名 `https://qq-music-api-ten-pi.vercel.app`                                                   |
| 分配域名 `qq-api.duckgame-play.top`                  | ⏳ 已在 Vercel 添加，**待你在 Cloudflare 补 CNAME**（见第三节）；未生效前客户端自动兜底到项目域名                           |
| 登录                                                 | ✅ 扫码登录（`/getQQLoginQr` + `/checkQQLoginQr`）+ Cookie 登录（`uin` + `qqmusic_key`），入口与网易云 / 酷狗一致（点头像） |

## 二、Vercel 部署记录（含**上游 Vercel 配置的坑**）

| 项               | 值                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 项目 / projectId | `qq-music-api` / `prj_Sui86ciz5DJ5Rmd1rPnEOgZpI78D`（team `delicateducks-projects`）                                     |
| 生产别名         | `https://qq-music-api-ten-pi.vercel.app`                                                                                 |
| 构建命令         | 仓库自带 `vercel.json`：`npm run vercel-build`（vite + tsc + vitepress 文档），函数入口 `api/index.ts`                   |
| 环境变量         | `QQ_MUSIC_API_CONFIG_DIR=/tmp/qq-music-api-config`（Vercel 仅 `/tmp` 可写，上游会向该目录写配置）、`NODE_ENV=production` |
| 部署保护         | 已确认关闭（`ssoProtection=null`、`passwordProtection=null`）                                                            |

### ⚠️ 上游 Vercel 配置的缺陷与绕过方式（重要）

**现象**：部署成功但任何请求都返回 `500 FUNCTION_INVOCATION_FAILED`。

**根因**（运行时日志）：

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/koaApp'
    imported from /var/task/api/index.js
```

仓库 `"type": "module"` + `api/index.ts` 里 `import app from '../src/koaApp'` 是**无扩展名**相对导入；Vercel 只转译入口、`src/**` 以原始 TS 形式随 `includeFiles` 上传 → Node ESM 无法解析。
（`--experimental-specifier-resolution=node` 在 Node 20+ 已移除，环境变量无解。）

**绕过（不改仓库）**：本地用 esbuild 把入口打成**自包含 ESM**，再以 CLI 部署：

```bash
npm install                                    # 取 esbuild
node -e "require('esbuild').build({entryPoints:['api/index.ts'],bundle:true,platform:'node',format:'esm',target:'node22',banner:{js:'import { createRequire as __cr } from \"node:module\"; var require = __cr(import.meta.url);'},outfile:'api/index.js',logLevel:'warning'})"
# 用打包结果覆盖 api/index.ts 后
npx vercel deploy --prod --yes --scope delicateducks-projects
```

> `banner` 注入 `require` 是必须的，否则 CJS 依赖在 ESM 下会抛 `Dynamic require of "tty" is not supported`。
> 该部署产物是本地打包结果，**Git 自动部署会再次失败**；长期稳定建议向 API 仓库提上游修复（在 `vercel-build` 用 esbuild/tsup 产出 `api/index.js`）。本地克隆已还原为仓库原状（`git status` 干净）。

## 三、需要补的 DNS 记录

`duckgame-play.top` 的 DNS 在 **Cloudflare**。Vercel 该域名要求的记录：

| 类型          | 主机记录 | 记录值                                | 说明                                         |
| ------------- | -------- | ------------------------------------- | -------------------------------------------- |
| CNAME（推荐） | `qq-api` | `4522aa65c2f2ad85.vercel-dns-017.com` | Cloudflare 保持 **DNS only**（不要开小云朵） |
| 或 A（两条）  | `qq-api` | `64.29.17.1`、`216.198.79.1`          | 两条都要加                                   |

验证：`Resolve-DnsName qq-api.duckgame-play.top` 应返回上述 CNAME。

## 四、SPlayer 侧改动

| 文件                                                        | 说明                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/qq/core.ts`                                        | 纯逻辑：类型、错误码翻译、合成 ID（`songmid` → 52 bit）、注册表、QQ → 网易云形状映射、Cookie 会话解析、扫码状态                              |
| `src/api/qq/index.ts`                                       | 独立 axios 客户端：**Cookie 走 `X-Custom-Cookie` 请求头**（不进 URL/日志）、参数走 query、备用地址兜底、约 25 个端点 + 兼容层                |
| `src/utils/qqAuth.ts`                                       | Cookie 解析/规范化、`isQqLogin`、`loginQqByCookie`、`checkQqQrLogin`、`saveQqSession`（先校验后保存、失败回滚）、`refreshQqUser`、`qqLogout` |
| `src/components/Modal/QqLogin.vue` + `modal.ts#openQqLogin` | 登录弹窗（扫码 / Cookie 两 Tab，扫码 2.5s 轮询）                                                                                             |
| `src/api/search.ts` / `src/api/song.ts`                     | 按源（搜索）与注册表命中（取链 / 歌词 / 详情）路由                                                                                           |
| `src/stores/setting.ts`                                     | `musicSource` 增加 `"qq"`；新增 `qqApiBase` / `qqCookie` / `qqUser`                                                                          |
| `src/components/Setting/config/network.ts`                  | 音乐源分组新增 QQ 项（API 地址 / Cookie / 登录 / 退出 / 测试连接），按源显示                                                                 |
| `src/components/Layout/User.vue`                            | 用户区按源展示：QQ 头像 / 昵称 / VIP / 源标记；点头像登录、退出登录按源分流                                                                  |
| `scripts/test-qq-adapter.mts` + `pnpm test:qq`              | 回归测试（纯逻辑 + 线上联调）                                                                                                                |

**关键设计**

1. **合成 ID**：`SongType.id` 是 `number`，QQ 用 14 位 `songmid`；按 36 进制散列压缩到安全整数作为合成 ID，注册表保留 `songmid / mediaMid / 专辑 mid / 歌手 / 封面 / 时长`，取链与歌词经注册表反查。
2. **Cookie 走请求头**：上游支持 `X-Custom-Cookie`（自定义头，非浏览器禁头），凭据不进 URL、历史与访问日志——比查询参数更安全。
3. **先校验后保存**：任何登录方式都先暂存 → `/user/getUserDetail` 校验 → 成功才落库，失败回滚。

## 五、能力矩阵（2026-09-19 实测）

| 能力                                 | 端点                                                             | 匿名可用 | 备注                                                         |
| ------------------------------------ | ---------------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| 热搜                                 | `/getHotkey`                                                     | ✅       | 已接入搜索页                                                 |
| 搜索（单曲 / 歌手 / 专辑 / 歌单）    | `/getSearchByKey`                                                | ✅       | 结果在 `song.list`；歌手名搜索会走 `zhida` 直达              |
| 歌词                                 | `/getLyric?isFormat=true`                                        | ✅       | 返回 LRC，已接播放页                                         |
| 歌单广场 / 歌单详情                  | `/getSongLists`、`/getSongListDetail`                            | ✅       | 详情结构随上游变化，映射做多路兼容                           |
| 歌手热门 / 新碟 / 榜单               | `/getSingerHotsong`、`/getNewDisks`、`/getTopLists`、`/getRanks` | ✅       | 榜单歌曲不含 `songmid`，仅展示不可直接播放                   |
| 扫码登录                             | `/getQQLoginQr`、`/checkQQLoginQr`                               | ✅       | key 接口直接返回二维码 base64 + `qrsig`                      |
| **播放直链**                         | `/getMusicPlay`                                                  | ❌       | 需登录态（上游提示：请通过 cookie / `X-Custom-Cookie` 传递） |
| 用户数据（详情 / 歌单 / 喜欢 / VIP） | `/user/*`                                                        | ❌       | 未登录返回 400 `缺少 uin 参数`                               |

## 六、审计（安全 / 代码 / 逻辑 / 性能）

### 6.1 安全

| 检查项     | 结论                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| 凭据落点   | QQ Cookie 仅 localStorage + **`X-Custom-Cookie` 请求头**；无 `?cookie=` 形式，不进 URL / 历史 / 服务端访问日志 |
| 凭据串源   | QQ 与酷狗各自独立 axios 实例；网易云 `MUSIC_U` / realIP / 代理参数不会发给 QQ API                              |
| 跨源凭据   | `withCredentials:false`（上游返回 `Access-Control-Allow-Origin: *`）                                           |
| 会话白名单 | `mergeQqCookieText` 只保留 `uin / qqmusic_key / qm_keyst / euin`，**丢弃**粘贴 Cookie 中的其它字段             |
| 注入面     | 请求路径为代码常量、参数受类型约束；映射层只做字段转换，不生成 HTML                                            |
| 错误信息   | 统一经 `qqErrorText()` 翻译，不回显上游原始正文                                                                |
| 部署侧     | 关闭部署保护（公开 API）；配置写入指向 `/tmp`，不落仓库                                                        |

### 6.2 代码与逻辑漏洞修复记录

| 问题                                                                      | 处理                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 上游 Vercel 入口 ESM 无扩展名导入 → 全站 500                              | 本地 esbuild 打包（含 `require` banner）+ CLI 部署绕过（第二节）                                                |
| 上游写配置到只读目录 → 写盘即崩                                           | 项目环境变量 `QQ_MUSIC_API_CONFIG_DIR=/tmp/...`                                                                 |
| QQ 响应 `code` 语义混乱（`0` 成功 / `500001` 参数错 / 部分接口无 `code`） | `qqErrorText()` 多路判定；搜索映射仅在「无结果 + 有错误码」时附提示，避免误报                                   |
| 扫码状态码口径不一（0/1/2/4/65）                                          | `qqQrStatus(Text)` 统一；**以会话能否解析出 `uin` + `key` 作为最终成功判据**，避免上游把「已完成」也报 0 时漏登 |
| 登录失败污染本地状态                                                      | `saveQqSession()` 失败回滚 Cookie 与用户信息                                                                    |
| 榜单歌曲无 `songmid`                                                      | 明确标注「展示用」，不注册合成 ID，避免点击播放报错                                                             |
| 域名未生效导致整源不可用                                                  | `qqApi()` 网络层失败时自动重试备用地址并提示；扫码失败给出可操作提示                                            |

### 6.3 性能

| 项         | 结论                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| 首屏       | 适配层按需加载（切到 QQ 源或命中注册表才执行）；登录弹窗独立懒加载 chunk       |
| 请求数     | 搜索 1 次；歌词 1 次；歌曲详情 0 次（内存注册表）；扫码轮询 2.5s 一次          |
| 缓存与重试 | 未附加时间戳，可吃上游缓存；QQ 实例不套 axios-retry，避免对 4xx / 风控重试放大 |
| 超时       | 统一 15s（测试接口 10s）                                                       |

## 七、验证

```bash
pnpm test:qq             # 32/32（纯逻辑 24 项 + 线上联调 8 项；离线时线上部分自动 SKIP）
pnpm typecheck:web       # EXIT=0
pnpm security:selfcheck  # 43/43
```

线上实测（`QQ_API_BASE=https://qq-music-api-ten-pi.vercel.app node --import tsx scripts/test-qq-adapter.mts`）：热搜 / 搜索 / 歌词 / 歌单广场 / 榜单 / 扫码二维码全部 200 且映射正确；取链因匿名返回可读的登录态提示 ✓。

## 八、已知限制与后续

1. **播放直链需登录**（`uin` + `qqmusic_key`）：设置 → 网络 → 音乐源 → QQ 音乐 Cookie，或点头像扫码登录。
2. 未接入：MV / 评论 / 数字专辑 / 每日推荐（端点已封装备用）。
3. 榜单 / 新碟等浏览数据暂无独立页面入口，可作为下一步接入 Discover 页面。
4. 域名 DNS 生效前，可直接在「QQ 音乐 API 地址」填 `https://qq-music-api-ten-pi.vercel.app`。
5. **上游 `getSearchByKey` 偶发限流**：实测该接口会对数据中心 IP 返回 `HTTP 500 {"error":"服务器内部错误"}`，而 `/getHotkey`、`/getSongLists`、`/getNewDisks` 等仍正常。
   客户端已做兜底：**仅对 5xx 单次重试（400ms 退避）**、失败时不让调用方拿到未捕获异常（返回空结果 + 原因），并每 60s 最多提示一次「QQ 音乐搜索暂不可用，可稍后重试或切换音乐源」。
   回归测试也据此区分「上游限流（SKIP）」与「映射错误（FAIL）」，避免误报。
