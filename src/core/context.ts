import type { Actor } from './actor';
import { VAR } from './actor';
import type { Rng } from './rng';
import type {
  AttackDesc,
  BattleEvent,
  EventInput,
  HitResult,
  MarkState,
  Outcome,
  RoundPhase,
  Side,
  StatusName,
} from './types';

/**
 * 封锁范围：
 * - 'action'  封锁全部行动（stunRound）
 * - 'active'  仅阻止主动技能（noActRound）
 * - 'atkUp'   封锁攻击获得（noGainAtkRound）：期间 ctx.atkUp 对目标无效
 * - 'defUp'   封锁防御获得（noGainDefRound）：期间 ctx.defUp 对目标无效
 */
export type BlockScope = 'action' | 'active' | 'atkUp' | 'defUp';

/** 增益时长：perm = 永久（atkBonus/defBonus）；temp = 回合内（tempAtk/tempDef，结算清零） */
export type GainDuration = 'perm' | 'temp';

// ============================================================
// Ctx 接口：角色钩子可见的世界入口（实现 = BattleCtx）
// 角色钩子永不直接摸引擎或对方面板，一切通过 Ctx
// ============================================================
export interface Ctx {
  /** 当前回合号（1 起；battleStart 事件使用 0） */
  readonly round: number;
  /** 当前阶段：'roundStart' | 'actions' | 'settlement' | 'roundEnd' */
  readonly phase: RoundPhase;
  /** 战斗是否已分出胜负（true 后所有攻击空转） */
  readonly finished: boolean;
  /** 本场战斗的确定性随机源（掷骰必须经此，禁止 Math.random） */
  readonly rng: Rng;
  /** 对局双方引用（按阵营，非行动顺序） */
  readonly p1: Actor;
  readonly p2: Actor;
  /** 已发出的事件流（只读；单场带日志运行的结果即此数组） */
  readonly events: readonly BattleEvent[];
  /** 当前行动方（引擎在每次行动/结算前设置） */
  self: Actor;
  /** 当前受击方 */
  target: Actor;

  /** 引擎内部：设置行动方/受击方上下文（角色钩子不要调用） */
  beginAction(actor: Actor): void;
  /** 查询某 Actor 的阵营 */
  sideOf(a: Actor): Side;
  /** 发出事件；省略的 round/phase 自动补当前值 */
  emit(e: EventInput): void;
  /** 发出事件并自动补 side（取 actor 阵营） */
  emitFor(actor: Actor, e: EventInput): void;

  // ---- 攻击协议（kind 矩阵集中实现；使用指南见 registry/CTX_API.md）----

  /**
   * 完整攻击管线（攻击动作）：闪避判定 → 伤害 → 护盾/复活 → onDamaged → onHit
   * 伤害公式：raw = max(1, round(base × (mult ?? 1)) − 目标.curDef)
   * @param desc 攻击描述（kind/base/label/mult/hits）
   * @param who  生效目标，缺省 = ctx.target（受击钩子反击攻击方时传 ctx.self，如丽塔谍影重重）
   */
  /**
   * 唯一的伤害入口：四种伤害类型由 desc.kind 区分（attack/segment/flat/pierce）。
   * @param who  生效目标，缺省 = ctx.target（受击钩子反击攻击方时传 ctx.self）
   */
  attack(desc: AttackDesc, who?: Actor): HitResult;

  // ---- 资源与状态施加 ----

