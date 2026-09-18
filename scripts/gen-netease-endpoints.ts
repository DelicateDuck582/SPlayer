/**
 * 生成「npm 版 NeteaseCloudMusicApi 端点清单」→ `src/api/netease/endpoints.ts`
 *
 * 用途：新增的「npm 版 API 全量能力」需要一份可校验的端点清单，
 * 让 `src/api/netease` 的通用调用器拥有类型安全的路径、并能在 CI 中确认清单与上游一致。
 *
 * 数据来源：上游包 `module/*.js`
 * - 请求路径 = `/` + 模块名中的 `_` 替换为 `/`（与上游 `server.js` 的路由规则一致）
 *   例外（上游 `SPECIAL_ROUTES`）：`daily_signin`、`fm_trash`、`personal_fm` 保持原路径
 * - 每个模块文件的**首行注释**即功能说明（中文），直接采集
 *
 * 用法：
 *   tsx scripts/gen-netease-endpoints.ts --pkg "E:\数据迁移\开发\ncm-api-vercel\node_modules\NeteaseCloudMusicApi"
 *   tsx scripts/gen-netease-endpoints.ts --pkg <dir> --check   # 只校验已生成文件是否与上游一致（不写入）
 *
 * 说明：上游包不随本仓库分发，因此生成结果需要提交；升级 npm 版 API 后重新执行本脚本即可。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

/** 仓库根目录 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 生成目标 */
const targetFile = join(repoRoot, "src", "api", "netease", "endpoints.ts");

/** 上游 server.js 中的特殊路由（保持原路径，不把 `_` 换成 `/`） */
const SPECIAL_ROUTES: Record<string, string> = {
  daily_signin: "/daily_signin",
  fm_trash: "/fm_trash",
  personal_fm: "/personal_fm",
};

interface EndpointItem {
  /** 模块名（与上游 `module/<name>.js`、文档标题一致） */
  name: string;
  /** 请求路径 */
  path: string;
  /** 功能说明（取自模块首行注释） */
  desc: string;
}

/** 读取命令行参数 */
const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};

/** 模块名 → 请求路径 */
const toPath = (name: string): string => SPECIAL_ROUTES[name] ?? `/${name.replace(/_/g, "/")}`;

/** 上游 `module/*.js` 首行未写注释时的说明补全（依据模块实现与上游功能列表整理） */
const DESC_OVERRIDES: Record<string, string> = {
  api: "自定义请求（透传 uri/data 给上游接口，调试用）",
  "artist/detail": "歌手详情",
  "artist/new/mv": "关注歌手新 MV",
  "artist/new/song": "关注歌手新歌",
  "artist/songs": "歌手全部歌曲",
  "audio/match": "听歌识曲（音频指纹匹配）",
  "avatar/upload": "更新头像",
  calendar: "音乐日历",
  "cloud/match": "云盘歌曲信息匹配纠正",
  "comment/floor": "楼层评论",
  "comment/hug/list": "评论抱一抱列表",
  "eapi/decrypt": "eapi 请求/响应解密（调试）",
  "get/userids": "根据昵称批量获取用户 id",
  "hug/comment": "抱一抱评论",
  "inner/version": "内部版本接口",
  "listentogether/accept": "一起听 - 接受邀请",
  "login/qr/check": "二维码登录 - 检查状态",
  "login/qr/key": "二维码登录 - 获取 key",
  "login/status": "登录状态",
  "nickname/check": "重复昵称检测",
  "playlist/cover/update": "歌单封面上传",
  "playlist/mylike": "我喜欢的音乐（按时间）",
  "playlist/track/add": "收藏单曲到歌单",
  "playlist/video/recent": "最近播放的视频（视频歌单）",
  "record/recent/album": "最近播放 - 专辑",
  "record/recent/dj": "最近播放 - 播客",
  "record/recent/playlist": "最近播放 - 歌单",
  "record/recent/song": "最近播放 - 歌曲",
  "record/recent/video": "最近播放 - 视频",
  "record/recent/voice": "最近播放 - 声音",
  "sign/happy/info": "乐签信息",
  "topic/detail": "话题详情",
  "topic/detail/event/hot": "话题详情热门动态",
  "user/account": "账号信息",
  "user/binding": "用户绑定信息",
  "user/bindingcellphone": "绑定手机",
  "user/comment/history": "用户历史评论",
  "user/replacephone": "更换绑定手机",
  "verify/getQr": "验证接口 - 二维码生成",
  "verify/qrcodestatus": "验证接口 - 二维码检测",
  "voice/delete": "删除声音",
  "voice/detail": "声音详情",
  "voice/lyric": "声音歌词",
  "voicelist/detail": "播客声音列表详情",
  "voicelist/list": "播客声音列表（按列表）",
  "voicelist/search": "播客搜索",
  "voicelist/trans": "播客声音列表（按电台/节目）",
  "yunbei/expense": "云贝支出",
  "yunbei/info": "云贝账户信息",
  "yunbei/receipt": "云贝收入明细",
  "yunbei/sign": "云贝签到",
  "yunbei/task/finish": "云贝完成任务",
  "yunbei/tasks": "云贝所有任务",
  "yunbei/tasks/todo": "云贝 todo 任务",
  "yunbei/today": "云贝今日签到信息",
};

