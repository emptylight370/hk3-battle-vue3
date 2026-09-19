import { CHARACTERS_202609 } from './202609';
import type { CharacterDef } from './types';

/**
 * 注册表聚合层 —— UI / worker / simulate 的唯一合法入口。
 *
 * 版本化规则：
 * - 角色按版本目录存放（如 202609/），目录名即版本号；
 * - VERSIONS 升序排列，用于确定版本先后顺序；
 * - 注册条目（ENTRIES）在注册时即标定所属版本；
 * - **前端显示不覆盖**：listCharacters 按版本号降序排列（最新在前），
 *   同名 id 的不同版本共存于列表，由版本标签辅助区分；
 * - 按 id 调用（getCharacter / CHARACTERS）仍是"最新版本优先"——
 *   旧版本数据请用 getCharacterIn 钉死版本（回归测试用）；
 * - UI 不得 import 具体版本目录下的文件，只消费本文件导出的 API。
 */
/** 已注册的版本号（升序排列，用于确定版本顺序） */
export const VERSIONS = ['202609'] as const;
export type VersionTag = (typeof VERSIONS)[number];
/** 最新版本号（UI 默认展示用） */
export const LATEST_VERSION: VersionTag = VERSIONS[VERSIONS.length - 1]!;

const TABLES: Record<VersionTag, Record<string, CharacterDef>> = {
  '202609': CHARACTERS_202609,
};

/** 注册条目：注册时即标定所属版本 */
interface CharacterEntry {
  def: CharacterDef;
  version: VersionTag;
}

/** 注册条目表（同 id 跨版本共存，不覆盖） */
const ENTRIES: CharacterEntry[] = VERSIONS.flatMap((version) =>
  Object.values(TABLES[version]).map((def) => ({ def, version })),
);

/** 聚合角色表（按 id 调用：同名 id 由较新版本覆盖；显示场景请用 listCharacters） */
export const CHARACTERS: Record<string, CharacterDef> = Object.assign({}, ...VERSIONS.map((v) => TABLES[v]));

/** 按 id 取角色定义（最新版本优先），未注册时抛错（fail fast，防止 UI 静默空白） */
export function getCharacter(id: string): CharacterDef {
  const def = CHARACTERS[id];
  if (!def) throw new Error(`未注册的角色 id: ${id}`);
  return def;
}

/**
 * 版本化取角：只在指定版本的表中查找，跨版本不回退。
 *
 * - 供回归测试等需要"钉死版本数据"的场景使用；
 * - 新版本合入后，带旧版本参数的既有测试继续测旧版本数据，
 *   不会因聚合表被新版本覆盖而漂移；
 * - 版本不存在或该版本内无此 id 均抛错（与聚合取角同样 fail fast）。
 */
export function getCharacterIn(version: VersionTag, id: string): CharacterDef {
  const def = TABLES[version]?.[id];
  if (!def) throw new Error(`版本 ${version} 中未注册的角色 id: ${id}`);
  return def;
}

/**
 * 供 UI 角色选择器渲染的列表（带版本标签）。
 *
 * - **版本号降序**（最新版本在前）；
 * - **同名 id 不覆盖**：不同版本的同名角色共存于列表，由 version 区分。
 */
export function listCharacters(): { id: string; name: string; version: VersionTag }[] {
  return ENTRIES.slice()
    .sort((a, b) => VERSIONS.indexOf(b.version) - VERSIONS.indexOf(a.version))
    .map(({ def, version }) => ({ id: def.id, name: def.name, version }));
}
