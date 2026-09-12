/**
 * 极简 HTML 净化（用于渲染来自第三方的 Markdown/HTML，例如更新日志）
 * - 仅保留白名单标签与属性，其余标签「去标签保内容」
 * - 链接/图片仅允许 http(s)、mailto、锚点与相对地址，并强制 noopener
 * - 非浏览器环境（无 DOMParser）退化为移除全部标签
 */

/** 允许保留的标签 */
const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "kbd",
  "mark",
  "small",
  "sub",
  "sup",
  "p",
  "br",
  "hr",
  "div",
  "span",
  "blockquote",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "img",
  "details",
  "summary",
]);

/** 各标签允许保留的属性 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  th: new Set(["align", "colspan", "rowspan"]),
  td: new Set(["align", "colspan", "rowspan"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
  span: new Set(["class"]),
  div: new Set(["class"]),
  details: new Set(["open"]),
};

/** 允许出现的 URL 形式 */
const SAFE_URL = /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i;

/**
 * 递归净化子节点
 * @param parent 父元素
 * @param doc 文档对象
 */
const sanitizeChildren = (parent: Element, doc: Document): void => {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      // 非白名单标签：去标签、保留文本
      child.replaceWith(doc.createTextNode(child.textContent ?? ""));
      continue;
    }
    // 仅保留白名单属性（on* 事件属性天然不在白名单内）
    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const allowed = ALLOWED_ATTRS[tag]?.has(name) ?? false;
      if (!allowed || name.startsWith("on")) child.removeAttribute(attr.name);
    }
    if (tag === "a") {
      const href = (child.getAttribute("href") ?? "").trim();
      if (href && !SAFE_URL.test(href)) child.removeAttribute("href");
      child.setAttribute("rel", "noopener noreferrer nofollow");
      child.setAttribute("target", "_blank");
    }
    if (tag === "img") {
      const src = (child.getAttribute("src") ?? "").trim();
      if (src && !SAFE_URL.test(src)) child.removeAttribute("src");
      child.setAttribute("loading", "lazy");
    }
    sanitizeChildren(child, doc);
  }
};

/**
 * 按白名单净化 HTML
 * @param html 原始 HTML
 * @returns 净化后的 HTML
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return "";
  // 非浏览器环境（如 worker / 服务端）退化为纯文本
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, "");
  try {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    sanitizeChildren(doc.body, doc);
    return doc.body.innerHTML;
  } catch {
    return html.replace(/<[^>]*>/g, "");
  }
};
