import { describe, expect, it, vi } from 'vitest'

import { BattleCtx } from '@/core/context'
import { createActor, type Actor } from '@/core/actor'
import { byId } from './helpers'
import { getCharacter } from '@/core/registry'
import type { CharacterDef } from '@/core/registry/types'
import type { Rng } from '@/core/rng'
import { createRng } from '@/core/rng'

// ============================================================
// 校准不变量测试 —— 从官方日志提炼的规则等式与时序约定
//
// 与"逐点复现"不同：不要求事件流与日志一致，只断言规则行为的
// 数值/时序不变量。每条测试对应一条校准约定（总设文档 §6 / 实现追记）。
// 涉及未实现角色的条目用 it.todo 占位，实现后补断言。
// ============================================================

const dummyDef: CharacterDef = {
  id: 'dummy',
  name: '木桩',
  hp: 1000,
  atk: 0,
  def: 0,
  speed: 0,
  activeInterval: 0,
}

/** 强制 chance 返回指定值的上下文（隔离随机性，只测规则本身） */
function rigged(chanceResult: boolean, p1Def?: CharacterDef) {
  const p1 = createActor(p1Def ?? dummyDef);
  const p2 = createActor(dummyDef);
  const rng = { ...createRng(1), chance: () => chanceResult } as Rng;
  const ctx = new BattleCtx(rng, p1, p2);
  ctx.round = 1;
  ctx.phase = 'actions';
  ctx.beginAction(p1);
  return { ctx, p1, p2 };
}

// ---------- 约定 #1：持续 N 回合 = 含施加回合 ----------

describe('约定 #1 — 封锁含施加回合', () => {
  it('眩晕 2 回合：实际封锁下一个回合（rounds−1）', () => {
    const { ctx, p2 } = rigged(true);
    ctx.block(p2, '眩晕', 2, 'action');
    p2.settleBlocks(ctx); // R1 结算
    expect(p2.stunRound).toBe(1); // R2 被封锁
    p2.settleBlocks(ctx); // R2 结算
    expect(p2.stunRound).toBe(0); // R3 恢复
  });

  it('rounds=1 不封锁任何回合（换算口诀：封锁下一回合传 2）', () => {
    const { ctx, p2 } = rigged(true);
    ctx.block(p2, '眩晕', 1, 'action');
    p2.settleBlocks(ctx);
    expect(p2.stunRound).toBe(0);
  });
});

// ---------- 约定 #2：重复命中刷新 ----------

describe('约定 #2 — 刷新语义', () => {
  it('重复施加重置为满时长，而非叠加', () => {
    const { ctx, p2 } = rigged(true);
    ctx.block(p2, '眩晕', 2, 'action');
    ctx.block(p2, '眩晕', 2, 'action');
    expect(p2.stunRound).toBe(2); // 若叠加则为 4
  });
});

// ---------- 约定 #3：麻痹 1 回合 = 封锁下一回合 ----------

describe('约定 #3 — 麻痹 1 回合', () => {
  it('按含施加回合口径传 rounds=2，封锁下一回合', () => {
    const { ctx, p2 } = rigged(true);
    ctx.block(p2, '麻痹', 2, 'action'); // 官方"麻痹 1 回合"→ 传 2
    p2.settleBlocks(ctx);
    expect(p2.stunRound).toBe(1); // 下一回合被封锁
  });
});

// ---------- 约定 #8：魅惑不封锁行动 ----------

describe('约定 #8 — 魅惑仅封锁主动技能', () => {
  it("scope 'active' 不影响普攻行动（stunRound 保持 0）", () => {
    const { ctx, p2 } = rigged(true);
    ctx.block(p2, '魅惑', 2, 'active');
    expect(p2.stunRound).toBe(0); // 行动不被封锁
    expect(p2.noActRound).toBe(2); // 仅主动技被禁
  });

  it('薇塔被动：魅惑施加给攻击者方向的目标，且不豁免其行动', () => {
    const onDamaged = getCharacter('vita').onDamaged!;
    const { ctx, p2 } = rigged(true);
    p2.onDamaged = onDamaged.bind(p2);
    p2.onDamaged(ctx, { kind: 'attack', base: 10, label: 'x' });
    expect(p2.noActRound).toBe(2); // ctx.target（攻击方方向）被挂魅惑
  });
});

// ---------- 约定 #9：击杀一击不触发受击被动 ----------

describe('约定 #9 — 击杀一击不触发 onDamaged', () => {
  it('致命一击后 onDamaged 早退', () => {
    const onDamaged = vi.fn();
    const p2 = createActor({ ...dummyDef, hp: 5, onDamaged });
    const { ctx, p1 } = rigged(true);
    ctx.beginAction(p1);
    ctx.target = p2;
    const r = ctx.attack({ kind: 'attack', base: 16, label: 'x' });
    expect(r).toEqual({ missed: false, dealt: 16, killed: true }); // dealt 不按剩余血截断
    expect(onDamaged).not.toHaveBeenCalled();
  });
});

// ---------- 约定 #11：降防只降目标 ----------

describe('约定 #11 — 降防只降目标', () => {
  it('defDown 只影响目标，施加方防御不变', () => {
    const p2 = createActor({ ...dummyDef, def: 8 });
    const { ctx, p1 } = rigged(true);
    const before = p1.curDef;
    ctx.defDown(p2, 2, 3);
    expect(p2.curDef).toBe(8 - 3);
    expect(p1.curDef).toBe(before);
  });
});

// ---------- 薇塔复活（15%，回 20% 最大生命） ----------

describe('薇塔复活', () => {
  it('判定成功：回复 20% 最大生命并存活', () => {
    const p1 = createActor(byId('vita'));
    const p2 = createActor(dummyDef);
    const rng = { ...createRng(1), chance: () => true } as Rng;
    const ctx = new BattleCtx(rng, p1, p2);
    p1.hp = 1;
    p1.onLethal(ctx);
    expect(p1.hp).toBe(1 + p1.maxHp * 0.2); // "回复"语义 = 治疗量，非设为定值
  });

  it('判定失败：不复活', () => {
    const p1 = createActor(byId('vita'));
    const p2 = createActor(dummyDef);
    const rng = { ...createRng(1), chance: () => false } as Rng;
    const ctx = new BattleCtx(rng, p1, p2);
    p1.hp = 1;
    expect(p1.onLethal(ctx)).toBe(false);
  });
});

// ---------- 待补角色后实现的约定 ----------

describe('待实现角色的校准条目', () => {
  it.todo('约定 #4：陨石 +1 攻击在触发波结算之后生效（希娜狄雅）');
  it.todo('约定 #5：滑板 20% 是升级（15→25），非附加一段（幽兰黛尔）');
  it.todo('约定 #6：时间禁锢必施加；时间倒转回看 3 回合（寻梦者）');
  it.todo('约定 #7：被闪避的攻击不获得护盾、不累积灼光（布洛妮娅/赫丽娅）');
  it.todo('约定 #10：芽衣普通形态视为普攻、每回合触发；强化技未击败才清刀势');
  it.todo('约定 #12：布洛妮娅子弹 2 枚，各一段独立伤害（聚合显示 2次分裂）');
});