  /** 回血并封顶 maxHp，发 heal 事件；默认作用于自身 */
  heal(amount: number, who?: Actor): void;
  /** 为自身加护盾，发 shieldGain 事件 */
  shieldGain(value: number): void;
  /**
   * 施加封锁类状态（调用方给状态名，scope 选择封锁范围）
   * @param status 状态名（进 statusApply/statusExpire 事件）
   * @param rounds 持续回合数，含施加回合（约定 #1）；重复施加刷新为满时长（约定 #2）
   * @param scope  'action' 封锁全部行动；'active' 仅阻止主动技能；
   *               'atkUp' 封锁攻击获得（期间对目标的 ctx.atkUp 无效）；
   *               'defUp' 封锁防御获得（期间对目标的 ctx.defUp 无效）
   */
  block(target: Actor, status: StatusName, rounds: number, scope: BlockScope): void;
  /**
   * 攻击变化（增益/减益统一入口）
   * @param target   生效目标（封锁检查作用于它）
   * @param value    变化幅度：正 = 提升，负 = 降低
   * @param duration 'perm' 永久变化（累加 atkBonus，受攻击获得封锁约束）；'temp' 限时变化
   * @param rounds   生效回合数，仅 'temp' 有效（默认 1 = 当前回合；2 = 覆盖本回合与下一回合）
   * @param tag      状态标记，仅 'temp' 有效（默认 'base'）；重复施加相同标记 = 刷新
   * @returns 是否实际生效（'perm' 时目标攻击获得被封锁返回 false）
   */
  atkUp(target: Actor, value: number, duration: GainDuration, rounds?: number, tag?: string): boolean;
  /**
   * 攻击降低：atkUp 的减益方向（value 为降低幅度，正数）。
   * 不受"攻击获得封锁"影响（封锁获得，不减益）
   */
  atkDown(target: Actor, value: number, duration?: GainDuration, rounds?: number, tag?: string): boolean;
  /**
   * 防御变化（增益/减益统一入口）——参数语义同 atkUp
   */
  defUp(target: Actor, value: number, duration: GainDuration, rounds?: number, tag?: string): boolean;
  /** 防御降低：defUp 的减益方向——参数语义同 atkDown */
  defDown(target: Actor, value: number, duration?: GainDuration, rounds?: number, tag?: string): boolean;
  /**
   * 施加者独占标记：数据挂在 target.marks（键 = '施加者id.状态名'），语义只有施加者读取。
   * until = 当前回合 + duration − 1（约定 #1 集中换算），并发 statusApply 事件
   */
  applyMark(label: string, duration: number, value?: number): void;
  /** 读取自己施加给对方的标记；过期（until < 当前回合）返回 undefined */
  opponentMark(label: string): MarkState | undefined;

  // ---- 死亡处理 ----

  /** 死亡检查（单一检查点）：无人死亡返回 null；有死亡则发 death/battleEnd 并置 finished */
  resolveDeaths(): Outcome | null;
  /** 立即结束战斗（幂等），发 battleEnd——引擎回合上限平局走此入口 */
  finish(outcome: Outcome): void;

  // ---- 负面状态查询与驱散（作用于自身）----

  /** 枚举自身当前的外部负面状态（封锁计数/降防/敌方标记）；自身 vars 增益不算负面 */
  ownDebuffs(): DebuffInfo[];
  /** 清除自身全部外部负面状态（驱散）：清零计数 + 删除敌方标记，逐项发 statusExpire */
  clearDebuffs(): void;
}

/** 负面状态描述（ownDebuffs 返回项） */
export interface DebuffInfo {
  kind: 'block' | 'atkDown' | 'defDown' | 'mark';
  status: string;
  rounds?: number; // 剩余计数（block/defDown）
  value?: number; // 标记附加值
  sourceId?: string; // 标记施加者
}

// ============================================================
// BattleCtx —— Ctx 实现
// ============================================================
export class BattleCtx implements Ctx {
  round = 0;
  phase: RoundPhase = 'roundStart';
  private _finished = false;
  private _outcome: Outcome | null = null;
  private depth = 0; // 反击再入护栏
  readonly events: BattleEvent[] = [];

  /** 每次行动前由引擎设置 */
  self: Actor;
  target: Actor;

  constructor(
    readonly rng: Rng,
    readonly p1: Actor,
    readonly p2: Actor,
  ) {
    this.self = p1;
    this.target = p2;
  }

  get finished(): boolean {
    return this._finished;
  }

  beginAction(actor: Actor): void {
    this.self = actor;
    this.target = actor === this.p1 ? this.p2 : this.p1;
  }

  sideOf(a: Actor): Side {
    return a === this.p1 ? 'p1' : 'p2';
  }

  // ---------- 事件 ----------
  emit(e: EventInput): void {
    // 战斗结束后不再接受任何事件：battleEnd 恒为事件流的最后一条
    if (this._finished) return;
    // 骨架事件可显式覆盖 round/phase；管线/角色事件自动补当前值
    this.events.push({ round: this.round, phase: this.phase, ...e } as BattleEvent);
  }

  emitFor(actor: Actor, e: EventInput): void {
    this.emit({ side: this.sideOf(actor), ...e });
  }

  // ---------- 攻击协议（核心，kind 矩阵集中实现） ----------

