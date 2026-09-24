/**
 * QQ 音乐适配层回归测试
 *
 * 运行：`pnpm test:qq`（可用 `QQ_API_BASE` 覆盖被测 API 地址）
 * 覆盖：① 纯逻辑（合成 ID / 注册表 / 映射 / Cookie 会话 / 扫码状态）
 *      ② 线上联调（热搜、搜索、歌词、榜单、歌单、扫码二维码、取链的登录态提示）
 */
import {
  clearQqSongRefs,
  mapQqAlbums,
  mapQqArtists,
  mapQqPlaylists,
  mapQqSearchBody,
  mapQqSongs,
  mergeQqCookieText,
  pickQqPlayError,
  pickQqPlayUrl,
  qqErrorText,
  qqLoginToSession,
  qqLyricText,
  qqMidToId,
  qqQrStatus,
  qqQrStatusText,
  qqRawToRef,
  qqSongDetailByIds,
  qqUserToProfile,
  resolveQqSong,
} from "../src/api/qq/core";

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

const BASE = process.env["QQ_API_BASE"] || "https://qq-music-api-ten-pi.vercel.app";
const get = async (path: string) => {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { http: res.status, cors: res.headers.get("access-control-allow-origin"), body };
};

/** 真实搜索响应片段（离线用例） */
const SAMPLE_SONG = {
  songmid: "003rJSwm3TechU",
  songname: "告白气球",
  interval: 215,
  albummid: "003DFRzD192KKD",
  albumname: "周杰伦的床边故事",
  singer: [{ id: 4558, mid: "0025NhlN2yWrP4", name: "周杰伦" }],
};

console.log("=== ① 纯逻辑");
clearQqSongRefs();
const expectedId = qqMidToId(SAMPLE_SONG.songmid);
checkTrue("mid → 合成 ID 确定性", expectedId > 0 && qqMidToId(SAMPLE_SONG.songmid) === expectedId);
check("mid 为空 → 0", qqMidToId(""), 0);
const ref = qqRawToRef(SAMPLE_SONG);
checkTrue("原始对象 → 注册表引用", ref && ref.id === expectedId && ref.mid === SAMPLE_SONG.songmid);
check("注册表反查命中", resolveQqSong(expectedId)?.mid, SAMPLE_SONG.songmid);
check("未注册 id → undefined", resolveQqSong(123456789), undefined);
const song = mapQqSongs([SAMPLE_SONG])[0];
check(
  "歌曲映射：歌名/歌手/专辑/时长",
  [song.name, song.ar[0].name, song.al.name, song.dt],
  ["告白气球", "周杰伦", "周杰伦的床边故事", 215000],
);
checkTrue("歌曲映射：封面按专辑 mid 拼接", String(song.al.picUrl).includes(SAMPLE_SONG.albummid));
check("歌曲详情（走注册表，零请求）", qqSongDetailByIds([expectedId]).songs.length, 1);
check(
  "歌手映射",
  mapQqArtists([{ id: 4558, mid: "0025NhlN2yWrP4", name: "周杰伦" }])[0].name,
  "周杰伦",
);
check("专辑映射", mapQqAlbums([{ albumID: 1, albumName: "床边故事" }])[0].name, "床边故事");
check(
  "歌单映射",
  mapQqPlaylists([{ dissid: "123", dissname: "测试歌单", listennum: 9 }])[0].playCount,
  9,
);
check(
  "搜索响应 → 网易云形状（单曲）",
  (() => {
    const mapped = mapQqSearchBody(
      { response: { code: 0, data: { song: { list: [SAMPLE_SONG], totalnum: 1 } } } },
      1,
      50,
    );
    return [mapped.result.songCount, mapped.result.songs.length];
  })(),
  [1, 1],
);
check("错误码 500001 翻译", qqErrorText({ response: { code: 500001 } }).includes("500001"), true);
check(
  "上游 5xx 错误体原样回显（供页面提示）",
  qqErrorText({ error: "服务器内部错误" }),
  "服务器内部错误",
);
check("缺 uin 错误翻译", qqErrorText({ error: "缺少 uin 参数" }).includes("登录态缺失"), true);
check(
  "Cookie 合并：覆盖同名并保留其它字段",
  mergeQqCookieText("a=1; uin=old;", { uin: "o123" }),
  "a=1; uin=o123;",
);
const session = qqLoginToSession({ data: { cookie: "uin=o123456; qqmusic_key=KEY_X; other=1" } });
check("登录响应 → 会话", [session?.uin, session?.key], ["o123456", "KEY_X"]);
check("会话 Cookie 丢弃白名单外字段", session?.cookie.includes("other="), false);
check("缺密钥 → null", qqLoginToSession({ data: { cookie: "uin=o1" } }), null);
check(
  "用户信息映射（creator 包裹）",
  qqUserToProfile({
    response: { data: { creator: { uin: "o9", nick: "昵称", headpic: "http://x/a.jpg", vip: 1 } } },
  })?.nickname,
  "昵称",
);
check(
  "扫码状态解析",
  [qqQrStatus({ data: { status: 4 } }), qqQrStatus({ data: { status: 65 } })],
  [4, 65],
);
check("扫码状态文案", qqQrStatusText(65).includes("过期"), true);
check(
  "歌词提取（response.lyric.lyric）",
  qqLyricText({ response: { lyric: { lyric: "[00:00.00]测试" } } }),
  "[00:00.00]测试",
);
check(
  "播放地址提取 + 错误说明",
  [
    pickQqPlayUrl({ data: { playUrl: { mid: { url: "http://a/1.m4a" } } } }, "mid"),
    pickQqPlayError({ data: { playUrl: { mid: { url: "", error: "需要登录态" } } } }, "mid"),
  ],
  ["http://a/1.m4a", "需要登录态"],
);

