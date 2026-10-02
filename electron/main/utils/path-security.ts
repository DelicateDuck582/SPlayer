/**
 * 文件路径安全（主进程）：受管根目录白名单与路径归属判断
 * - 受管根 = 主进程配置的缓存目录 + 用户经系统对话框选择的目录（持久化到 userData）
 * - 归属判断统一使用 path.relative，禁止前缀比较（避免兄弟目录绕过）
 * - 归属判断按真实路径（realpath）比较，防 junction/symlink 指向受管根之外
 */
import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { LocalMusicDB } from "../database/LocalMusicDB";
import { ipcLog } from "../logger";
import { useStore } from "../store";

/** 系统关键目录前缀（禁止作为受管根或删除目标） */
const PROTECTED_PATH_PREFIXES = [
  "c:\\windows",
  "c:\\program files",
  "c:\\program files (x86)",
  "c:\\programdata",
  "/system",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/var",
  "/library",
];

/** 授权目录数量上限 */
const MAX_APPROVED_ROOTS = 256;

/** 真实路径解析时向上查找的最大层级（目标尚不存在时以最近存在祖先为基准） */
const REALPATH_MAX_DEPTH = 8;

/** 启动时确定的受管根（内置缓存与历史本地库），淘汰顺序晚于运行期授权根 */
let baseRoots: string[] | null = null;
/** 运行期新授权的受管根（超上限时优先淘汰最早的） */
let dynamicRoots: string[] = [];
/** 永不淘汰的受管根键（内置缓存根、当前缓存目录），随缓存配置变化重算 */
let essentialKeys: Set<string> = new Set();

/** 路径比较键（Windows 大小写不敏感） */
const pathKey = (target: string): string =>
  process.platform === "win32" ? target.toLowerCase() : target;

/** 解析真实路径（失败时返回原值），用于消除 junction/符号链接 */
const tryRealPath = (target: string): string => {
  try {
    return realpathSync.native(target);
  } catch {
    return target;
  }
};

/**
 * 解析真实路径：目标不存在时以最近存在的祖先目录为基准拼接剩余部分
 * @param target 绝对路径
 * @returns 真实路径（无法解析时返回字面量解析结果）
 */
const resolveRealPath = (target: string): string => {
  const resolved = resolve(target);
  let current = resolved;
  const pending: string[] = [];
  for (let depth = 0; depth < REALPATH_MAX_DEPTH; depth += 1) {
    try {
      const real = realpathSync.native(current);
      return pending.length > 0 ? join(real, ...pending.reverse()) : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      pending.push(basename(current));
      current = parent;
    }
  }
  return resolved;
};

/** 受管根统一按真实路径存储 */
const normalizeRoot = (dir: string): string => tryRealPath(resolve(dir));

/**
 * 判断路径是否位于系统关键目录内
 * @param filePath 绝对路径
 * @returns 是否受保护
 */
export const isProtectedSystemPath = (filePath: string): boolean => {
  const normalized = resolve(filePath).toLowerCase();
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) =>
      normalized === prefix ||
      normalized.startsWith(`${prefix}/`) ||
      normalized.startsWith(`${prefix}\\`),
  );
};

/**
 * 判断目录是否为盘根或盘根一级目录（如 C:\、C:\Users）
 * @param dir 绝对路径
 * @returns 是否为盘根或其一级目录
 */
export const isRootOrTopLevelDir = (dir: string): boolean => {
  const resolved = resolve(dir);
  const parent = dirname(resolved);
  // 自身为盘根，或父目录仍为盘根（即自身是盘根一级目录）
  return parent === resolved || dirname(parent) === parent;
};

/**
 * 判断 target 是否位于 root 目录内或与 root 相同
 * @param target 待判断路径
 * @param root 根目录
 * @param allowRoot target 与 root 相同是否算通过（目录参数需要）
 * @returns 是否位于根目录内
 */
export const isPathWithin = (target: string, root: string, allowRoot = false): boolean => {
  if (!target || !root) return false;
  const rel = relative(resolve(root), resolve(target));
  if (rel === "") return allowRoot;
  // 仅排除真正的上级目录，避免误伤「..foo」这类文件名
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};