/** 采集端点（按路径排序，保证生成结果稳定） */
const collectEndpoints = (pkgDir: string): EndpointItem[] => {
  const moduleDir = join(pkgDir, "module");
  if (!existsSync(moduleDir)) {
    throw new Error(
      `未找到上游模块目录：${moduleDir}（请用 --pkg 指向 NeteaseCloudMusicApi 包目录）`,
    );
  }
  return readdirSync(moduleDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => {
      const name = file.replace(/\.js$/, "");
      const path = toPath(name);
      const source = readFileSync(join(moduleDir, file), "utf-8");
      const comment = /^\s*\/\/\s*(.+)$/m.exec(source);
      // 优先级：上游首行注释 → 本脚本补全表 → 模块名
      const desc = comment ? comment[1].trim() : (DESC_OVERRIDES[path.slice(1)] ?? name);
      return { name, path, desc };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
};

/** 转义为 TS 字符串字面量 */
const toLiteral = (value: string): string => JSON.stringify(value);

/** 生成文件内容（结果经 Prettier 格式化，保证与仓库格式一致） */
const buildFile = async (endpoints: EndpointItem[]): Promise<string> => {
  const lines = endpoints.map(
    (item) =>
      `  { name: ${toLiteral(item.name)}, path: ${toLiteral(item.path)}, desc: ${toLiteral(item.desc)} },`,
  );
  const content = `/**
 * npm 版 NeteaseCloudMusicApi 端点清单（**自动生成，请勿手改**）
 *
 * 生成：\`pnpm gen:netease-endpoints\`
 * 来源：上游包 \`module/*.js\`（模块名 → 路径规则、首行注释 → 功能说明）
 * 共 ${endpoints.length} 个端点；用于 \`@/api/netease\` 通用调用器的类型安全路径与覆盖率校验。
 */

/** 端点信息 */
export interface NeteaseEndpoint {
  /** 模块名（与上游 \`module/<name>.js\` 一致） */
  name: string;
  /** 请求路径 */
  path: string;
  /** 功能说明 */
  desc: string;
}

/** 全部端点（按路径排序） */
export const NETEASE_ENDPOINTS = [
${lines.join("\n")}
] as const satisfies readonly NeteaseEndpoint[];

/** 端点总数 */
export const NETEASE_ENDPOINT_COUNT = NETEASE_ENDPOINTS.length;

/** 端点路径（联合类型，供通用调用器约束参数） */
export type NeteaseEndpointPath = (typeof NETEASE_ENDPOINTS)[number]["path"];

/** 端点模块名 */
export type NeteaseEndpointName = (typeof NETEASE_ENDPOINTS)[number]["name"];

/** 模块名 → 路径 */
export const NETEASE_ENDPOINT_PATH_BY_NAME: Record<string, NeteaseEndpointPath> = Object.fromEntries(
  NETEASE_ENDPOINTS.map((item) => [item.name, item.path]),
) as Record<string, NeteaseEndpointPath>;

/** 路径 → 功能说明 */
export const NETEASE_ENDPOINT_DESC_BY_PATH: Record<string, string> = Object.fromEntries(
  NETEASE_ENDPOINTS.map((item) => [item.path, item.desc]),
);
`;
  // 交给 Prettier 格式化（显式读取仓库配置），避免生成结果与 `prettier --check` 冲突
  const options = (await prettier.resolveConfig(targetFile)) ?? {};
  return prettier.format(content, { ...options, filepath: targetFile, parser: "typescript" });
};

/** 主流程 */
const main = async () => {
  const pkgDir = readArg("pkg") ?? process.env["NCM_PKG_DIR"];
  if (!pkgDir) {
    console.error("请用 --pkg <NeteaseCloudMusicApi 包目录> 指定上游包位置（或设置 NCM_PKG_DIR）");
    process.exit(1);
  }
  const endpoints = collectEndpoints(pkgDir);
  const content = await buildFile(endpoints);

  if (process.argv.includes("--check")) {
    if (!existsSync(targetFile)) {
      console.error(`端点清单缺失：${targetFile}，请先执行 pnpm gen:netease-endpoints`);
      process.exit(1);
    }
    if (readFileSync(targetFile, "utf-8") !== content) {
      console.error("端点清单与上游不一致，请重新执行 pnpm gen:netease-endpoints");
      process.exit(1);
    }
    console.log(`端点清单与上游一致（${endpoints.length} 个端点）`);
    return;
  }

  mkdirSync(dirname(targetFile), { recursive: true });
  writeFileSync(targetFile, content, "utf-8");
  console.log(`已生成 ${targetFile}（${endpoints.length} 个端点）`);
};

// 主流程（顶层调用，失败时以非 0 退出码结束）
main().catch((error) => {
  console.error("生成失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
