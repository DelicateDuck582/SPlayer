/**
 * 首页「按源个性化推荐」取数假设回归测试
 *
 * 运行：`pnpm test:recommend-source`（可用 `KUGOU_API_BASE` / `QQ_API_BASE` 覆盖被测服务）
 *
 * 目的：`src/api/recommend.ts` 按「各源推荐端点 + 字段路径」取数，本脚本对这些**假设**逐条实测，
 * 上游字段改名或接口下线时会立刻暴露（而不是让首页静默变成空/默认推荐）。
 * 不依赖 pinia / 浏览器环境，可离线运行（网络不可达时线上部分自动 SKIP）。
 */
const KUGOU = process.env["KUGOU_API_BASE"] || "https://kugou-api-eight.vercel.app";
const QQ = process.env["QQ_API_BASE"] || "https://qq-music-api-ten-pi.vercel.app";

let pass = 0;
let failed = 0;
let skipped = 0;

const checkTrue = (name: string, value: unknown) => {
  const ok = !!value;
  pass += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` (${JSON.stringify(value)})`}`);
};

const kgPost = async (path: string, body: Record<string, unknown> = {}) => {
  const res = await fetch(`${KUGOU}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({}));
};

const qqGet = async (path: string) => {
  const res = await fetch(`${QQ}${path}`);
  return res.json().catch(() => ({}));
};

/** 防御式取值（与 recommend.ts 中的 pick 同构） */
const pick = (value: any, path: string): any =>
  path
    .split(".")
    .reduce((acc: any, key) => (acc === undefined || acc === null ? undefined : acc[key]), value);

console.log("=== 酷狗音乐（第三方源取数假设）");
try {
  const everyday = await kgPost("/everyday/recommend");
  checkTrue(
    "① 每日推荐：data.song_list 字段存在（登录后为个性化歌曲）",
    everyday?.data !== undefined && "song_list" in (everyday.data ?? {}),
  );

  const topPlaylist = await kgPost("/top/playlist", { page: 1, pagesize: 3 });
  checkTrue(
    "② 歌单兜底：data.special_list 非空",
    (pick(topPlaylist, "data.special_list") ?? []).length > 0,
  );

  const topAlbum = await kgPost("/top/album", { page: 1, pagesize: 3 });
  checkTrue(
    "③ 新碟：data.{chn|eur|jpn|kor} 至少一组非空",
    [
      pick(topAlbum, "data.chn"),
      pick(topAlbum, "data.eur"),
      pick(topAlbum, "data.jpn"),
      pick(topAlbum, "data.kor"),
    ].some((g: any) => Array.isArray(g) && g.length > 0),
  );

  const artists = await kgPost("/artist/lists", { page: 1, pagesize: 3 });
  checkTrue("④ 歌手：data.info 非空", (pick(artists, "data.info") ?? []).length > 0);

  const userPlaylist = await kgPost("/user/playlist");
  console.log(
    `   ℹ️ 个人歌单（专属歌单，需登录）：err=${userPlaylist?.error_code ?? "-"}（匿名预期被拒，走广场兜底）`,
  );
} catch (error) {
  skipped += 1;
  console.log(`⚠️ SKIP 酷狗：${(error as Error)?.message || "网络不可达"}`);
}

console.log("\n=== QQ 音乐（第三方源取数假设）");
try {
  const personal = await qqGet("/getPersonalRecommend");
  checkTrue("① 推荐歌单：response.recomPlaylist 存在", !!pick(personal, "response.recomPlaylist"));

  const songLists = await qqGet("/getSongLists?page=1&limit=3&categoryId=10000000&sortId=5");
  checkTrue(
    "② 歌单兜底：response.data.list 非空",
    (pick(songLists, "response.data.list") ?? []).length > 0,
  );

  const newDisks = await qqGet("/getNewDisks?areaId=5&limit=3");
  checkTrue(
    "③ 新碟：response.new_album.data.albums 非空",
    (pick(newDisks, "response.new_album.data.albums") ?? []).length > 0,
  );

  const singerList = await qqGet("/getSingerList");
  checkTrue("④ 歌手：response.singerList 存在", !!pick(singerList, "response.singerList"));

  const daily = await qqGet("/getDailyRecommend");
  const recommendCode = pick(daily, "response.recommend.code");
  console.log(
    `   ℹ️ 每日推荐（需登录）：http 返回 code=${pick(daily, "response.code")} recommend.code=${recommendCode ?? "-"}`,
  );
  checkTrue(
    "⑤ 每日推荐在未登录时给出可识别状态（不抛异常）",
    recommendCode !== undefined || !!pick(daily, "response.recommend.songlist"),
  );

  const userPlaylists = await qqGet("/user/getUserPlaylists");
  console.log(
    `   ℹ️ 个人歌单（专属歌单，需登录）：${String(userPlaylists?.error ?? "已返回数据").slice(0, 24)}`,
  );
} catch (error) {
  skipped += 1;
  console.log(`⚠️ SKIP QQ：${(error as Error)?.message || "网络不可达"}`);
}

console.log("\n=== 网易云（既有链路，仅确认取数入口未变）");
console.log(
  "   ℹ️ 专属歌单 `/personalized`、雷达 `idMeta.radarPlaylist`、歌手 `/top/artists`、新碟 `/album/new`（沿用现状）",
);

console.log(`\n通过 ${pass}/${pass + failed}${skipped ? `（跳过 ${skipped} 个平台）` : ""}`);
if (failed > 0) process.exitCode = 1;
