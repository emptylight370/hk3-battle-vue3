import { Battle } from '@/core/engine';
import { createActor, type Actor } from '@/core/actor';
import { getCharacterIn, LATEST_VERSION, type VersionTag } from '@/core/registry';
import type { CharacterDef } from '@/core/registry/types';
import type { BattleEvent, BattleResult } from '@/core/types';

// ============================================================
// 测试共享工具 —— 回归 / 角色单测 / 批量层共用
//
// 角色一律按版本取用（getCharacterIn）：回归测试钉死版本数据，
// 后续合入新版本注册表时，旧测试继续测旧版本，不随聚合表漂移。
// ============================================================

/** 按版本 + id 取角色定义（该版本内未注册即抛错，不跨版本回退；缺省 = 最新版本） */
export function byId(id: string, version: VersionTag = LATEST_VERSION): CharacterDef {
  return getCharacterIn(version, id);
}

/**
 * 按注册表 id 构建并运行一场战斗（版本化取角，缺省 = 最新版本）。
 * 同 seed 逐事件复现；返回结果附带双方 Actor 引用（断言终态用）。
 */
export function runBattle(
  p1Id: string,
  p2Id: string,
  seed: number,
  version: VersionTag = LATEST_VERSION,
): BattleResult & { p1: Actor; p2: Actor } {
  const p1 = createActor(byId(p1Id, version));
  const p2 = createActor(byId(p2Id, version));
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