console.log("\n=== ② 线上联调");
try {
  const hot = await get("/getHotkey");
  checkTrue("CORS 头为 *", hot.cors === "*");
  if (hot.http >= 500 || !(hot.body?.response?.data?.hotkey ?? []).length) {
    skipped += 1;
    console.log(
      `⚠️ SKIP 热搜：上游返回 HTTP ${hot.http} 或空列表（QQ 对该出口间歇限流；映射用例见离线部分）`,
    );
  } else {
    checkTrue("热搜可用", (hot.body?.response?.data?.hotkey ?? []).length > 0);
  }

  const search = await get("/getSearchByKey?key=%E5%91%A8%E6%9D%B0%E4%BC%A6&limit=3&page=1");
  if (search.http >= 500) {
    // QQ 搜索接口对数据中心 IP 偶发限流（HTTP 500「服务器内部错误」），此时跳过线上断言，
    // 映射逻辑由上面的离线用例覆盖（客户端已做单次重试 + 可读提示）
    skipped += 1;
    console.log(
      `⚠️ SKIP 搜索：上游返回 HTTP ${search.http}（QQ 搜索偶发限流/内部错误；离线映射用例仍覆盖）`,
    );
  } else {
    const mapped = mapQqSearchBody(search.body, 1, 3);
    checkTrue("搜索可用并映射为网易云歌曲", mapped.result.songs.length > 0);
    checkTrue("搜索结果已注册（可反查取链）", !!resolveQqSong(mapped.result.songs[0]?.id));
  }

  const mid = String(search.body?.response?.data?.song?.list?.[0]?.songmid ?? "");
  if (mid) {
    const lyric = await get(`/getLyric?songmid=${mid}&isFormat=true`);
    checkTrue("歌词可用", qqLyricText(lyric.body).includes("["));
  }

  const lists = await get("/getSongLists?page=1&limit=3&categoryId=10000000&sortId=5");
  checkTrue("歌单广场可用", mapQqPlaylists(lists.body?.response?.data?.list ?? []).length > 0);

  const top = await get("/getTopLists");
  if (top.http >= 500 || !(top.body?.response?.data?.topList ?? []).length) {
    skipped += 1;
    console.log(`⚠️ SKIP 榜单：上游返回 HTTP ${top.http} 或空列表（间歇限流）`);
  } else {
    checkTrue("榜单列表可用", (top.body?.response?.data?.topList ?? []).length > 0);
  }

  const qr = await get("/getQQLoginQr");
  checkTrue("扫码二维码可用（base64）", String(qr.body?.img ?? "").startsWith("data:image"));

  const play = await get(`/getMusicPlay?songmid=${mid || "003rJSwm3TechU"}&quality=320`);
  const url = pickQqPlayUrl(play.body, mid);
  const playError = pickQqPlayError(play.body, mid);
  console.log(
    `   ℹ️ 取链 http=${play.http} url=${url ? "有" : "无"}${playError ? ` 提示=${playError.slice(0, 28)}` : ""}（匿名预期无地址）`,
  );
  checkTrue("取链失败有可读提示", !!url || playError.includes("登录") || !!qqErrorText(play.body));
} catch (error) {
  skipped += 1;
  console.log(`⚠️ SKIP 线上联调：${(error as Error)?.message || "网络不可达"}`);
}

console.log(`\n通过 ${pass}/${pass + failed}${skipped ? `（跳过线上联调 ${skipped} 项）` : ""}`);
if (failed > 0) process.exitCode = 1;
