import type { Ctx } from './context';
import type { CharacterDef } from './registry/types';
import type { ActorPanel, AttackDesc, Marks, Side } from './types';

/**
 * vars 约定键：永久攻防变化值（正 = 提升，负 = 降低）。
 * 只由 ctx.atkUp/atkDown/defUp/defDown 累加，角色钩子不要直写（会绕过封锁检查）。
 * 限时变化不走 vars，见 timedAtk/timedDef。
 */
export const VAR = {
  atkBonus: 'atkBonus',
  defBonus: 'defBonus',
} as const;

export class Actor {
  // 角色面板（id/name 由构造函数 Object.assign 注入，断言确定赋值）
  readonly id!: string;
  readonly name!: string;
  maxHp = 0;
  atkBase = 0;
  defBase = 0;
  speed = 0;
  activeInterval = 0;

  // 通用流程状态（引擎/管线读写）
  hp = 0;
  shield = 0;
  stunRound = 0; // 眩晕/麻痹（封锁全部行动，结算段 −1）
  noActRound = 0; // 仅阻止主动技能（禁锢等，结算段 −1）
  noGainAtkRound = 0; // 封锁攻击获得（结算段 −1；>0 时新的攻击提升无效）
  noGainDefRound = 0; // 封锁防御获得（结算段 −1；>0 时新的防御提升无效）
  timedAtk: Record<string, TimedChange> = {}; // 限时攻击变化：标记 → { value 带符号, rounds, status }
  timedDef: Record<string, TimedChange> = {}; // 限时防御变化：同上；重复施加相同标记 = 刷新
  marks: Marks = {}; // 敌方施加状态
  vars: Record<string, number> = {}; // 我方施加状态
  _side: Side = 'p1'; // 引擎注入
  blockStatus: Record<string, string> = {}; // 封锁状态名字典：计数器字段名 → 状态名（到期时还原）

  // 角色回溯队列（通用容器；快照内容与还原逻辑由具体角色定义，见 snapshot/restore）
  snapQueue: ActorState[] = [];

  // 构建函数
  constructor(panel: ActorPanel & { activeInterval: number }) {
    Object.assign(this, panel);
    // ActorPanel 键名（hp/atk/def）映射到 Actor 内部字段
    this.maxHp = panel.hp;
    this.atkBase = panel.atk;
    this.defBase = panel.def;
    // 克隆引用型字段：切断与注册表 def 的共享，防止跨战斗状态残留（确定性根基）
    this.vars = { ...this.vars };
    this.marks = { ...this.marks };
    this.timedAtk = { ...this.timedAtk };
    this.timedDef = { ...this.timedDef };
  }

  /** 当前攻击力 = max(0, atkBase + atkBonus（永久变化值，正增负减） + Σ 限时攻击变化) */
  get curAtk(): number {
    const timed = Object.values(this.timedAtk).reduce((s, e) => s + e.value, 0);
    return Math.max(0, this.atkBase + (this.vars[VAR.atkBonus] ?? 0) + timed);
  }
  /** 当前防御 = max(0, defBase + defBonus（永久变化值） + Σ 限时防御变化) */
  get curDef(): number {
    const timed = Object.values(this.timedDef).reduce((s, e) => s + e.value, 0);
    return Math.max(0, this.defBase + (this.vars[VAR.defBonus] ?? 0) + timed);
  }
  /** 是否存活（hp > 0） */
  get isAlive(): boolean {
    return this.hp > 0;
  }
  /** 本 Actor 的阵营（引擎构建对局时注入） */
  side(_ctx: Ctx): Side {
    return this._side;
  }

  // ---- 流程钩子：全部 no-op，"未实现即正常继续"；注册表函数体经 createActor 绑定覆写 ----

  /** ① 回合开始 */
  onRoundStart(_ctx: Ctx): void {}
  /** ② 行动入口：默认按 activeInterval 分流主动技/普攻（注册表不要重复实现分流） */
  onAction(ctx: Ctx): void {
    if (this.activeInterval > 0 && ctx.round % this.activeInterval === 0) {
      this.activeSkill(ctx);
    } else {
      this.normalAttack(ctx);
    }
  }
  /** 默认普攻：走完整攻击管线（base = curAtk）；普攻特化在此覆写 */
  normalAttack(ctx: Ctx): void {
    ctx.attack({ kind: 'attack', base: this.curAtk, label: '普攻' });
  }
  /** 主动技：默认 no-op（声明了 activeInterval 的角色必须覆写，否则该回合空过） */
  activeSkill(_ctx: Ctx): void {}
  /** 受击方：命中前拦截，返回 false = 被闪避（闪避覆写；仅 attack 类触发） */
  beforeHit(_ctx: Ctx, _atk: AttackDesc): boolean {
    return true;
  }
  /** 受击方：最终扣血覆写，返回实扣数；只允许改数字，护盾/扣血路径留在协议层 */
  computeIncoming(_ctx: Ctx, _atk: AttackDesc, raw: number): number {
    return raw;
  }
  /** 攻击方：命中后（眩晕/护盾/灼光累积；仅 attack 类且未击杀时触发） */
  onHit(_ctx: Ctx, _atk: AttackDesc): void {}
  /** 受击方：受击后每段伤害独立触发；死亡目标由协议早退（约定 #9） */
  onDamaged(_ctx: Ctx, _atk: AttackDesc): void {}
  /** 受击方：致命伤拦截，返回 true = 复活（回血由钩子自行设置自身 hp） */
  onLethal(_ctx: Ctx): boolean {
    return false;
  }
  /** 自身被施加状态时的被动感知（封锁/降防/敌方标记；自身 vars 增益不触发） */
  onStatusApply(_ctx: Ctx, _status: string, _sourceId: string): void {}

