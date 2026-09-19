import { createActor } from './actor';
import { Battle } from './engine';
import { getCharacter, getCharacterIn, type VersionTag } from './registry';
import type { BatchRequest, BatchResult, BattleResult } from './types';

// ============================================================
// 批量统计层 —— UI 的唯一数据源（M2）
//
// 设计要点：
// 1. seed 派生策略（写死）：第 i 场使用 seed + i（i 从 0 起）。
//    每场独立满种子、互不重叠，且任意一场可单独用 runOne(seed + i) 复现。
// 2. 只消费 outcome，不留事件：每场 Battle 的 events 随作用域 GC，
//    大批量无内存压力；logFirst 时仅保留第 0 场的事件流。
// 3. 纯同步纯函数：不碰 Worker / Vue，Worker 只是它的薄包装，
//    Node 测试环境可直接单测。
// 4. 角色解析：带版本时精确命中该版本（getCharacterIn，不回退）——
//    前端选的是哪个版本就调用哪个版本，不因新版本覆盖而调错；
//    缺省版本时按聚合表最新优先。
// ============================================================

/** 按版本解析角色定义：version 缺省 = 聚合表最新优先 */
function resolve(id: string, version?: string) {
  return version ? getCharacterIn(version as VersionTag, id) : getCharacter(id);
}

/** 运行单场对局（按注册表 id + 可选版本构建，未注册即抛错） */
export function runOne(p1Id: string, p2Id: string, seed: number, p1Version?: string, p2Version?: string): BattleResult {
  const battle = new Battle(createActor(resolve(p1Id, p1Version)), createActor(resolve(p2Id, p2Version)), seed);
  return battle.run();
}

/**
 * 批量对局统计。
 * @param req         批量请求（p1/p2 角色 id、场数、基准种子、logFirst）
 * @param onProgress  进度回调（已完成场数 / 总场数），Worker 用它上报进度
 */
export function batch(req: BatchRequest, onProgress?: (done: number, total: number) => void): BatchResult {
  const result: BatchResult = {
    p1: req.p1,
    p2: req.p2,
    p1Win: 0,
    p2Win: 0,
    draw: 0,
  };

  for (let i = 0; i < req.count; i++) {
    const r = runOne(req.p1, req.p2, req.seed + i, req.p1Version, req.p2Version);
    if (r.outcome === 'p1') result.p1Win++;
    else if (r.outcome === 'p2') result.p2Win++;
    else result.draw++;

    if (req.logFirst && i === 0) result.firstEvents = r.events;
    onProgress?.(i + 1, req.count);
  }

  return result;
}