/** 授权目录记录文件路径 */
const getApprovedFilePath = (): string => join(app.getPath("userData"), "approved-paths.json");

/**
 * 读取已授权目录（解析失败视为无授权）
 */
const readApprovedRoots = (): string[] => {
  try {
    const filePath = getApprovedFilePath();
    if (!existsSync(filePath)) return [];
    const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as { roots?: unknown };
    if (!Array.isArray(parsed?.roots)) return [];
    return parsed.roots
      .filter((item): item is string => typeof item === "string" && item.trim() !== "")
      .map((item) => normalizeRoot(item));
  } catch (error) {
    ipcLog.warn("[PathSecurity] 读取授权目录失败:", error);
    return [];
  }
};

/**
 * 持久化已授权目录
 */
const persistApprovedRoots = (roots: string[]): void => {
  try {
    const filePath = getApprovedFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 1, roots }, null, 2), "utf-8");
  } catch (error) {
    ipcLog.warn("[PathSecurity] 保存授权目录失败:", error);
  }
};

/** 判断目录是否存在且为目录 */
export const isExistingDirectory = (dir: unknown): boolean => {
  if (typeof dir !== "string" || !dir.trim() || !isAbsolute(dir)) return false;
  try {
    return statSync(resolveRealPath(dir)).isDirectory();
  } catch {
    return false;
  }
};

/** 计算永不淘汰的根键（内置缓存根 + 当前缓存目录） */
const collectEssentialKeys = (): Set<string> => {
  const keys = new Set<string>();
  const pushKey = (dir?: string) => {
    if (dir && isAbsolute(dir)) keys.add(pathKey(normalizeRoot(dir)));
  };
  try {
    pushKey(join(app.getPath("userData"), "DataCache"));
    pushKey(useStore().get("cachePath"));
  } catch (error) {
    ipcLog.warn("[PathSecurity] 计算关键受管根失败:", error);
  }
  return keys;
};

/** 根条目是否为关键根（自身即关键根，或包含关键根） */
const isEssentialRoot = (root: string): boolean => {
  for (const key of essentialKeys) {
    if (pathKey(root) === key || isPathWithin(key, root, true)) return true;
  }
  return false;
};

/**
 * 裁剪授权列表：超上限时优先淘汰最早的运行期授权根，其次最早的启动根，关键根永不淘汰
 * @param base 启动根列表
 * @param dynamic 运行期授权根列表
 * @returns 裁剪后的两组授权根
 */
const trimRoots = (base: string[], dynamic: string[]): { base: string[]; dynamic: string[] } => {
  let overflow = base.length + dynamic.length - MAX_APPROVED_ROOTS;
  if (overflow <= 0) return { base, dynamic };
  const keepList = (list: string[]): string[] => {
    const kept: string[] = [];
    for (const root of list) {
      if (overflow > 0 && !isEssentialRoot(root)) {
        overflow -= 1;
        ipcLog.info(`[PathSecurity] 超出授权上限，淘汰目录: ${root}`);
        continue;
      }
      kept.push(root);
    }
    return kept;
  };
  const keptDynamic = keepList(dynamic);
  return { base: keepList(base), dynamic: keptDynamic };
};

/**
 * 收集首次运行的初始受管根目录
 * 迁移历史本地音乐目录 + 当前缓存目录 + 内置默认缓存目录
 */
