import type { RouteLocationNormalized, RouteLocationRaw } from "vue-router";

/**
 * 路由前置守卫：要求 `query` 中必须携带指定字段（vue-router「返回值」风格）。
 *
 * - 字段齐全 → 放行（返回 `true`）
 * - 缺任一字段 → 跳转 `/403`
 *
 * 用途：`/album`、`/playlist`、`/comment`、`/video`、`/radio` 等页面依赖 `?id=`，
 * 直接访问（无参）或参数不全时应给出 403。
 *
 * ⚠️ 这里刻意写成「带齐字段才放行」的**正向**判断，历史教训：
 * 把条件写成 `!to.query.id ? true : { path: "/403" }` 会让**正常带参**的访问全部被弹到 403
 * （点击消息里的专辑 / 歌单就会跳到 `#/403`）。`pnpm test:route-guards` 会守住这个语义。
 *
 * @param keys 必须存在的 query 字段名
 * @returns 可直接赋给 `RouteRecordRaw.beforeEnter` 的守卫函数
 */
export const requireQuery =
  (...keys: string[]) =>
  (to: Pick<RouteLocationNormalized, "query">): true | RouteLocationRaw =>
    keys.every((key) => !!to.query[key]) ? true : { path: "/403" };
