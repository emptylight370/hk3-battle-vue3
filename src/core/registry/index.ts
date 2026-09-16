import type { CharacterDef } from './types';
import { CHARACTERS_202609 } from './202609';

/**
 * 注册表聚合层 —— UI / worker / simulate 的唯一合法入口。
 *
 * 版本化规则：
 * - 角色按版本目录存放（如 202609/），目录名即版本号；
 * - 聚合时按版本顺序展开，同名 id 由较新版本覆盖（后展开优先）；
 * - UI 不得 import 具体版本目录下的文件，只消费本文件导出的聚合表。
 */
/** 已注册的版本号（升序排列）；聚合时较新版本覆盖同名 id */
export const VERSIONS = ['202609'] as const;
export type VersionTag = (typeof VERSIONS)[number];
/** 最新版本号（UI 默认展示用） */
export const LATEST_VERSION: VersionTag = VERSIONS[VERSIONS.length - 1]!;

const TABLES: Record<VersionTag, Record<string, CharacterDef>> = {
  '202609': CHARACTERS_202609,
};

/** 聚合角色表（新版本覆盖同名 id） */
export const CHARACTERS: Record<string, CharacterDef> = Object.assign(
  {},
  ...VERSIONS.map((v) => TABLES[v]),
);

/** 按 id 取角色定义，未注册时抛错（fail fast，防止 UI 静默空白） */
export function getCharacter(id: string): CharacterDef {
  const def = CHARACTERS[id];
  if (!def) throw new Error(`未注册的角色 id: ${id}`);
  return def;
}

/** 供 UI 角色选择器渲染的列表（带版本标签） */
export function listCharacters(): { id: string; name: string; version: VersionTag }[] {
  return VERSIONS.flatMap((version) =>
    Object.values(TABLES[version]).map((def) => ({
      id: def.id,
      name: def.name,
      version,
    })),
  );
}