const collectInitialRoots = (): string[] => {
  const roots: string[] = [];
  /** 去重追加（含父子包含关系判断） */
  const pushRoot = (dir: string) => {
    if (!dir || !isAbsolute(dir)) return;
    const target = normalizeRoot(dir);
    // 拒绝系统目录、盘根与盘根一级目录，避免整盘被纳入受管范围
    if (isProtectedSystemPath(target) || isRootOrTopLevelDir(target)) return;
    if (roots.some((root) => isPathWithin(target, root, true))) return;
    for (let i = roots.length - 1; i >= 0; i -= 1) {
      if (isPathWithin(roots[i], target, true)) roots.splice(i, 1);
    }
    roots.push(target);
  };
  try {
    // 内置默认缓存目录（便携模式切换后仍可使用）
    pushRoot(join(app.getPath("userData"), "DataCache"));
    const cachePath = useStore().get("cachePath");
    if (cachePath) pushRoot(cachePath);
    // 历史本地音乐目录
    if (cachePath) {
      const dbPath = join(cachePath, "local-data", "library.db");
      const jsonPath = join(cachePath, "local-data", "library.json");
      // 老版本仅存在 library.json，需先迁移到 DB 才能收集到本地目录
      if (existsSync(dbPath) || existsSync(jsonPath)) {
        const db = new LocalMusicDB(dbPath);
        try {
          db.init();
          db.migrateFromJsonIfNeededSync(jsonPath);
          for (const trackPath of db.getAllPaths()) {
            pushRoot(dirname(trackPath));
            if (roots.length >= MAX_APPROVED_ROOTS) break;
          }
        } finally {
          db.close();
        }
      }
    }
    if (roots.length > 0) {
      ipcLog.info(`[PathSecurity] 首次运行初始化受管根目录 ${roots.length} 个`);
    }
  } catch (error) {
    ipcLog.warn("[PathSecurity] 初始化受管根目录失败:", error);
  }
  return roots;
};

/**
 * 初始化受管根目录（应在创建窗口前调用，避免渲染层抢先触发初始化）
 */
export const initManagedRoots = (): void => {
  if (baseRoots) return;
  const approved = readApprovedRoots();
  if (approved.length === 0) {
    // 无授权记录视为首次运行：初始化受管根并落盘，后续不再自动扩充
    baseRoots = collectInitialRoots();
    dynamicRoots = [];
    persistApprovedRoots(baseRoots);
  } else {
    baseRoots = approved;
    dynamicRoots = [];
  }
  essentialKeys = collectEssentialKeys();
};

/**
 * 记录用户经系统对话框选择的目录（唯一授权入口）
 * @param dir 对话框返回的目录
 */
export const approveDirectory = (dir: unknown): void => {
  if (typeof dir !== "string" || !dir.trim() || !isAbsolute(dir)) return;
  const target = normalizeRoot(dir);
  if (isProtectedSystemPath(target)) {
    ipcLog.warn(`[PathSecurity] 拒绝授权系统目录: ${target}`);
    return;
  }
  if (!baseRoots) initManagedRoots();
  // 已被现有根覆盖时不重复记录
  const roots = [...(baseRoots ?? []), ...dynamicRoots];
  if (roots.some((root) => isPathWithin(target, root, true))) return;
  // 缓存配置可能已变化，重新计算关键根
  essentialKeys = collectEssentialKeys();
  // 新目录包含旧根时清理冗余项
  const keepRoot = (root: string) => !isPathWithin(root, target, true);
  const trimmed = trimRoots((baseRoots ?? []).filter(keepRoot), [
    ...dynamicRoots.filter(keepRoot),
    target,
  ]);
  baseRoots = trimmed.base;
  dynamicRoots = trimmed.dynamic;
  persistApprovedRoots([...baseRoots, ...dynamicRoots]);
  ipcLog.info(`[PathSecurity] 已授权目录: ${target}`);
};

/**
 * 获取当前受管根目录集合（缓存目录在初始化时已纳入）
 */
export const getManagedRoots = (): string[] => {
  if (!baseRoots) initManagedRoots();
  return [...(baseRoots ?? []), ...dynamicRoots];
};

/**
 * 判断路径是否位于任一受管根目录内
 * @param target 待判断路径
 * @param allowRoot target 与根目录相同是否算通过（目录参数需要）
 * @returns 是否受管
 */
export const isManagedPath = (target: unknown, allowRoot = false): boolean => {
  if (typeof target !== "string" || !target.trim()) return false;
  // 以真实路径判定：junction/符号链接指向受管根之外时一律拒绝
  const realPath = resolveRealPath(target);
  return getManagedRoots().some((root) => isPathWithin(realPath, root, allowRoot));
};
