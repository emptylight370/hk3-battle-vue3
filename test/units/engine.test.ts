import { describe, expect, it } from 'vitest'

import { Battle } from '@/core/engine'
import { createActor } from '@/core/actor'
import type { CharacterDef } from '@/core/registry/types'
import type { BattleEvent } from '@/core/types'

// ---------- 工具 ----------

const baseDef: CharacterDef = {
  id: 'x',
  name: '无名',
  hp: 100,
  atk: 16,
  def: 8,
  speed: 20,
  activeInterval: 0,
}

function battle(p1?: Partial<CharacterDef>, p2?: Partial<CharacterDef>, seed = 42) {
  const p1Actor = createActor({ ...baseDef, id: 'p1', name: '甲', ...p1 })
  const p2Actor = createActor({ ...baseDef, id: 'p2', name: '乙', ...p2 })
  const b = new Battle(p1Actor, p2Actor, seed)
  return { b, p1: p1Actor, p2: p2Actor }
}

const of = <T extends BattleEvent['type']>(
  events: BattleEvent[],
  type: T,
): Extract<BattleEvent, { type: T }>[] =>
  events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type)

// ---------- 先手 ----------

describe('先手判定', () => {
  it('速度高者先手（battleStart.first）', () => {
    const { b } = battle({ speed: 30 }, { speed: 10 })
    const r = b.run()
    expect(r.events[0]).toMatchObject({ type: 'battleStart', first: 'p1' })
  })

  it('同速掷随机：固定 seed 结果确定且可复现', () => {
    const { b: b1 } = battle({ speed: 20 }, { speed: 20 }, 42)
    const { b: b2 } = battle({ speed: 20 }, { speed: 20 }, 42)
    const r1 = b1.run()
    const r2 = b2.run()
    // seed 42 的随机流首值 ≈ 0.601 ≥ 0.5 → p2 先手
    expect(r1.events[0]).toMatchObject({ type: 'battleStart', first: 'p2' })
    expect(r1.events).toEqual(r2.events)
  })
})

// ---------- 冒烟对局 ----------

describe('冒烟对局', () => {
  it('双方无钩子互普攻：13 回合后先手方胜，事件序列合法', () => {
    // 速度差使先手确定（p1 先手），先手方第 13 次行动完成击杀
    const { b } = battle({ speed: 30 })
    const r = b.run()
    // 每回合双方各掉 8 血，乙在第 13 回合甲的行动中死亡
    expect(r.outcome).toBe('p1')
    expect(r.rounds).toBe(13)
    // battleEnd 收尾，death 在其之前
    expect(r.events.at(-1)).toMatchObject({ type: 'battleEnd', outcome: 'p1', totalRounds: 13 })
    expect(r.events.at(-2)).toMatchObject({ type: 'death', side: 'p2' })
    // 每个完整回合的 phase 循环正确
    expect(of(r.events, 'roundStart')).toHaveLength(13)
    expect(of(r.events, 'battleStart')).toHaveLength(1)
  })
})

// ---------- 封锁 ----------

describe('封锁与状态到期', () => {
  it('眩晕封锁整回合：actionBlocked 带目标方，结算后到期恢复', () => {
    const { b } = battle(undefined, {
      onRoundStart(ctx) {
        if (ctx.self.vars.applied !== 1) {
          ctx.self.vars.applied = 1 // 只施加一次，否则每回合重新刷新永不过期
          ctx.block(ctx.self, '眩晕', 1, 'action')
        }
      },
    })
    const r = b.run()
    // R1 乙被封锁；R1 结算 1→0 并发 statusExpire；R2 起正常行动
    const blocked = of(r.events, 'actionBlocked')
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({ reason: 'stun', side: 'p2', round: 1 })
    expect(of(r.events, 'statusExpire')).toMatchObject([{ status: '眩晕', side: 'p2' }])
  })

  it('仅阻止主动技能：禁锢期间主动技回合降级为普攻，到期恢复', () => {
    const { b } = battle(
      {
        activeInterval: 2,
        activeSkill(ctx) {
          ctx.attack({ kind: 'attack', base: 16, label: '技' })
        },
        onRoundStart(ctx) {
          if (ctx.self.vars.applied !== 1) {
            ctx.self.vars.applied = 1
            ctx.block(ctx.self, '禁锢', 3, 'active')
          }
        },
      },
      undefined,
    )
    const r = b.run()
    // 甲的攻击动作：R1 普攻、R2 主动技回合被禁锢降级普攻、R3 普攻、R4 恢复主动技
    const starts = of(r.events, 'attackStart').filter((e) => e.side === 'p1')
    expect(starts.slice(0, 4).map((e) => e.label)).toEqual(['普攻', '普攻', '普攻', '技'])
  })
})

// ---------- 平局上限 ----------

describe('回合上限平局', () => {
  it('打不死 → 100 回合 battleEnd draw，无死亡事件', () => {
    const { b } = battle({ hp: 1000, def: 999 }, { hp: 1000, def: 999 })
    const r = b.run()
    expect(r.outcome).toBe('draw')
    expect(r.rounds).toBe(100)
    expect(r.events.at(-1)).toMatchObject({ type: 'battleEnd', outcome: 'draw', totalRounds: 100 })
    expect(of(r.events, 'death')).toHaveLength(0)
  })
})

// ---------- 反击反杀 ----------

describe('反击反杀', () => {
  it('低血攻击闪避角色 → 攻击方被反击打死 → 目标获胜', () => {
    const { b } = battle({ hp: 10 }, { beforeHit: () => false })
    const r = b.run()
    expect(r.outcome).toBe('p2')
    expect(r.events.at(-1)).toMatchObject({ type: 'battleEnd', outcome: 'p2' })
    expect(of(r.events, 'death')).toMatchObject([{ side: 'p1' }])
  })
})
