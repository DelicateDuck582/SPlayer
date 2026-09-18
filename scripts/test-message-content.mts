/**
 * 消息体解析回归测试（私信 / 评论 / 通知的 JSON、HTML、对象与异常输入）
 *
 * 运行：pnpm test:message-content
 * 覆盖：JSON 串分享（歌曲 / 歌单）、真实通知样例、HTML 正文、嵌套对象、坏 JSON、空值
 */
import { parseMessageContent, toPreviewText } from "../src/utils/messageContent";

const cases: Array<{ name: string; input: unknown; expectText?: string; expectType?: string }> = [
  {
    name: "① 私信分享歌曲（JSON 串）",
    input:
      '{"type":1,"msg":"分享单曲","song":{"id":536623501,"name":"Ref:rain","artists":[{"name":"Aimer"},{"name":"B"}],"album":{"id":1,"name":"Ref:rain","picUrl":"http://p1.music.126.net/x.jpg"}}}',
    expectText: "分享单曲",
    expectType: "song",
  },
  {
    name: "② 通知：新专辑（真实样例，msg 纯文本 + 顶层 album）",
    input: {
      msg: "我的最新专辑《ヘネシー (feat. 可不, 初音ミク)》发布了, 快来抢先听！",
      album: {
        id: 397852342,
        name: "ヘネシー (feat. 可不, 初音ミク)",
        picUrl: "http://p3.music.126.net/Dp4.jpg",
        artists: [{ name: "HorseSea1" }, { name: "可不" }, { name: "初音ミク" }],
      },
      type: 2,
    },
    expectText: "我的最新专辑《ヘネシー (feat. 可不, 初音ミク)》发布了, 快来抢先听！",
    expectType: "album",
  },
  {
    name: "③ 评论正文含 HTML（应去掉标签，保留文字）",
    input: {
      content: '好听<br/>同感<a href="https://x">@某人</a> <img src="https://x/e.png">么么哒',
    },
    expectText: "好听\n同感@某人 么么哒",
  },
  {
    name: "④ msg 是对象（非字符串）",
    input: {
      msg: { song: { id: 42, name: "某歌", artistName: "某歌手", coverUrl: "http://a/b.jpg" } },
    },
    expectText: "分享内容",
    expectType: "song",
  },
  {
    name: "⑤ 坏 JSON（必须退化为纯文本，不抛错）",
    input: '{"type":1,"msg":"没有闭合',
  },
  {
    name: "⑥ 空值与 null",
    input: null,
    expectText: "",
  },
  {
    name: "⑦ 歌单分享（playlist + coverImgUrl + creator）",
    input:
      '{"type":2,"msg":"分享歌单","playlist":{"id":123,"name":"我的歌单","coverImgUrl":"http://p/x.jpg","creator":{"nickname":"阿七"}}}',
    expectText: "分享歌单",
    expectType: "playlist",
  },
];

let pass = 0;
for (const testCase of cases) {
  let result;
  let error = "";
  try {
    result = parseMessageContent(testCase.input);
  } catch (e) {
    error = String(e);
  }
  const textOk = testCase.expectText === undefined || result?.text === testCase.expectText;
  const typeOk =
    testCase.expectType === undefined || result?.resource?.type === testCase.expectType;
  const ok = !error && textOk && typeOk;
  pass += ok ? 1 : 0;
  console.log(`${ok ? "✅" : "❌"} ${testCase.name}`);
  console.log(
    `   text=${JSON.stringify(result?.text)} type=${result?.resource?.type ?? "-"} sub=${JSON.stringify(result?.resource?.sub ?? "")} cover=${result?.resource?.cover ?? "-"}`,
  );
  if (testCase.expectText !== undefined && !textOk)
    console.log(`   期望 text=${JSON.stringify(testCase.expectText)}`);
  if (testCase.expectType !== undefined && !typeOk)
    console.log(`   期望 type=${testCase.expectType}`);
  if (error) console.log(`   异常：${error}`);
}
console.log("");
console.log("预览截断：", JSON.stringify(toPreviewText("一二三四五六七八九十".repeat(10), 12)));
console.log(`通过 ${pass}/${cases.length}`);