  private attackInternal(desc: AttackDesc, isCounter: boolean, who?: Actor): HitResult {
    if (this._finished) return { missed: true };
    const t = who ?? this.target;

    // ① 攻击动作开始（segment 不发）
    if (desc.kind === 'attack') {
      this.emit({ type: 'attackStart', label: desc.label, side: this.sideOf(this.self) });
    }

    // ② 受击方闪避（仅 attack；反击以 segment 发起天然不吃闪避）
    if (desc.kind === 'attack' && !t.beforeHit(this, desc)) {
      this.emit({ type: 'dodge', label: desc.label, side: this.sideOf(t) });
      // 幻象反击：segment 再入（吃防御可反杀），depth 护栏防双闪避角色无限递归。
      // 交换行动方：闪避者反击原攻击方（反击通过 ctx.attack(desc, who) 指定目标）
      if (!isCounter && this.depth === 0) {
        this.depth++;
        const prevSelf = this.self;
        const prevTarget = this.target;
        this.self = t;
        this.target = prevSelf;
        try {
          this.attackInternal({ kind: 'segment', base: 20, label: '幻象反击' }, true);
        } finally {
          this.self = prevSelf;
          this.target = prevTarget;
          this.depth--;
        }
      }
      return { missed: true };
    }

    // ③ 伤害计算（kind 矩阵；取整为 JS 四舍五入约定，测试显式断言）
    const mult = desc.mult ?? 1;
    let raw: number;
    if (desc.kind === 'flat' || desc.kind === 'pierce') {
      raw = Math.max(1, Math.round(desc.base * mult)); // 无视防御
    } else {
      raw = Math.max(1, Math.round(desc.base * mult) - t.curDef); // 吃防御
    }

    // ④ 护盾吸收（pierce 无视）
    let dealt = raw;
    let absorbed: number | undefined;
    if (desc.kind !== 'pierce' && t.shield > 0) {
      absorbed = Math.min(t.shield, raw);
      t.shield -= absorbed;
      dealt = raw - absorbed;
    }

    // ⑤ 受击方覆写点：只允许改数字，护盾/扣血路径留在协议内
    dealt = Math.max(0, t.computeIncoming(this, desc, dealt));

    // ⑥ 扣血 + 事件
    t.hp -= dealt;
    this.emit({
      type: 'damage',
      label: desc.label,
      raw,
      dealt,
      absorbed,
      hits: desc.hits,
      trueDamage: desc.kind === 'pierce' ? dealt : undefined,
      side: this.sideOf(t),
    });

    // ⑦ 致命伤 → 复活判定（复活回血由角色 onLethal 钩子自行设置）
    let killed = false;
    if (!t.isAlive) {
      if (t.onLethal(this)) {
        this.emit({ type: 'revive', hp: t.hp, side: this.sideOf(t) });
      } else {
        killed = true;
      }
    }

    // ⑧ 受击后被动（死亡目标早退——击杀一击不触发，约定 #9）
    if (!killed) t.onDamaged(this, desc);

    // ⑨ 攻击方命中后（仅攻击动作）
    if (desc.kind === 'attack' && !killed) this.self.onHit(this, desc);

    // ⑩ 每段结束立即死亡处理
    if (killed) this.resolveDeaths();
    return { missed: false, dealt, killed };
  }

  // ---------- 伤害入口 ----------
  attack(desc: AttackDesc, who?: Actor): HitResult {
    return this.attackInternal(desc, false, who);
  }

  heal(amount: number, who: Actor = this.self): void {
    const healed = Math.max(0, Math.min(amount, who.maxHp - who.hp));
    who.hp += healed;
    this.emitFor(who, { type: 'heal', value: healed });
  }

  shieldGain(value: number): void {
    this.self.shield += value;
    this.emitFor(this.self, { type: 'shieldGain', value });
  }

  // ---------- 状态施加（同类状态合并；约定 #1/#2 集中实现） ----------

