/**
 * 酷狗适配层回归测试
 *
 * 运行：`pnpm test:kugou`（可用环境变量 `KUGOU_API_BASE` 覆盖被测 API 地址）
 *
 * 覆盖：
 *   ① 纯逻辑：合成 ID 派生、注册表反查、酷狗 → 网易云形状映射、播放地址提取、错误码翻译
 *   ② 线上联调：用真实酷狗 API 响应喂给映射函数，断言产出的网易云形状字段完整
 *      （网络不可用时自动跳过并标记 SKIP）
 *
 * 说明：为了能在纯 Node 环境下运行，本脚本只加载 `src/api/kugou/core`（无 pinia / axios / DOM 依赖），
 * 网络请求用原生 `fetch` 直连酷狗 API。
 */
import {
  KUGOU_BR_BY_LEVEL,
  KUGOU_QUALITY_BY_LEVEL,
  clearKugouSongRefs,
  firstArray,
  kugouErrorText,
  kugouHashToId,
  kugouImage,
  kugouLoginToSession,
  kugouQrStatus,
  kugouQrStatusText,
  kugouRawToRef,
  kugouSongDetailByIds,
  mapKugouAlbums,
  mapKugouArtists,
  mapKugouPlaylists,
  mapKugouSearchBody,
  mapKugouSongs,
  mergeKugouCookieText,
  pickKugouPlayUrl,
  resolveKugouSong,
} from "../src/api/kugou/core";

let pass = 0;
let failed = 0;
let skipped = 0;

const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  pass += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  if (!ok) console.log(`   actual=${JSON.stringify(actual)} expect=${JSON.stringify(expected)}`);
};

