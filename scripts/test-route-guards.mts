/**
 * 路由守卫语义回归测试
 *
 * 运行：pnpm test:route-guards
 * 覆盖：
 *   ① `requireQuery()` 的放行 / 403 语义（**带参必须放行**，缺参才 403）
 *   ② `src/router/routes.ts` 不得再出现「条件写反」的守卫，也不得回退到已废弃的 `next()` 风格
 *
 * 背景：曾经把守卫写成 `!to.query.id ? true : { path: "/403" }`，导致点击消息里的专辑 / 歌单
 * 等**正常带参**的跳转全部被弹到 `#/403`。
 */
import { readFileSync } from "node:fs";
import { requireQuery } from "../src/router/guards";

let pass = 0;
let failed = 0;

const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  pass += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  console.log(`${ok ? "✅" : "❌"} ${name}`);
  console.log(`   actual=${JSON.stringify(actual)} expect=${JSON.stringify(expected)}`);
};

// ① 守卫语义
const needId = requireQuery("id");
check("① 带 id → 放行", needId({ query: { id: "123" } }), true);
check("② 缺 id → 403", needId({ query: {} }), { path: "/403" });
check("③ id 为空串 → 403", needId({ query: { id: "" } }), { path: "/403" });
check("④ id 为 null → 403", needId({ query: { id: null } }), { path: "/403" });
check("⑤ 数字 id（字符串化）→ 放行", needId({ query: { id: "0" } }), true);

const needIdAndName = requireQuery("id", "name");
check("⑥ id + name 齐全 → 放行", needIdAndName({ query: { id: "1", name: "流行" } }), true);
check("⑦ 只有 id（缺 name）→ 403", needIdAndName({ query: { id: "1" } }), { path: "/403" });

const needKeyword = requireQuery("keyword");
check("⑧ 带 keyword → 放行", needKeyword({ query: { keyword: "周杰伦" } }), true);
check("⑨ 缺 keyword → 403", needKeyword({ query: {} }), { path: "/403" });

// ② 源码级回归：routes.ts 的守卫写法
const routesSource = readFileSync(new URL("../src/router/routes.ts", import.meta.url), "utf8");

check("⑩ routes.ts 不再出现「条件写反」的守卫", /!\s*to\.query\./.test(routesSource), false);
check(
  "⑪ routes.ts 不再使用已废弃的 next() 回调风格",
  /\(to,\s*_,\s*next\)/.test(routesSource),
  false,
);
check(
  "⑫ routes.ts 的 requireQuery 用法数量",
  (routesSource.match(/beforeEnter:\s*requireQuery\(/g) ?? []).length,
  10,
);
check("⑬ 不存在任何裸 beforeEnter 箭头函数", /beforeEnter:\s*\(to\)/.test(routesSource), false);

console.log("");
console.log(`通过 ${pass}/${pass + failed}`);

if (failed > 0) process.exitCode = 1;
