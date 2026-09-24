# 首页推荐：按音乐源个性化（专属歌单 / 每日推荐 / 新碟 / 歌手）

> 日期：2026-09-25 ｜ 分支：`NEWAPI`

## 一、为什么以前像「默认推荐」

1. **缓存不分源与登录态**：`HomeOnline.vue` 用 `getCacheData` 缓存推荐结果，键名固定（`playlistRec` / `radarRec` / `artistRec` / `videoRec` / `radioRec` / `albumRec`，10~30 分钟，sessionStorage）。
   切到其它音乐源或刚登录时，旧结果（往往是匿名 / 上一源的）仍会被命中 —— 看起来就是「通用默认推荐」。
2. **个性化区域只认网易云登录**：整块由 `isLogin()`（网易云）把关，切到酷狗 / QQ 后个性化区域直接消失。
3. 网易云侧的「专属歌单」(`/personalized`) 与「私人雷达」(`idMeta.radarPlaylist`) 本身是**登录后个性化**的：
   登录态经 `X-Netease-Cookie` 请求头发往 `VITE_API_URL`（当前为 `https://music-api2.duckgame-play.top`，api-enhanced）✓，
   因此只要登录正常、缓存不吃旧值，就会按你的听歌习惯返回。

## 二、现在的取数矩阵（`src/api/recommend.ts`）

| 首页区块                   | 网易云音乐                                                      | 酷狗音乐                                                                               | QQ 音乐                                                                              |
| -------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **每日推荐（歌曲）**       | `musicStore.dailySongsData`（`/recommend/songs`，登录后个性化） | `/everyday/recommend` → `data.song_list`（登录后按口味）                               | `/getDailyRecommend` → `response.recommend.*`（需登录）                              |
| **专属歌单 / 推荐歌单**    | `/personalized?limit=`（登录后为专属；匿名 20 / 登录 21）       | 登录：`/user/playlist`；匿名：`/top/playlist`（`data.special_list`）                   | 登录：`/user/getUserPlaylists`；匿名：`/getPersonalRecommend` → 兜底 `/getSongLists` |
| **雷达歌单**               | `idMeta.radarPlaylist`（私人雷达，登录后为个性化内容）          | —                                                                                      | —                                                                                    |
| **歌手推荐**               | `/top/artists`                                                  | `/artist/lists` → `data.info[]`（组内 `singer[]` 已展平）                              | `/getSingerList` → `response.singerList.data.{singerlist\|list}`                     |
| **新碟上架**               | `/album/new`                                                    | `/top/album` → `data.{chn,eur,jpn,kor}`（已适配 `imgurl/singername/publishtime` 字段） | `/getNewDisks` → `response.new_album.data.albums`                                    |
| **推荐 MV / 播客**         | `/mv/all`、`/dj/recommend`                                      | —                                                                                      | —                                                                                    |
| **我喜欢的音乐 / 私人 FM** | ✅（仅网易云）                                                  | —                                                                                      | —                                                                                    |

「—」= 该源暂无等价接口：对应区块返回空数组并被首页过滤隐藏，**不再用通用默认内容冒充个性化推荐**。

## 三、实现要点

1. **按源门面**：`src/api/recommend.ts` 统一返回 `SongType[]` / `CoverType[]` / `ArtistType[]`，
   复用既有映射层（`mapKugou*` / `mapQq*`）+ 格式化层（`formatSongsList` / `formatCoverList` / `formatArtistsList`），
   因此首页模板无需为各源写分支渲染。
2. **缓存作用域**：键统一为 `<区块>:<源>:<登录态>`（如 `playlistRec:kugou:in`、`albumRec:qq:anon`），
   切源 / 登录 / 登出后各取各的，互不污染。
3. **空区块隐藏 + 标题随源**：`sortedRecData` 过滤 `list.length === 0`；标题经 `sectionTitle()` 动态生成
   （`酷狗音乐专属歌单` / `QQ 音乐推荐歌单` / `QQ 音乐新碟上架` …）。
4. **失败降级**：任一区块失败只打日志，不影响其它区块；第三方源登录态失效时自动退回匿名兜底接口。

## 四、验证

```bash
pnpm test:recommend-source   # 9/9：把每个源的「端点 + 字段路径假设」逐条实测
pnpm typecheck:web           # EXIT=0
```

实测摘要（2026-09-25）：

```
酷狗音乐
✅ 每日推荐：data.song_list 字段存在（登录后为个性化歌曲）
✅ 歌单兜底：data.special_list 非空
✅ 新碟：data.{chn|eur|jpn|kor} 至少一组非空
✅ 歌手：data.info 非空
ℹ️ 个人歌单（专属歌单，需登录）：err=20010（匿名预期被拒，走广场兜底）
QQ 音乐
✅ 推荐歌单：response.recomPlaylist 存在
✅ 歌单兜底：response.data.list 非空
✅ 新碟：response.new_album.data.albums 非空
✅ 歌手：response.singerList 存在
ℹ️ 每日推荐（需登录）：recommend.code=500003（未登录可识别）
ℹ️ 个人歌单（专属歌单，需登录）：缺少 uin 参数
```

## 五、使用与排查

1. **想看到「专属」而非「推荐」**：先在对应源登录（左下角头像 → 网易云扫码/验证码；酷狗扫码/验证码；QQ 扫码/Cookie），
   首页区块标题会从「推荐歌单」变为「<源>专属歌单」，并出现「每日推荐」歌曲。
2. **切换源后内容没变**：现在不会了（缓存按源作用域）；若仍是旧内容，`Ctrl+F5` 清掉 sessionStorage 即可。
3. **酷狗 / QQ 的每日推荐为空**：该接口要求登录态（酷狗 `/everyday/recommend`、QQ `/getDailyRecommend`），登录后即可；
   若播放直链报「需要登录」，见 [KUGOU-API.md](./KUGOU-API.md) / [QQ-API.md](./QQ-API.md) 的登录说明。
4. **仍未改造的部分**：「每日推荐」独立页面（`DailySongs.vue`）目前仍走网易云 store；
   如需在酷狗 / QQ 源下也使用每日推荐页，可复用 `homeDailySongs()` 接入（已在门面中提供）。
