/**
 * 消息内容解析（私信 / 评论 / @我 / 通知）
 *
 * 上游消息体并不总是纯文本，直接绑定到视图会出现「一长串 JSON 撑爆卡片」的问题：
 * - 私信分享歌曲 / 歌单 / MV 时，`msg` 是 **JSON 串**，形如
 *   `{"type":1,"msg":"分享内容","song":{"id":..,"name":"..","artists":[..]}}`
 * - 评论 / 通知正文可能含 HTML（`<a>`、`<img>` 表情等）
 * - 部分字段（如 `comment`、`lastForward`）直接是**对象**而不是字符串
 *
 * 因此统一在此解析：输出「可读纯文本」+「可选的结构化资源」，并且**任何异常都退化为纯文本**，
 * 不会把原始 JSON 泄露到界面。
 */

/** 结构化资源类型 */
export type MessageResourceType = "album" | "song" | "playlist" | "mv" | "video" | "program" | "dj";

/** 结构化资源（用于消息里的卡片渲染） */
export interface MessageResource {
  type: MessageResourceType;
  /** 资源 id（视频 vid 为十六进制字符串，故允许 string） */
  id: string | number;
  name: string;
  cover: string;
  /** 副标题（多歌手 / 作者 / 电台名） */
  sub: string;
}

/** 解析结果 */
export interface ParsedMessage {
  /** 可读纯文本 */
  text: string;
  /** 消息附带的资源（存在时以卡片展示） */
  resource?: MessageResource;
}

/** 资源字段候选（按优先级） */
const RESOURCE_CANDIDATES: Array<{ key: string; type: MessageResourceType }> = [
  { key: "album", type: "album" },
  { key: "song", type: "song" },
  { key: "songs", type: "song" },
  { key: "playlist", type: "playlist" },
  { key: "mv", type: "mv" },
  { key: "video", type: "video" },
  { key: "program", type: "program" },
  { key: "djRadio", type: "dj" },
  { key: "radio", type: "dj" },
];

/**
 * 去除 HTML 标签与常见实体（仅用于文本展示，不用于 v-html）
 * @param input 原始字符串
 */
export const stripHtmlText = (input: string): string =>
  String(input ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** 取第一个非空字符串字段 */
const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
};

/**
 * 从对象里提取结构化资源（专辑 / 歌曲 / 歌单 / MV / 视频 / 电台节目）
 * @param source 任意对象
 */
export const pickMessageResource = (source: unknown): MessageResource | undefined => {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, any>;
  for (const { key, type } of RESOURCE_CANDIDATES) {
    const raw = record[key];
    const target = Array.isArray(raw) ? raw[0] : raw;
    if (!target || typeof target !== "object") continue;
    const id = target.id ?? target.albumId ?? target.playlistId ?? target.vid ?? target.songId ?? 0;
    if (!id || id === 0) continue;
    // 封面：歌曲的封面通常在 al.picUrl / album.picUrl
    const cover =
      target.picUrl ??
      target.coverUrl ??
      target.coverImgUrl ??
      target.blurPicUrl ??
      target.cover ??
      target.al?.picUrl ??
      target.album?.picUrl ??
      "";
    const name = firstText(target.name, target.title, target.albumName) || `#${id}`;
    // 歌手：新版字段为 ar，旧版为 artists / artist
    const rawArtists = Array.isArray(target.ar)
      ? target.ar
      : Array.isArray(target.artists)
        ? target.artists
        : [];
    const artists = rawArtists.map((artist: any) => firstText(artist?.name)).filter(Boolean);
    const sub = firstText(
      artists.length ? artists.join(" / ") : "",
      target.artistName,
      target.artist?.name,
      target.al?.name,
      target.album?.name,
      target.creator?.nickname,
      target.dj?.nickname,
      target.radio?.name,
    );
    return {
      type,
      id,
      name,
      cover: String(cover).replace(/^http:/, "https:"),
      sub,
    };
  }
  return undefined;
};

/** 可能携带资源 / 文本的嵌套字段 */
const NESTED_SOURCES = ["msg", "content", "text", "data", "comment", "lastForward", "resource"];

/**
 * 从对象里提取可读文本与资源（含嵌套字段）
 * @param record 任意对象
 */
const parseFromObject = (record: Record<string, any>): ParsedMessage => {
  const sources: Array<Record<string, any>> = [record];
  NESTED_SOURCES.forEach((key) => {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) sources.push(value);
  });

  const resource = sources.map((source) => pickMessageResource(source)).find(Boolean);
  const text = firstText(
    record.msg,
    record.content,
    record.text,
    record.title,
    ...NESTED_SOURCES.map((key) => record[key]?.msg ?? record[key]?.content ?? record[key]?.text),
  );

  if (text) return { text: stripHtmlText(text), resource };
  return { text: resource ? "分享内容" : "（非文本消息）", resource };
};

/**
 * 解析消息内容：JSON 串 / HTML / 纯文本 / 对象 → 可读文本 + 可选资源
 *
 * 任何解析失败都会退化为纯文本（并去掉明显无意义的 JSON 花括号噪音），
 * 保证不会把原始结构体直接渲染到界面。
 * @param raw 上游返回的消息内容
 */
export const parseMessageContent = (raw: unknown): ParsedMessage => {
  if (raw === null || raw === undefined) return { text: "" };

  // 1) 对象：优先取可读字段，其次给紧凑摘要
  if (typeof raw === "object") {
    return parseFromObject(raw as Record<string, any>);
  }

  const value = String(raw).trim();
  if (!value) return { text: "" };

  // 2) JSON 串：解析后递归处理（拿到 msg 文本与 song/album 资源）
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return parseMessageContent(JSON.parse(value));
    } catch {
      // 解析失败：继续按纯文本处理
    }
  }

  // 3) 普通文本（可能含 HTML）
  return { text: stripHtmlText(value) };
};

/**
 * 文本预览（用于会话列表等单行展示，避免长文本撑破布局）
 * @param text 文本
 * @param max 最大字符数
 */
export const toPreviewText = (text: string, max = 60): string => {
  const value = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
};