  /**
   * 封锁类状态合并施加：调用方给状态名与封锁范围，计数器由 onSettle 逐回合 −1。
   * - scope 'action' → stunRound：封锁全部行动（眩晕/麻痹/变身封锁…）
   * - scope 'active' → noActRound：仅阻止主动技能（禁锢…）
   * 刷新语义：重复施加重置为满时长（约定 #2），until 仅供事件展示
   */
  block(target: Actor, status: StatusName, rounds: number, scope: BlockScope): void {
    const counter = {
      action: 'stunRound',
      active: 'noActRound',
      atkUp: 'noGainAtkRound',
      defUp: 'noGainDefRound',
    } as const;
    target[counter[scope]] = rounds;
    target.blockStatus[counter[scope]] = status;
    this.emitFor(target, {
      type: 'statusApply',
      status,
      until: this.round + rounds - 1,
      sourceId: this.self.id,
    });
    target.onStatusApply(this, status, this.self.id);
  }

  /** 施加者独占标记：数据挂 target，键 = '施加者id.状态名'；约定 #1 换算集中在此 */
  applyMark(label: string, duration: number, value?: number): void {
    const until = this.round + duration - 1;
    this.target.marks[`${this.self.id}.${label}`] = { until, value };
    this.emitFor(this.target, { type: 'statusApply', status: label, until, sourceId: this.self.id });
    this.target.onStatusApply(this, label, this.self.id);
  }

  // ---------- 攻防变化（增益/减益统一入口；封锁检查作用于生效目标） ----------

  /**
   * 攻击变化（增益/减益统一入口）
   * @param target   生效目标（封锁检查作用于它）
   * @param value    变化幅度：正 = 提升，负 = 降低
   * @param duration 'perm' 永久变化（累加 atkBonus，受攻击获得封锁约束）；'temp' 限时变化
   * @param rounds   生效回合数，仅 'temp' 有效（默认 1 = 当前回合；2 = 覆盖本回合与下一回合）
   * @param tag      状态标记，仅 'temp' 有效（默认 'base'）；重复施加相同标记 = 刷新
   * @returns 是否实际生效（'perm' 时目标攻击获得被封锁返回 false）
   */
  atkUp(target: Actor, value: number, duration: GainDuration, rounds = 1, tag = 'base'): boolean {
    if (target.noGainAtkRound > 0) return false; // 攻击获得封锁（增益方向受约束）
    if (duration === 'perm') {
      target.vars[VAR.atkBonus] = (target.vars[VAR.atkBonus] ?? 0) + value;
      return true;
    }
    target.timedAtk[tag] = { value, rounds, status: tag };
    this.emitFor(target, {
      type: 'statusApply',
      status: tag,
      until: this.round + rounds - 1,
      sourceId: this.self.id,
    });
    target.onStatusApply(this, tag, this.self.id);
    return true;
  }

  /**
   * 攻击降低：atkUp 的减益方向（value 为降低幅度，正数）。
   * 不受"攻击获得封锁"影响（封锁获得，不减益）。
   */
  atkDown(target: Actor, value: number, duration: GainDuration = 'temp', rounds = 1, tag = 'base'): boolean {
    if (duration === 'perm') {
      target.vars[VAR.atkBonus] = (target.vars[VAR.atkBonus] ?? 0) - value;
      return true;
    }
    target.timedAtk[tag] = { value: -value, rounds, status: tag };
    this.emitFor(target, {
      type: 'statusApply',
      status: tag,
      until: this.round + rounds - 1,
      sourceId: this.self.id,
    });
    target.onStatusApply(this, tag, this.self.id);
    return true;
  }

  /**
   * 防御变化（增益/减益统一入口）——参数语义同 atkUp。
   * 永久变化累加 defBonus（正增负减，受防御获得封锁约束）；
   * 限时变化写入 timedDef（value 带符号，相同标记刷新），结算段计数 −1 归零发 statusExpire。
   */
  defUp(target: Actor, value: number, duration: GainDuration, rounds = 1, tag = 'base'): boolean {
    if (target.noGainDefRound > 0) return false; // 防御获得封锁（增益方向受约束）
    if (duration === 'perm') {
      target.vars[VAR.defBonus] = (target.vars[VAR.defBonus] ?? 0) + value;
      return true;
    }
    target.timedDef[tag] = { value, rounds, status: tag };
    this.emitFor(target, {
      type: 'statusApply',
      status: tag,
      until: this.round + rounds - 1,
      sourceId: this.self.id,
    });
    target.onStatusApply(this, tag, this.self.id);
    return true;
  }