  /** ③ 结算：角色私有衰减；通用槽由 settle* 系列处理 */
  onSettle(_ctx: Ctx): void {}

  /** 封锁计数 −1（stunRound/noActRound/noGainAtkRound/noGainDefRound）；归零时按 blockStatus 字典发 statusExpire */
  settleBlocks(ctx: Ctx): void {
    for (const key of ['stunRound', 'noActRound', 'noGainAtkRound', 'noGainDefRound'] as const) {
      if (this[key] > 0) {
        this[key]--;
        if (this[key] === 0 && this.blockStatus[key]) {
          ctx.emitFor(this, { type: 'statusExpire', status: this.blockStatus[key]! });
          delete this.blockStatus[key];
        }
      }
    }
  }
  /** 限时变化结算：各标记计数 −1，归零移除并发 statusExpire（状态名 = 施加时的标记） */
  settleTimed(ctx: Ctx): void {
    for (const key of ['timedAtk', 'timedDef'] as const) {
      const table = this[key];
      for (const tag of Object.keys(table)) {
        const e = table[tag]!;
        e.rounds--;
        if (e.rounds <= 0) {
          ctx.emitFor(this, { type: 'statusExpire', status: e.status });
          delete table[tag];
        }
      }
    }
  }
  /** 扫描敌方施加的到期标记，逐个发 statusExpire（sourceId 从键名前缀还原施加者） */
  sweepMarks(ctx: Ctx): void {
    for (const key of Object.keys(this.marks)) {
      if (this.marks[key]!.until < ctx.round) {
        const dot = key.indexOf('.');
        ctx.emitFor(this, {
          type: 'statusExpire',
          status: dot > 0 ? key.slice(dot + 1) : key,
          sourceId: dot > 0 ? key.slice(0, dot) : undefined,
        });
        delete this.marks[key];
      }
    }
  }

  // ---- 快照/回溯钩子：基类挂空，由具体角色覆写；外部（引擎/ctx）经此统一调用 ----

  /** 产出当前状态快照；无快照能力的角色保持返回 null */
  snapshot(): ActorState | null {
    return null;
  }

  /** 应用一份由本角色 snapshot() 产出的快照；还原哪些字段由角色自定义 */
  restore(_s: ActorState): void {}

  /**
   * 通用队列工具：推入当前快照并裁剪至 depth，返回队列头（历史不足取最早）。
   * 无快照能力（snapshot() 返回 null）时原样返回 null。
   * 注意：depth 与"回看 N 回合"的对应关系由使用它的角色校准。
   */
  pushSnapshot(depth: number): ActorState | null {
    const s = this.snapshot();
    if (s === null) return null;
    this.snapQueue.push(s);
    if (this.snapQueue.length > depth) this.snapQueue.shift();
    return this.snapQueue[0] as ActorState;
  }
}

// 快照数据：不透明容器，形状由产出它的角色自定义，外部只透传不解释
export interface ActorState {
  [key: string]: unknown;
}

/** 限时攻防变化条目（timedAtk/timedDef 的值；重复施加相同标记 = 刷新覆盖） */
export interface TimedChange {
  value: number; // 带符号变化量（正 = 提升，负 = 降低）
  rounds: number; // 剩余回合数（含施加回合）
  status: string; // 状态名（statusApply/statusExpire 事件用）
}

// 注册表可覆写的钩子键（createActor 按此绑定函数体）
const HOOK_KEYS = [
  'onRoundStart',
  'onAction',
  'normalAttack',
  'activeSkill',
  'beforeHit',
  'computeIncoming',
  'onHit',
  'onDamaged',
  'onLethal',
  'onStatusApply',
  'onSettle',
  'snapshot',
  'restore',
] as const;

/** 实例化角色：注册表函数体按 HOOK_KEYS 绑定为实例方法，未覆写的钩子落到基类 no-op */
export function createActor(def: CharacterDef): Actor {
  const a = new Actor(def);
  Object.assign(a.vars, def.vars);
  for (const key of HOOK_KEYS) {
    const fn = def[key] as ((...args: never[]) => unknown) | undefined;
    if (fn) (a as unknown as Record<string, unknown>)[key] = fn.bind(a);
  }
  return a;
}
