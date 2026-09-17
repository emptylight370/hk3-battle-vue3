import { describe, expect, it, vi } from 'vitest'

import { BattleCtx } from '@/core/context'
import { createActor, type Actor } from '@/core/actor'
import type { CharacterDef } from '@/core/registry/types'
import type { BattleEvent } from '@/core/types'
import { createRng } from '@/core/rng'

// ---------- 工具 ----------

const baseDef: CharacterDef = {
  id: 'x',
  name: '无名',
  hp: 100,
  atk: 16,
  def: 8,
  speed: 20,
  activeInterval: 0, // 测试中手动调 attack/segment，不走分流
}

function setup(p1Def?: Partial<CharacterDef>, p2Def?: Partial<CharacterDef>, round = 1) {
  const p1: Actor = createActor({ ...baseDef, id: 'p1', name: '甲', ...p1Def })
  const p2: Actor = createActor({ ...baseDef, id: 'p2', name: '乙', ...p2Def })
  const ctx = new BattleCtx(createRng(42), p1, p2)
  ctx.round = round
  ctx.phase = 'actions'
  ctx.beginAction(p1) // 默认 p1 行动，target = p2
  return { ctx, p1, p2, events: ctx.events }
}

const of = <T extends BattleEvent['type']>(
  events: BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

// ---------- kind 矩阵：attack ----------

describe('attack — 标准攻击动作', () => {
  it('raw = max(1, base − def)，扣血并发 attackStart/damage 事件', () => {
    const { ctx, p2, events } = setup()
    const r = ctx.attack({ kind: 'attack', base: 16, label: '普攻' })
    expect(r).toEqual({ missed: false, dealt: 8, killed: false })
    expect(p2.hp).toBe(92)
    expect(of(events, 'attackStart')).toHaveLength(1)
    const dmg = of(events, 'damage')[0]!
    expect(dmg).toMatchObject({ label: '普攻', raw: 8, dealt: 8, side: 'p2' })
  })

  it('伤害最低 1', () => {
    const { ctx, p2 } = setup()
    ctx.attack({ kind: 'attack', base: 1, label: 'x' })
    expect(p2.hp).toBe(99)
  })

  it('mult ×1.5 按 JS 四舍五入取整后再减防御', () => {
    const { ctx, p2, events } = setup()
    ctx.attack({ kind: 'attack', base: 17, mult: 1.5, label: '灼光强化' }) // 25.5 → 26 − 8 = 18
    expect(p2.hp).toBe(82)
    expect(of(events, 'damage')[0]).toMatchObject({ raw: 18 })
  })

  it('护盾优先吸收：absorbed 记入 damage 事件，余量扣血', () => {
    const { ctx, p2, events } = setup()
    p2.shield = 5
    ctx.attack({ kind: 'attack', base: 16, label: 'x' })
    expect(p2.shield).toBe(0)
    expect(p2.hp).toBe(97) // 100 − (8 − 5) = 97
    expect(of(events, 'damage')[0]).toMatchObject({ raw: 8, dealt: 3, absorbed: 5 })
  })

  it('命中后触发攻击方 onHit 与受击方 onDamaged', () => {
    const onHit = vi.fn()
    const onDamaged = vi.fn()
    const { ctx } = setup({ onHit }, { onDamaged })
    ctx.attack({ kind: 'attack', base: 16, label: 'x' })
    expect(onHit).toHaveBeenCalledTimes(1)
    expect(onDamaged).toHaveBeenCalledTimes(1)
  })
})

// ---------- kind 矩阵：dodge / segment / flat / pierce ----------

describe('attack — 闪避与反击', () => {
  it('被闪避：无伤害段，目标受伤 0，攻击方吃 20 点幻象反击（segment）', () => {
    const { ctx, p1, p2, events } = setup(undefined, { beforeHit: () => false })
    const r = ctx.attack({ kind: 'attack', base: 16, label: '普攻' })
    expect(r.missed).toBe(true)
    expect(p2.hp).toBe(100)
    expect(p1.hp).toBe(88) // 幻象反击 20 − 防御 8 = 12
    expect(of(events, 'dodge')).toHaveLength(1)
    // 被闪避的攻击不发 damage 事件；反击段单独发
    const dmgs = of(events, 'damage')
    expect(dmgs).toHaveLength(1)
    expect(dmgs[0]).toMatchObject({ label: '幻象反击', side: 'p1' })
  })

  it('双方都配置闪避：反击以 segment 发起不再吃闪避，护栏防无限递归', () => {
    const { ctx, p1, p2 } = setup({ beforeHit: () => false }, { beforeHit: () => false })
    expect(() => ctx.attack({ kind: 'attack', base: 16, label: 'x' })).not.toThrow()
    expect(p1.hp).toBe(88) // 反击照常结算
    expect(p2.hp).toBe(100) // 主攻击被闪避
  })

  it('被闪避的攻击不触发攻击方 onHit（约定 #7）', () => {
    const onHit = vi.fn()
    const { ctx } = setup({ onHit }, { beforeHit: () => false })
    ctx.attack({ kind: 'attack', base: 16, label: 'x' })
    expect(onHit).not.toHaveBeenCalled()
  })
})

describe('attack — segment（技能效果段）', () => {
  it('不判闪避、不触发攻击方 onHit，但触发 onDamaged', () => {
    const onHit = vi.fn()
    const onDamaged = vi.fn()
    const { ctx, events } = setup({ onHit }, { onDamaged, beforeHit: () => false })
    ctx.attack({ kind: 'segment', base: 15, label: '点燃' })
    expect(of(events, 'attackStart')).toHaveLength(0) // 效果段无 attackStart
    expect(of(events, 'dodge')).toHaveLength(0) // 不吃闪避
    expect(onHit).not.toHaveBeenCalled()
    expect(onDamaged).toHaveBeenCalledTimes(1)
  })

  it('吃防御', () => {
    const { ctx, p2 } = setup()
    ctx.attack({ kind: 'segment', base: 15, label: '点燃' }) // 15 − 8 = 7
    expect(p2.hp).toBe(93)
  })
})

describe('attack — flat / pierce（三级伤害入口）', () => {
  it('flat 无视防御、护盾照吸（芽衣追加）', () => {
    const { ctx, p2 } = setup()
    p2.shield = 3
    ctx.attack({ kind: 'flat', base: 4, label: '追加' }) // raw 4（无视 def 8），护盾吸 3，实扣 1
    expect(p2.shield).toBe(0)
    expect(p2.hp).toBe(99)
  })

  it('pierce 无视防御和护盾，最低 1，事件带 trueDamage', () => {
    const { ctx, p2, events } = setup()
    p2.shield = 50
    ctx.attack({ kind: 'pierce', base: 10, label: '真伤' })
    expect(p2.shield).toBe(50) // 护盾不动
    expect(p2.hp).toBe(90)
    expect(of(events, 'damage')[0]).toMatchObject({ dealt: 10, trueDamage: 10 })
  })
})

// ---------- 致命伤 / 复活 / 死亡处理 ----------

describe('致命伤 — 复活与击杀短路', () => {
  it('onLethal 返回 true → 复活事件，不死亡', () => {
    const { ctx, p2, events } = setup(undefined, {
      onLethal() {
        this.hp = 20 // 复活回血由角色钩子自行设置
        return true
      },
    })
    p2.hp = 5
    const r = ctx.attack({ kind: 'attack', base: 16, label: 'x' }) // 实扣 8 ≥ 5，触发致命伤
    expect(r).toEqual({ missed: false, dealt: 8, killed: false }) // dealt 为计算伤害，不按剩余血量截断
    expect(of(events, 'revive')).toHaveLength(1)
    expect(of(events, 'death')).toHaveLength(0)
    expect(p2.hp).toBe(20)
    expect(ctx.finished).toBe(false)
  })

  it('击杀：killed 短路，不触发 onDamaged（约定 #9），死亡 + 战斗结束事件', () => {
    const onDamaged = vi.fn()
    const { ctx, p2, events } = setup(undefined, { onDamaged })
    p2.hp = 5
    const r = ctx.attack({ kind: 'attack', base: 16, label: 'x' })
    expect(r).toEqual({ missed: false, dealt: 8, killed: true }) // dealt 为计算伤害，不按剩余血量截断
    expect(onDamaged).not.toHaveBeenCalled() // 击杀一击不触发受击被动
    expect(of(events, 'death')).toHaveLength(1)
    expect(of(events, 'battleEnd')).toHaveLength(1)
    expect(ctx.finished).toBe(true)
    // 战斗结束后攻击空转
    expect(ctx.attack({ kind: 'attack', base: 16, label: 'x' })).toEqual({ missed: true })
  })
})

// ---------- 状态施加 ----------

describe('block — 封锁类状态合并施加', () => {
  it('scope action → stunRound；scope active → noActRound', () => {
    const { ctx, p2 } = setup()
    ctx.block(p2, '眩晕', 2, 'action')
    expect(p2.stunRound).toBe(2)
    ctx.block(p2, '禁锢', 2, 'active')
    expect(p2.noActRound).toBe(2)
  })

  it('刷新语义：重复施加重置为满时长（约定 #2），until = round + rounds − 1', () => {
    const { ctx, p2, events } = setup(undefined, undefined, 3)
    ctx.block(p2, '眩晕', 2, 'action')
    ctx.block(p2, '眩晕', 2, 'action') // 重复命中刷新
    expect(p2.stunRound).toBe(2) // 重置而非叠加
    expect(of(events, 'statusApply')).toHaveLength(2)
    expect(of(events, 'statusApply')[0]).toMatchObject({
      status: '眩晕',
      until: 4, // 3 + 2 − 1
      sourceId: 'p1',
      side: 'p2',
    })
  })
})

describe('applyMark / opponentMark — 施加者独占标记', () => {
  it('键 = 施加者id.状态名，until 按约定 #1 换算，value 透传', () => {
    const { ctx, p2 } = setup(undefined, undefined, 3)
    ctx.applyMark('标记', 2, 7)
    expect(p2.marks['p1.标记']).toEqual({ until: 4, value: 7 })
    expect(ctx.opponentMark('标记')).toEqual({ until: 4, value: 7 })
  })

  it('过期后 opponentMark 返回 undefined', () => {
    const { ctx } = setup(undefined, undefined, 3)
    ctx.applyMark('标记', 2)
    ctx.round = 5
    expect(ctx.opponentMark('标记')).toBeUndefined()
  })
})

describe('defDown — 限时降防（约定 #11：只降目标，同标记刷新）', () => {
  it('curDef 立即生效，发 statusApply 事件', () => {
    const { ctx, p2, events } = setup(undefined, undefined, 2)
    expect(p2.curDef).toBe(8)
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    expect(p2.timedDef['降防']).toEqual({ value: -3, rounds: 2, status: '降防' })
    expect(p2.curDef).toBe(5)
    expect(of(events, 'statusApply')[0]).toMatchObject({
      status: '降防',
      until: 3, // 2 + 2 − 1
      sourceId: 'p1',
      side: 'p2',
    })
  })

  it('同标记刷新：重复施加覆盖前值', () => {
    const { ctx, p2 } = setup()
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    ctx.defDown(p2, 4, 'temp', 2, '降防')
    expect(p2.timedDef['降防']).toEqual({ value: -4, rounds: 2, status: '降防' })
    expect(Object.keys(p2.timedDef)).toHaveLength(1) // 不会并存两条
  })

  it('不同标记并存：效果叠加', () => {
    const { ctx, p2 } = setup()
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    ctx.defDown(p2, 2, 'temp', 2, '破甲')
    expect(p2.curDef).toBe(8 - 3 - 2)
  })
})

// ---------- 资源 ----------

describe('heal / shieldGain', () => {
  it('heal 默认作用于 self，封顶 maxHp', () => {
    const { ctx, p1, events } = setup()
    p1.hp = 50
    ctx.heal(30)
    expect(p1.hp).toBe(80)
    ctx.heal(999) // 封顶
    expect(p1.hp).toBe(100)
    expect(of(events, 'heal').at(-1)).toMatchObject({ value: 20, side: 'p1' })
  })

  it('shieldGain 加于 self 并发事件', () => {
    const { ctx, p1, events } = setup()
    ctx.shieldGain(5)
    expect(p1.shield).toBe(5)
    expect(of(events, 'shieldGain')[0]).toMatchObject({ value: 5, side: 'p1' })
  })
})

// ---------- 死亡处理 ----------

describe('resolveDeaths', () => {
  it('双方存活 → null，无事件', () => {
    const { ctx, events } = setup()
    expect(ctx.resolveDeaths()).toBeNull()
    expect(of(events, 'death')).toHaveLength(0)
  })

  it('幂等：finished 后返回同一结果，不重复发事件', () => {
    const { ctx, p2, events } = setup()
    p2.hp = 0
    expect(ctx.resolveDeaths()).toBe('p1')
    expect(ctx.resolveDeaths()).toBe('p1')
    expect(of(events, 'death')).toHaveLength(1)
    expect(of(events, 'battleEnd')).toHaveLength(1)
  })

  it('同归 → draw', () => {
    const { ctx, p1, p2 } = setup()
    p1.hp = 0
    p2.hp = 0
    expect(ctx.resolveDeaths()).toBe('draw')
  })
})

// ---------- 事件自动补全 ----------

describe('emit — round/phase/side 自动补全', () => {
  it('省略 round/phase 时补当前值；emitFor 补 side', () => {
    const { ctx, events } = setup(undefined, undefined, 7)
    ctx.phase = 'settlement'
    ctx.emit({ type: 'roundStart' })
    ctx.emitFor(ctx.p2, { type: 'heal', value: 1 })
    expect(events.at(-2)).toMatchObject({ round: 7, phase: 'settlement' })
    expect(events.at(-1)).toMatchObject({ round: 7, phase: 'settlement', side: 'p2' })
  })
})

// ---------- 攻防获得封锁与增减 ----------

describe('攻防获得封锁与增减', () => {
  it("atkUp/defUp 'perm' 累加永久增益并作用于 curAtk/curDef", () => {
    const { ctx, p1 } = setup()
    expect(ctx.atkUp(p1, 10, 'perm')).toBe(true)
    expect(ctx.defUp(p1, 3, 'perm')).toBe(true)
    expect(p1.vars.atkBonus).toBe(10)
    expect(p1.curAtk).toBe(26) // 16 + 10
    expect(p1.curDef).toBe(11) // 8 + 3
  })

  it("atkUp/defUp 'temp' 累加临时增益，结算段过期", () => {
    const { ctx, p1 } = setup()
    ctx.atkUp(p1, 8, 'temp')
    ctx.defUp(p1, 3, 'temp')
    expect(p1.timedAtk['base']).toEqual({ value: 8, rounds: 1, status: 'base' })
    expect(p1.curAtk).toBe(24)
    expect(p1.curDef).toBe(11)
    p1.settleTimed(ctx) // 结算段计数 −1 → 归零移除
    expect(p1.timedAtk['base']).toBeUndefined()
    expect(p1.curAtk).toBe(16)
    expect(p1.curDef).toBe(8)
  })

  it('封锁检查作用于生效目标：甲给乙上增益时，受乙自身封锁约束', () => {
    const { ctx, p1, p2 } = setup()
    ctx.atkUp(p1, 10, 'perm') // 先有存量
    p1.vars.defBonus = 3
    // 乙封锁甲的攻防获得
    ctx.block(p1, '禁锢', 2, 'atkUp')
    ctx.block(p1, '禁锢', 2, 'defUp')
    expect(p1.noGainAtkRound).toBe(2)
    expect(p1.noGainDefRound).toBe(2)
    // 无论谁施加，只要生效目标是甲就受甲的封锁约束
    expect(ctx.atkUp(p1, 10, 'perm')).toBe(false)
    expect(ctx.defUp(p1, 3, 'perm')).toBe(false)
    expect(ctx.atkUp(p2, 10, 'perm')).toBe(true) // 乙未被封锁，正常生效
    expect(p1.vars.atkBonus).toBe(10) // 存量不受影响
    expect(p1.vars.defBonus).toBe(3)
  })

  it('封锁到期后增益恢复生效（结算段计数 −1）', () => {
    const { ctx, p1 } = setup()
    ctx.block(p1, '禁锢', 1, 'atkUp')
    expect(ctx.atkUp(p1, 5, 'perm')).toBe(false)
    p1.settleBlocks(ctx) // 结算段 −1 → 归零
    expect(ctx.atkUp(p1, 5, 'perm')).toBe(true)
    expect(p1.vars.atkBonus).toBe(5)
  })

  it('atkDown 只降目标攻击，施加方不变；结算段过期恢复', () => {
    const { ctx, p1, p2, events } = setup(undefined, undefined, 2)
    expect(p2.curAtk).toBe(16)
    ctx.atkDown(p2, 5, 'temp', 2, '攻击降低')
    expect(p2.curAtk).toBe(11)
    expect(p1.curAtk).toBe(16)
    expect(of(events, 'statusApply')[0]).toMatchObject({ status: '攻击降低', side: 'p2' })
    p2.settleTimed(ctx)
    p2.settleTimed(ctx)
    expect(p2.timedAtk['攻击降低']).toBeUndefined()
    expect(p2.curAtk).toBe(16)
    expect(of(events, 'statusExpire').at(-1)).toMatchObject({ status: '攻击降低' })
  })

  it('blockStatus 字典：多种封锁并存时到期状态名各自还原', () => {
    const { ctx, p2, events } = setup()
    ctx.block(p2, '眩晕', 1, 'action')
    ctx.block(p2, '禁锢', 2, 'atkUp')
    p2.settleBlocks(ctx) // 眩晕归零 → 还原'眩晕'；禁锢 2→1
    expect(of(events, 'statusExpire')).toMatchObject([{ status: '眩晕' }])
    p2.settleBlocks(ctx)
    p2.settleBlocks(ctx) // 禁锢归零 → 还原'禁锢'
    const exp = of(events, 'statusExpire')
    expect(exp.at(-1)).toMatchObject({ status: '禁锢' })
  })
})

// ---------- 负面状态感知与驱散 ----------

describe('onStatusApply — 被施加状态感知', () => {
  it('block/defDown/applyMark 均触发目标 onStatusApply，携带状态名与施加者', () => {
    const onStatusApply = vi.fn()
    const { ctx, p2 } = setup(undefined, { onStatusApply })
    ctx.block(p2, '眩晕', 2, 'action')
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    ctx.applyMark('标记', 2, 7)
    expect(onStatusApply).toHaveBeenCalledTimes(3)
    expect(onStatusApply).toHaveBeenNthCalledWith(1, ctx, '眩晕', 'p1')
    expect(onStatusApply).toHaveBeenNthCalledWith(2, ctx, '降防', 'p1')
    expect(onStatusApply).toHaveBeenNthCalledWith(3, ctx, '标记', 'p1')
  })

  it('自身 vars 增益不触发（协议只感知外部施加）', () => {
    const onStatusApply = vi.fn()
    const { ctx, p1 } = setup({ onStatusApply })
    p1.vars.atkBonus = 5 // 直接写 vars 不经协议，无感知事件
    expect(onStatusApply).not.toHaveBeenCalled()
  })
})

describe('ownDebuffs / clearDebuffs — 负面状态枚举与驱散', () => {
  it('枚举封锁/降防/敌方标记三类负面', () => {
    const { ctx, p2 } = setup(undefined, undefined, 3)
    ctx.block(p2, '眩晕', 2, 'action')
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    ctx.applyMark('标记', 2, 7)
    ctx.beginAction(p2) // 以乙的视角自查
    expect(ctx.ownDebuffs()).toEqual([
      { kind: 'block', status: '眩晕', rounds: 2 },
      { kind: 'defDown', status: '降防', rounds: 2, value: -3 },
      { kind: 'mark', status: '标记', sourceId: 'p1', value: 7 },
    ])
  })

  it('无负面时返回空数组', () => {
    const { ctx } = setup()
    ctx.beginAction(ctx.p2)
    expect(ctx.ownDebuffs()).toEqual([])
  })

  it('clearDebuffs 清零计数/删除标记，逐项发 statusExpire，自身 vars 增益不受影响', () => {
    const { ctx, p2, events } = setup(undefined, undefined, 3)
    ctx.block(p2, '眩晕', 2, 'action')
    ctx.defDown(p2, 3, 'temp', 2, '降防')
    ctx.applyMark('标记', 2, 7)
    p2.vars.atkBonus = 5 // 自身增益不应被驱散
    ctx.beginAction(p2)
    ctx.clearDebuffs()
    expect(p2.stunRound).toBe(0)
    expect(p2.timedDef['降防']).toBeUndefined()
    expect(p2.marks).toEqual({})
    expect(p2.vars.atkBonus).toBe(5)
    const expires = of(events, 'statusExpire')
    expect(expires).toHaveLength(3)
    expect(expires.map((e) => e.status)).toEqual(['眩晕', '降防', '标记'])
  })
})
