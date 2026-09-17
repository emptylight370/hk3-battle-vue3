import { Battle } from '@/core/engine';
import { createActor, type Actor } from '@/core/actor';
import { getCharacter } from '@/core/registry';
import type { CharacterDef } from '@/core/registry/types';
import type { BattleEvent, BattleResult } from '@/core/types';

// ============================================================
// 测试共享工具 —— 回归 / 官方日志复现 / 角色单测共用
// ============================================================

/** 按注册表 id 取角色定义（未注册即抛错） */
export function byId(id: string): CharacterDef {
  return getCharacter(id);
}

/**
 * 按注册表 id 构建并运行一场战斗。
 * 同 seed 逐事件复现；返回结果附带双方 Actor 引用（断言终态用）。
 */
export function runBattle(
  p1Id: string,
  p2Id: string,
  seed: number,
): BattleResult & { p1: Actor; p2: Actor } {
  const p1 = createActor(byId(p1Id));
  const p2 = createActor(byId(p2Id));
  const b = new Battle(p1, p2, seed);
  const r = b.run();
  return { ...r, p1, p2 };
}

/** 过滤指定类型的事件，并收窄到对应的事件成员类型 */
export function of<T extends BattleEvent['type']>(
  events: BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}

/** 伤害序列（逐段 dealt，按发出顺序）——官方日志对账的主对账物 */
export function damageSeq(events: BattleEvent[]): number[] {
  return of(events, 'damage').map((e) => (e as { dealt: number }).dealt);
}

/**
 * 事件流完整签名：回归基准的存档形态。
 * 覆盖全部字段（含 round/phase），任何行为漂移都会导致签名变化。
 */
export function fullSig(events: BattleEvent[]): string {
  return JSON.stringify(events);
}

export interface BattleBaseline {
  outcome: string;
  rounds: number;
  sig: string;
}

/** 生成一场对局的基准快照 */
export function baselineOf(r: BattleResult): BattleBaseline {
  return { outcome: r.outcome, rounds: r.rounds, sig: fullSig(r.events) };
}

/**
 * 种子扫描：在 [from, to] 中寻找"伤害序列逐点匹配 expected 前缀"的种子。
 * 官方日志复现的第一步——先扫种子，再对找到的种子做逐点断言。
 */
export function scanSeed(
  p1Id: string,
  p2Id: string,
  expected: number[],
  from = 1,
  to = 20000,
): number[] {
  const hits: number[] = [];
  for (let seed = from; seed <= to; seed++) {
    const r = runBattle(p1Id, p2Id, seed);
    const seq = damageSeq(r.events);
    if (seq.length >= expected.length && expected.every((v, i) => seq[i] === v)) {
      hits.push(seed);
      if (hits.length >= 5) break; // 找到几个够用即止
    }
  }
  return hits;
}
