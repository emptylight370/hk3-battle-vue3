import type { Ctx } from './context';
import type { CharacterDef } from './registry/types';
import type { ActorPanel, AttackDesc, Marks, Side } from './types';

// vars 状态袋中被派生属性消费的约定键（ctx 施加限时状态时写入，导出防拼写漂移）
export const VAR = {
  atkBonus: 'atkBonus',
  tempAtk: 'tempAtk',
  defBonusPerm: 'defBonusPerm',
  tempDef: 'tempDef',
  defDown: 'defDown',
  defDownUntil: 'defDownUntil',
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
  stunRound = 0; // 眩晕/麻痹
  noActRound = 0; // 无法行动回合数
  marks: Marks = {}; // 敌方施加状态
  vars: Record<string, number> = {}; // 我方施加状态
  _side: Side = 'p1'; // 引擎注入

  // 角色回溯队列（通用容器；快照内容与还原逻辑由具体角色定义，见 snapshot/restore）
  snapQueue: ActorState[] = [];

  // 构建函数
  constructor(panel: ActorPanel & { activeInterval: number }) {
    Object.assign(this, panel);
    // ActorPanel 键名（hp/atk/def）映射到 Actor 内部字段
    this.maxHp = panel.hp;
    this.atkBase = panel.atk;
    this.defBase = panel.def;
  }

  // 获取角色状态
  get curAtk(): number {
    return this.atkBase + (this.vars[VAR.atkBonus] ?? 0) + (this.vars[VAR.tempAtk] ?? 0);
  }
  get curDef(): number {
    return Math.max(
      0,
      this.defBase + (this.vars[VAR.defBonusPerm] ?? 0) + (this.vars[VAR.tempDef] ?? 0) - (this.vars[VAR.defDown] ?? 0),
    );
  }
  get isAlive(): boolean {
    return this.hp > 0;
  }
  side(_ctx: Ctx): Side {
    return this._side;
  }

  // ---- 流程钩子：全部 no-op，未实现则跳过 ----
  // 1. 回合开始
  onRoundStart(_ctx: Ctx): void {}
  // 2. 行动
  onAction(ctx: Ctx): void {
    if (this.activeInterval > 0 && ctx.round % this.activeInterval === 0) {
      this.activeSkill(ctx);
    } else {
      this.normalAttack(ctx);
    }
  }
  // - 普通攻击
  normalAttack(ctx: Ctx): void {
    ctx.attack({ kind: 'attack', base: this.curAtk, label: '普攻' });
  }
  // - 主动技能
  activeSkill(_ctx: Ctx): void {}
  // - 受伤前闪避，返回 false = 闪避
  beforeHit(_ctx: Ctx, _atk: AttackDesc): boolean {
    return true;
  }
  // - 最终扣血覆写，返回实际扣血量（默认原样，护盾在协议层）
  computeIncoming(_ctx: Ctx, _atk: AttackDesc, raw: number): number {
    return raw;
  }
  // - 攻击后命中
  onHit(_ctx: Ctx, _atk: AttackDesc): void {}
  // - 受击后受伤，死亡在协议层
  onDamaged(_ctx: Ctx, _atk: AttackDesc): void {}
  // - 死亡前复活，返回 true = 复活
  onLethal(_ctx: Ctx): boolean {
    return false;
  }

  // 3. 回合结算，适用于状态结算，多数状态在此时-1
  onSettle(_ctx: Ctx): void {}

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
   * 注意：depth 与"回看 N 回合"的对应关系由使用它的角色校准钉死（约定 #6：回看 3 回合，非描述 4）。
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

// 构建工厂
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
  'onSettle',
  'snapshot',
  'restore',
] as const;

export function createActor(def: CharacterDef): Actor {
  const a = new Actor(def);
  Object.assign(a.vars, def.vars);
  for (const key of HOOK_KEYS) {
    const fn = def[key] as ((...args: never[]) => unknown) | undefined;
    if (fn) (a as unknown as Record<string, unknown>)[key] = fn.bind(a);
  }
  return a;
}