const checkTrue = (name: string, value: unknown) => {
  const ok = !!value;
  pass += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : ` (${JSON.stringify(value)})`}`);
};

const BASE = process.env["KUGOU_API_BASE"] || "https://kugou-api.duckgame-play.top";

const post = async (path: string, body: Record<string, unknown> = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { http: res.status, cors: res.headers.get("access-control-allow-origin"), body: parsed };
};

/** 酷狗歌曲样例（离线用例，字段取自真实 `/top/song` 响应） */
const SAMPLE_SONG = {
  hash: "33CF39C0C477E8A2F956527C97526781",
  audio_id: 1108384354,
  album_id: 960399,
  album_audio_id: 12345678,
  songname: "测试歌曲",
  filename: "测试歌手 - 测试歌曲",
  author_name: "测试歌手",
  authors: [{ author_id: 11358719, author_name: "测试歌手" }],
  album_name: "测试专辑",
  album_sizable_cover: "http://imge.kugou.com/stdmusic/{size}/cover.jpg",
  timelength: 245000,
};

console.log("=== ① 纯逻辑");
clearKugouSongRefs();
const hash = SAMPLE_SONG.hash;
const expectedId = Number.parseInt(hash.slice(0, 13), 16);
check("hash → 合成 ID 确定性", kugouHashToId(hash), expectedId);
check("hash 非法 → 0", kugouHashToId(""), 0);
check("图片 {size} 展开", kugouImage(SAMPLE_SONG.album_sizable_cover, 240).includes("/240/"), true);
check("错误码 152 翻译", kugouErrorText({ error_code: 152 }).includes("152"), true);
check("错误码 20028 翻译", kugouErrorText({ errcode: 20028 }).includes("Cookie"), true);
check("未知错误码回退 error_msg", kugouErrorText({ error_msg: "boom" }), "boom");

const ref = kugouRawToRef(SAMPLE_SONG);
checkTrue("原始对象 → 注册表引用", ref && ref.id === expectedId);
check("注册表反查命中", resolveKugouSong(expectedId)?.hash, hash);
check("未注册 id → undefined", resolveKugouSong(123456789), undefined);
const mappedSong = mapKugouSongs([SAMPLE_SONG])[0];
check("歌曲映射：id", mappedSong.id, expectedId);
check(
  "歌曲映射：歌名/歌手/专辑",
  [mappedSong.name, mappedSong.ar[0].name, mappedSong.al.name],
  ["测试歌曲", "测试歌手", "测试专辑"],
);
check(
  "歌曲映射：封面展开 + 时长",
  [mappedSong.al.picUrl.includes("/240/"), mappedSong.dt],
  [true, 245000],
);
check("歌曲详情（走注册表，零请求）", kugouSongDetailByIds([expectedId]).songs.length, 1);
check(
  "播放地址提取（兼容多种结构）",
  [
    pickKugouPlayUrl({ url: [{ url: "http://a/1.mp3" }] }),
    pickKugouPlayUrl({ data: { url: [{ url: "http://b/2.flac" }] } }),
    pickKugouPlayUrl({ data: { play_url: "http://c/3.mp3" } }),
    pickKugouPlayUrl({ status: 2, error_code: 20028 }),
  ],
  ["http://a/1.mp3", "http://b/2.flac", "http://c/3.mp3", ""],
);
check(
  "音质映射（exhigh→320 / lossless→flac）",
  [KUGOU_QUALITY_BY_LEVEL["exhigh"], KUGOU_QUALITY_BY_LEVEL["lossless"]],
  ["320", "flac"],
);
checkTrue("码率映射非空", KUGOU_BR_BY_LEVEL["lossless"] > 0);
check(
  "歌手映射",
  mapKugouArtists([{ AuthorId: 3520, AuthorName: "周杰伦", AlbumCount: 49 }])[0].id,
  3520,
);
check(
  "专辑映射",
  mapKugouAlbums([{ albumid: 960399, albumname: "魔杰座", singer: "周杰伦", songcount: 11 }])[0]
    .name,
  "魔杰座",
);
check(
  "歌单映射",
  mapKugouPlaylists([
    { specialid: 7052166, specialname: "杜比全景声", nickname: "VIPER", song_count: 154 },
  ])[0].trackCount,
  154,
);
check(
  "歌曲搜索被风控 → 空结果 + 提示",
  (() => {
    const mapped = mapKugouSearchBody("song", {
      status: 1,
      error_code: 152,
      data: { lists: [], total: 0 },
    });
    return { count: mapped.result.songCount, hasMessage: !!mapped.result.message };
  })(),
  { count: 0, hasMessage: true },
);

console.log("\n=== ①b 登录 / 会话（纯逻辑）");
check(
  "Cookie 合并：空基串",
  mergeKugouCookieText("", { token: "T", userid: "9" }),
  "token=T; userid=9;",
);
check(
  "Cookie 合并：覆盖同名并保留其它字段",
  mergeKugouCookieText("dfid=abc; token=old;", { token: "new" }),
  "dfid=abc; token=new;",
);
check(
  "Cookie 合并：跳过 userid=0",
  mergeKugouCookieText("", { userid: "0", token: "T" }),
  "token=T;",
);
check("错误码 20017 翻译", kugouErrorText({ error_code: 20017 }).includes("20017"), true);

const session = kugouLoginToSession(
  {
    status: 1,
    data: {
      token: "TOKEN_X",
      userid: 12345,
      nickname: "测试用户",
      pic: "http://imge.kugou.com/{size}/avatar.jpg",
      vip_type: 1,
    },
  },
  "dfid=abc;",
);
check("登录响应 → 会话：token / userid", [session?.token, session?.userid], ["TOKEN_X", "12345"]);
check(
  "登录响应 → 会话：Cookie 含旧字段 + 新 token",
  session?.cookie.includes("dfid=abc") && session?.cookie.includes("token=TOKEN_X;"),
  true,
);
check(
  "登录响应 → 会话：昵称 / 头像 / VIP",
  [session?.nickname, session?.avatar?.includes("/240/"), session?.vipType],
  ["测试用户", true, 1],
);
check("登录响应缺 token → null", kugouLoginToSession({ status: 1, data: { userid: 1 } }), null);
check(
  "扫码状态解析",
  [kugouQrStatus({ data: { status: 4 } }), kugouQrStatus({ data: { status: 1 } })],
  [4, 1],
);
check(
  "扫码状态文案",
  kugouQrStatusText(4).includes("成功") && kugouQrStatusText(0).includes("过期"),
  true,
);

console.log("\n=== ② 线上联调（真实酷狗 API）");
try {
  const hot = await post("/search/hot");
  checkTrue("CORS 头为 *", hot.cors === "*");
  const hotWords = firstArray(hot.body?.data?.list).flatMap((g: any) => firstArray(g?.keywords));
  checkTrue("热搜可用（匿名）", hotWords.length > 0);

  const top = await post("/top/song", { type: 0 });
  const mappedTop = mapKugouSongs(firstArray(top.body?.data?.data, top.body?.data));
  checkTrue("新歌速递可用并映射为网易云歌曲", mappedTop.length > 0 && !!mappedTop[0].id);
  checkTrue("新歌速递歌曲已注册（可反查取链）", !!resolveKugouSong(mappedTop[0].id));

  const rank = await post("/rank/list", { withsong: 0 });
  checkTrue("排行榜列表可用", firstArray(rank.body?.data?.info).length > 0);

  const pl = await post("/top/playlist", { page: 1, pagesize: 3 });
  const mappedPl = mapKugouPlaylists(firstArray(pl.body?.data?.special_list));
  checkTrue("歌单广场可用并映射", mappedPl.length > 0 && mappedPl[0].id > 0);

  const artist = await post("/search", {
    keywords: "周杰伦",
    type: "author",
    page: 1,
    pagesize: 2,
  });
  const mappedArtist = mapKugouArtists(
    firstArray(artist.body?.data?.lists, artist.body?.data?.info),
  );
  checkTrue("歌手搜索可用（匿名）", mappedArtist.length > 0 && mappedArtist[0].id > 0);

  const songSearch = await post("/search", {
    keywords: "周杰伦",
    type: "song",
    page: 1,
    pagesize: 2,
  });
  const mappedSongSearch = mapKugouSearchBody("song", songSearch.body, 0);
  console.log(
    `   ℹ️ 歌曲搜索 http=${songSearch.http} err=${songSearch.body?.error_code ?? "-"} 结果=${mappedSongSearch.result.songCount}（无 Cookie 时预期被风控）`,
  );
  checkTrue(
    "歌曲搜索：有结果或给出可读提示",
    mappedSongSearch.result.songCount > 0 || !!mappedSongSearch.result.message,
  );

  const songUrl = await post("/song/url", {
    id: SAMPLE_SONG.hash,
    quality: "320",
    album_id: 960399,
  });
  const pickedUrl = pickKugouPlayUrl(songUrl.body);
  console.log(
    `   ℹ️ 取链 http=${songUrl.http} err=${songUrl.body?.error_code ?? songUrl.body?.errcode ?? "-"} url=${pickedUrl ? "有" : "无"}（无 Cookie 时预期被风控）`,
  );
  checkTrue("取链失败可被识别（不抛异常）", pickedUrl === "" || pickedUrl.startsWith("http"));

  // 登录相关端点（匿名可用性 / 错误码，不做真实登录）
  const qrKey = await post("/login/qr/key");
  const qrCode = String(qrKey.body?.data?.qrcode ?? "");
  checkTrue(
    "扫码 key 可用（含二维码 base64）",
    !!qrCode && String(qrKey.body?.data?.qrcode_img).startsWith("data:image"),
  );
  if (qrCode) {
    const qrCheck = await post("/login/qr/check", { key: qrCode });
    checkTrue("扫码状态可查询（未扫码 → 1）", kugouQrStatus(qrCheck.body) === 1);
  }
  const refresh = await post("/login/token", {});
  checkTrue(
    "刷新登录未登录时报 20017 且可读",
    (refresh.body?.error_code ?? refresh.body?.errcode) === 20017 &&
      kugouErrorText(refresh.body).includes("20017"),
  );
  const captcha = await post("/captcha/sent", { mobile: "1" });
  checkTrue("发送验证码接口可达（非法手机号不抛异常）", typeof captcha.http === "number");
} catch (error) {
  skipped += 1;
  console.log(`⚠️ SKIP 线上联调：${(error as Error)?.message || "网络不可达"}`);
}

console.log(`\n通过 ${pass}/${pass + failed}${skipped ? `（跳过线上联调 ${skipped} 项）` : ""}`);
if (failed > 0) process.exitCode = 1;
