import type { CharacterDef } from '../types';
import { seele } from './seele';
import { vita } from './vita';
import { xinadia } from './xinadia';
import { rita } from './rita';
import { dreamer } from './dreamer';

/**
 * 202609 版本角色表（数值以 2026-09 官方数据校准）
 * 新角色加入本版本：新建 <角色id>.ts 并在此注册；
 * 新版本：整目录复制改名（如 202703/），修改数值后在新目录 index 注册——相对路径引用无需改动。
 */
export const CHARACTERS_202609: Record<string, CharacterDef> = {
  [vita.id]: vita,
  [xinadia.id]: xinadia,
  [seele.id]: seele,
  [rita.id]: rita,
  [dreamer.id]: dreamer,
};
