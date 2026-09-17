import type { ActorState } from '@/core/actor';
import type { Ctx } from '@/core/context';
import type { ActorPanel, AttackDesc } from '@/core/types';

/**
 * 角色钩子接口（全部可选）——"未实现即正常继续"。
 * 各钩子的触发时机与 self/target 语义见同目录 CTX_API.md §7。
 */
export interface Hooks {
  /** ① 回合开始：时间倒转/游云等回合开始被动（含自管快照推入，可致死） */
  onRoundStart?(ctx: Ctx): void;
  /** ② 行动入口（默认按 activeInterval 分流主动技/普攻，一般无需覆写） */
  onAction?(ctx: Ctx): void;
  /** 普攻（默认走完整攻击管线；标记双击等普攻特化在此覆写） */
  normalAttack?(ctx: Ctx): void;
  /** 主动技：只写技能效果本身，节奏由 activeInterval 决定 */
  activeSkill?(ctx: Ctx): void;
  /** 受击方：命中前拦截，返回 false = 被闪避（幻象闪避覆写；仅 attack 类触发） */
  beforeHit?(ctx: Ctx, atk: AttackDesc): boolean;
  /** 受击方：最终扣血覆写（只允许改数字，护盾/扣血路径留在协议层） */
  computeIncoming?(ctx: Ctx, atk: AttackDesc, raw: number): number;
  /** 攻击方：命中后（眩晕/护盾/灼光累积；仅 attack 类且未击杀时触发） */
  onHit?(ctx: Ctx, atk: AttackDesc): void;
  /** 受击方：受击后（判花/判魅惑），每段伤害独立触发；死亡目标由协议早退 */
  onDamaged?(ctx: Ctx, atk: AttackDesc): void;
  /** 受击方：致命伤拦截，返回 true = 复活（回血由钩子自行设置自身 hp） */
  onLethal?(ctx: Ctx): boolean;
  /** 自身被施加状态时的被动感知（封锁/降防/敌方标记；自身 vars 增益不触发） */
  onStatusApply?(ctx: Ctx, status: string, sourceId: string): void;
  /** ③ 结算：角色私有衰减（层数 −1 等）；通用槽由引擎结算段处理 */
  onSettle?(ctx: Ctx): void;
  /** 产出自身状态快照（时间倒转用）；无快照能力保持缺省（返回 null） */
  snapshot?(): ActorState | null;
  /** 还原一份由本角色 snapshot() 产出的快照 */
  restore?(s: ActorState): void;
}

export type CharacterDef = ActorPanel & {
  activeInterval: number;
  vars?: Record<string, number>; // 预置 vars（数值参数入注册表，如 rewindDepth）
} & Hooks;
