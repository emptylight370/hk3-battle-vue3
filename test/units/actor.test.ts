import { describe, expect, it, vi } from 'vitest';

import { createActor, type ActorState } from '@/core/actor';
import type { Ctx } from '@/core/context';
import type { AttackDesc, BattleEvent, RoundPhase } from '@/core/types';

// ---------- 工具 ----------

const baseDef = {
  id: 'a',
  name: '甲',
  hp: 100,
  atk: 16,
  def: 8,
  speed: 20,
  activeInterval: 3,
};

/** 最小 Ctx mock：actor 默认路径只用到 round / attack / emit */
function makeCtx(round = 1, phase: RoundPhase = 'actions') {
  const events: BattleEvent[] = [];
  const ctx = {
    round,
    phase,
    events,
    emit: vi.fn((e: Record<string, unknown>) => {
      events.push({ round, phase, ...e } as BattleEvent);
    }),
    attack: vi.fn((_desc: AttackDesc) => ({ missed: false, dealt: 0, killed: false })),
  };
  return ctx as unknown as Ctx & { attack: ReturnType<typeof vi.fn>; events: BattleEvent[] };
}

// ---------- 面板与派生属性 ----------

describe('Actor — 面板映射与满血开场', () => {
  it('面板键 hp/atk/def 映射到 maxHp/atkBase/defBase，满血开场', () => {
    const a = createActor(baseDef);
    expect(a.maxHp).toBe(100);
    expect(a.hp).toBe(100);
    expect(a.atkBase).toBe(16);
    expect(a.defBase).toBe(8);
    expect(a.activeInterval).toBe(3);
    expect(a.isAlive).toBe(true);
  });
});

describe('Actor — 派生属性', () => {
  it('curAtk = atkBase + atkBonus（永久） + Σ 限时攻击变化', () => {
    const a = createActor(baseDef);
    a.vars.atkBonus = 2;
    expect(a.curAtk).toBe(18);
    a.timedAtk['变身'] = { value: 8, rounds: 1, status: '变身' };
    expect(a.curAtk).toBe(26);
  });

  it('curDef = defBase + defBonus（永久，正增负减） + Σ 限时防御变化，最低 0', () => {
    const a = createActor(baseDef);
    a.vars.defBonus = 3;
    expect(a.curDef).toBe(11);
    a.vars.defBonus = -5; // 永久减益（负数）
    expect(a.curDef).toBe(3);
    a.timedDef['变身'] = { value: 4, rounds: 2, status: '变身' };
    expect(a.curDef).toBe(7);
    a.timedDef['降防'] = { value: -99, rounds: 1, status: '降防' };
    expect(a.curDef).toBe(0); // 减到 0 兜底，不为负
  });
});

// ---------- 行动分流 ----------

describe('Actor — onAction 默认分流', () => {
  it('activeInterval 命中回合 → activeSkill', () => {
    const activeSkill = vi.fn();
    const a = createActor({ ...baseDef, activeSkill });
    const ctx = makeCtx(3);
    a.onAction(ctx);
    expect(activeSkill).toHaveBeenCalledTimes(1);
    expect(ctx.attack).not.toHaveBeenCalled();
  });

  it('非命中回合 → normalAttack（走完整攻击管线，base = curAtk）', () => {
    const a = createActor(baseDef);
    const ctx = makeCtx(4);
    a.onAction(ctx);
    expect(ctx.attack).toHaveBeenCalledWith({ kind: 'attack', base: 16, label: '普攻' });
  });

  it('activeInterval = 0 → 永远普攻（无主动技兜底）', () => {
    const a = createActor({ ...baseDef, activeInterval: 0 });
    const ctx = makeCtx(3);
    a.onAction(ctx);
    expect(ctx.attack).toHaveBeenCalled();
  });
});

// ---------- 工厂钩子绑定 ----------

describe('createActor — 钩子绑定', () => {
  it('注册表函数体绑定后 this 指向 Actor 实例', () => {
    const a = createActor({
      ...baseDef,
      activeSkill() {
        this.vars!.touched = 1; // this 必须是实例，否则 vars 写不进去
      },
    });
    a.activeSkill(makeCtx());
    expect(a.vars.touched).toBe(1);
  });

  it('未覆写的钩子落到基类 no-op（不抛错、有默认行为）', () => {
    const a = createActor(baseDef);
    expect(() => a.onRoundStart(makeCtx())).not.toThrow();
    expect(a.snapshot()).toBeNull(); // 默认无快照能力
    expect(a.pushSnapshot(3)).toBeNull();
    expect(a.beforeHit(makeCtx(), { kind: 'attack', base: 1, label: 'x' })).toBe(true);
    expect(a.onLethal(makeCtx())).toBe(false);
  });
});

// ---------- 快照/回溯 ----------

describe('Actor — 快照队列（角色覆写 snapshot/restore）', () => {
  function makeRewinder() {
    return createActor({
      ...baseDef,
      id: 'rw',
      snapshot() {
        return { hp: this.hp, vars: { ...this.vars } };
      },
      restore(s: ActorState) {
        const st = s as { hp: number; vars: Record<string, number> };
        this.hp = st.hp;
        this.vars = { ...st.vars };
      },
    });
  }

  it('pushSnapshot 推入并裁剪至 depth，队头为最早快照', () => {
    const a = makeRewinder();
    a.hp = 100;
    expect(a.pushSnapshot(3)?.hp).toBe(100); // 队头 S1
    a.hp = 80;
    expect(a.pushSnapshot(3)?.hp).toBe(100);
    a.hp = 60;
    expect(a.pushSnapshot(3)?.hp).toBe(100);
    expect(a.snapQueue.length).toBe(3);
    a.hp = 40;
    expect(a.pushSnapshot(3)?.hp).toBe(80); // 裁剪后队头 = S2，S1 被推出
    expect(a.snapQueue.length).toBe(3);
  });

  it('restore 还原快照内容', () => {
    const a = makeRewinder();
    a.vars.stance = 2;
    const s = a.snapshot()!;
    a.hp = 10;
    a.vars.stance = 0;
    a.restore(s);
    expect(a.hp).toBe(100);
    expect(a.vars.stance).toBe(2);
  });

  it('快照是拷贝而非引用（后续修改不污染队列）', () => {
    const a = makeRewinder();
    const s = a.snapshot()!;
    a.hp = 1;
    expect((s as { hp: number }).hp).toBe(100);
  });
});