  /**
   * 防御降低：defUp 的减益方向（value 为降低幅度，正数）。
   * 不受"防御获得封锁"影响（封锁获得，不减益）。
   */
  defDown(target: Actor, value: number, duration: GainDuration = 'temp', rounds = 1, tag = 'base'): boolean {
    if (duration === 'perm') {
      target.vars[VAR.defBonus] = (target.vars[VAR.defBonus] ?? 0) - value;
      return true;
    }
    target.timedDef[tag] = { value: -value, rounds, status: tag };
    this.emitFor(target, {
      type: 'statusApply',
      status: tag,
      until: this.round + rounds - 1,
      sourceId: this.self.id,
    });
    target.onStatusApply(this, tag, this.self.id);
    return true;
  }

  // ---------- 负面状态查询与驱散（作用于自身） ----------

  /** 枚举自身当前的外部负面状态：封锁/负向限时变化/敌方标记（自身永久增益不算负面） */
  ownDebuffs(): DebuffInfo[] {
    const me = this.self;
    const out: DebuffInfo[] = [];
    for (const key of ['stunRound', 'noActRound', 'noGainAtkRound', 'noGainDefRound'] as const) {
      if (me[key] > 0) {
        out.push({ kind: 'block', status: me.blockStatus[key] ?? '封锁', rounds: me[key] });
      }
    }
    for (const [tag, e] of Object.entries(me.timedAtk)) {
      if (e.value < 0) {
        out.push({ kind: 'atkDown', status: e.status, rounds: e.rounds, value: e.value });
      }
    }
    for (const [tag, e] of Object.entries(me.timedDef)) {
      if (e.value < 0) {
        out.push({ kind: 'defDown', status: e.status, rounds: e.rounds, value: e.value });
      }
    }
    for (const [key, m] of Object.entries(me.marks)) {
      const dot = key.indexOf('.');
      out.push({
        kind: 'mark',
        status: dot > 0 ? key.slice(dot + 1) : key,
        sourceId: dot > 0 ? key.slice(0, dot) : undefined,
        value: m.value,
      });
    }
    return out;
  }

  /** 驱散：清除自身全部外部负面状态，逐项发 statusExpire（自身永久增益与正向限时增益不受影响） */
  clearDebuffs(): void {
    const me = this.self;
    for (const key of ['stunRound', 'noActRound', 'noGainAtkRound', 'noGainDefRound'] as const) {
      if (me[key] > 0) {
        me[key] = 0;
        this.emitFor(me, { type: 'statusExpire', status: me.blockStatus[key] ?? '封锁' });
        delete me.blockStatus[key];
      }
    }
    for (const key of ['timedAtk', 'timedDef'] as const) {
      const table = me[key];
      for (const tag of Object.keys(table)) {
        const e = table[tag]!;
        if (e.value < 0) {
          this.emitFor(me, { type: 'statusExpire', status: e.status });
          delete table[tag];
        }
      }
    }
    for (const key of Object.keys(me.marks)) {
      const dot = key.indexOf('.');
      this.emitFor(me, {
        type: 'statusExpire',
        status: dot > 0 ? key.slice(dot + 1) : key,
        sourceId: dot > 0 ? key.slice(0, dot) : undefined,
      });
      delete me.marks[key];
    }
  }

  /** 施加者读取自己挂的标记（只做有效期判断） */
  opponentMark(label: string): MarkState | undefined {
    const m = this.target.marks[`${this.self.id}.${label}`];
    return m && m.until >= this.round ? m : undefined;
  }

  // ---------- 死亡处理 ----------

  /** 立即结束战斗（幂等）：发 battleEnd。引擎的回合上限平局也走此入口 */
  finish(outcome: Outcome): void {
    if (this._finished) return;
    this._outcome = outcome;
    this.emit({ type: 'battleEnd', phase: 'roundEnd', outcome, totalRounds: this.round });
    this._finished = true; // 置于 emit 之后：battleEnd 自身不受守卫拦截
  }

  resolveDeaths(): Outcome | null {
    if (this._finished) return this._outcome;
    const p1Dead = !this.p1.isAlive;
    const p2Dead = !this.p2.isAlive;
    if (!p1Dead && !p2Dead) return null;
    if (p1Dead) this.emit({ type: 'death', side: 'p1' });
    if (p2Dead) this.emit({ type: 'death', side: 'p2' });
    this.finish(p1Dead && p2Dead ? 'draw' : p1Dead ? 'p2' : 'p1');
    return this._outcome;
  }
}
