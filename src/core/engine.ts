import type { Actor } from './actor';
import { BattleCtx } from './context';
import { createRng } from './rng';
import type { BattleResult } from './types';

const MAX_ROUNDS = 100;

/**
 * 单场战斗：四节点回合循环（① 回合开始 → ② 双方行动 → ③ 状态结算 → ④ 回合结束）。
 * 引擎对角色语义零知识——只推进 ctx.round/phase、调用 Actor 钩子、做死亡兜底。
 */
export class Battle {
  private ctx: BattleCtx;
  private order: [Actor, Actor]; // 行动顺序，速度降序（构造时定死）

  /**
   * @param p1   对局甲方（同一 Actor 实例不要复用于多场战斗）
   * @param p2   对局乙方
   * @param seed 随机种子（同 seed 逐事件复现）
   */
  constructor(p1: Actor, p2: Actor, seed: number) {
    p1._side = 'p1';
    p2._side = 'p2';
    this.ctx = new BattleCtx(createRng(seed), p1, p2);
    // 先手：速度高者；同速掷随机（消耗随机流首值）
    if (p1.speed > p2.speed) this.order = [p1, p2];
    else if (p2.speed > p1.speed) this.order = [p2, p1];
    else this.order = this.ctx.rng.chance(0.5) ? [p1, p2] : [p2, p1];
    this.ctx.emit({
      type: 'battleStart',
      first: this.order[0]._side,
      round: 0,
      phase: 'roundStart',
    });
  }

  /** 运行整场战斗直至分出胜负，或达 MAX_ROUNDS（100）记平局；返回结果与完整事件流 */
  run(): BattleResult {
    const ctx = this.ctx;
    for (let rnd = 1; rnd <= MAX_ROUNDS && !ctx.finished; rnd++) {
      this.roundStart(rnd);
      if (ctx.finished) break;
      this.actions(rnd);
      if (ctx.finished) break;
      this.settle();
      ctx.phase = 'roundEnd'; // ④ 回合结束：无调用，仅推进 phase
    }
    if (!ctx.finished) ctx.finish('draw'); // 回合上限 → 平局
    return {
      outcome: ctx.resolveDeaths() ?? 'draw',
      rounds: ctx.round,
      events: ctx.events,
    };
  }

  /** ① 回合开始：快照推入（角色自管）→ 回合开始被动 → 死亡兜底 */
  private roundStart(rnd: number): void {
    const ctx = this.ctx;
    ctx.round = rnd;
    ctx.phase = 'roundStart';
    ctx.emit({ type: 'roundStart' });
    for (const a of this.order) {
      ctx.beginAction(a); // 回合开始被动（游云/时间倒转）以自身为行动方
      a.onRoundStart(ctx);
    }
    ctx.resolveDeaths();
  }

  /** ② 双方行动：封锁检查 → 分流行动 → 双向死亡兜底 */
  private actions(rnd: number): void {
    const ctx = this.ctx;
    ctx.phase = 'actions';
    for (const actor of this.order) {
      if (ctx.finished) return;
      if (!actor.isAlive) continue;

      // 无法行动（眩晕/麻痹/变身封锁）：封锁整回合，跳过不顺延（计数由结算段 −1）
      if (actor.stunRound > 0) {
        ctx.emit({ type: 'actionBlocked', reason: 'stun', side: ctx.sideOf(actor) });
        continue;
      }

      ctx.beginAction(actor);
      const activeTurn = actor.activeInterval > 0 && rnd % actor.activeInterval === 0;

      if (activeTurn && actor.noActRound > 0) {
        // 仅阻止主动技能（禁锢等）：降级为普攻，主动技节奏不顺延
        actor.normalAttack(ctx);
      } else {
        actor.onAction(ctx);
      }
      ctx.resolveDeaths(); // 双向：击杀 / 反击反杀
    }
  }

  /** ③ 状态结算：通用槽（引擎）+ 角色私有衰减（onSettle） */
  private settle(): void {
    const ctx = this.ctx;
    ctx.phase = 'settlement';
    for (const a of this.order) {
      ctx.beginAction(a); // onSettle 中 heal/施加默认以自身为行动方
      a.settleBlocks(ctx); // 封锁计数 −1 → 归零发 statusExpire
      a.settleTimed(ctx); // 限时变化计数 −1 → 归零移除并发 statusExpire
      a.sweepMarks(ctx); // 敌方标记过期
      a.onSettle(ctx); // 角色私有衰减（层数 −1 等）
    }
  }
}
