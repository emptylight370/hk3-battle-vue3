import type { CharacterDef } from '../types';
import { bronya } from './bronya';
import { dreamer } from './dreamer';
import { heliya } from './heliya';
import { kelali } from './kelali';
import { kiana } from './kiana';
import { mei } from './mei';
import { rita } from './rita';
import { seele } from './seele';
import { vita } from './vita';
import { xinadia } from './xinadia';
import { youlandaier } from './youlandaier';
import { youyun } from './youyun';

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
  [youlandaier.id]: youlandaier,
  [mei.id]: mei,
  [kelali.id]: kelali,
  [bronya.id]: bronya,
  [kiana.id]: kiana,
  [heliya.id]: heliya,
  [youyun.id]: youyun,
};
