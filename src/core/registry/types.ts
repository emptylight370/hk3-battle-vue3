import type { ActorPanel, AttackDesc } from '@/core/types';
import type { Ctx } from '@/core/context';
import type { ActorState } from '@/core/actor';

// 钩子接口即文档：照抄 actor.ts 基类钩子签名，全部可选
export interface Hooks {
  onRoundStart?(ctx: Ctx): void;
  onAction?(ctx: Ctx): void;
  normalAttack?(ctx: Ctx): void;
  activeSkill?(ctx: Ctx): void;
  beforeHit?(ctx: Ctx, atk: AttackDesc): boolean;
  computeIncoming?(ctx: Ctx, atk: AttackDesc, raw: number): number;
  onHit?(ctx: Ctx, atk: AttackDesc): void;
  onDamaged?(ctx: Ctx, atk: AttackDesc): void;
  onLethal?(ctx: Ctx): boolean;
  onSettle?(ctx: Ctx): void;
  snapshot?(): ActorState | null;
  restore?(s: ActorState): void;
}

export type CharacterDef = ActorPanel & {
  activeInterval: number;
  vars?: Record<string, number>; // 预置 vars（数值参数入注册表，如 rewindDepth）
} & Hooks;
