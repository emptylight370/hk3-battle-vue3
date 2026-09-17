import { describe, expect, it } from 'vitest'

import { Battle } from '@/core/engine'
import { BattleCtx } from '@/core/context'
import { createActor } from '@/core/actor'
import { CHARACTERS, getCharacter } from '@/core/registry'
import type { CharacterDef } from '@/core/registry/types'
import type { BattleEvent } from '@/core/types'
import { createRng } from '@/core/rng'
import { of } from '../helpers'

// ============================================================
// 角色契约测试 —— 对全部注册角色自动执行，无需随角色增加而改动。
// 新角色加入注册表后自动获得以下检查；失败即角色实现有问题。
// ============================================================

const all: CharacterDef[] = Object.values(CHARACTERS)
const ids = all.map((d) => d.id)

/** 无威胁木桩（高血量、零攻击，保证被测角色不会先死） */
const dummyDef: CharacterDef = {
  id: 'dummy',
  name: '木桩',
  hp: 10000,
  atk: 0,
  def: 0,
  speed: 0,
  activeInterval: 0,
}

function vsDummy(id: string, seed: number) {
  const b = new Battle(createActor(getCharacter(id)), createActor(dummyDef), seed)
  return b.run()
}

function vsEachOther(p1: string, p2: string, seed: number) {
  const b = new Battle(createActor(getCharacter(p1)), createActor(getCharacter(p2)), seed)
  return b.run()
}

/** 事件流合法性校验：每个事件成员的字段类型与取值范围 */
function validateEvents(events: BattleEvent[]): void {
  for (const e of events) {
    expect(e.round, `${e.type} round`).toBeGreaterThanOrEqual(0)
    expect(e.phase, `${e.type} phase`).toBeTruthy()
    switch (e.type) {
      case 'battleStart':
        expect(['p1', 'p2']).toContain(e.first)
        break
      case 'action':
        expect(e.skill.length).toBeGreaterThan(0)
        break
      case 'attackStart':
      case 'dodge':
      case 'proc':
      case 'passiveTrigger':
        expect(e.label.length, `${e.type} label`).toBeGreaterThan(0)
        break
      case 'damage':
        expect(e.label.length).toBeGreaterThan(0)
        expect(e.raw).toBeGreaterThanOrEqual(0)
        expect(e.dealt).toBeGreaterThanOrEqual(0)
        break
      case 'statusApply':
        expect(e.status.length).toBeGreaterThan(0)
        expect(e.sourceId.length).toBeGreaterThan(0)
        break
      case 'statusExpire':
        expect(e.status.length).toBeGreaterThan(0)
        break
      case 'revive':
        expect(e.hp).toBeGreaterThan(0)
        break
      case 'death':
        expect(['p1', 'p2']).toContain(e.side)
        break
      case 'battleEnd':
        expect(['p1', 'p2', 'draw']).toContain(e.outcome)
        expect(e.totalRounds).toBeGreaterThanOrEqual(1)
        break
      default:
        break
    }
  }
}

// ---------- 逐角色契约 ----------

describe.each(ids)('角色契约：%s', (id) => {
  it('对局冒烟：vs 木桩完整跑完，事件流合法且正常收尾', () => {
    const r = vsDummy(id, 42)
    expect(r.rounds).toBeLessThanOrEqual(100)
    expect(r.events.at(-1)?.type).toBe('battleEnd')
    validateEvents(r.events)
  })

  it('确定性：同 seed 两次运行事件流逐条一致', () => {
    const r1 = vsDummy(id, 7)
    const r2 = vsDummy(id, 7)
    expect(r1.events).toEqual(r2.events)
  })

  it('钩子冒烟：onRoundStart/onAction/onSettle 直接调用不抛错', () => {
    const me = createActor(getCharacter(id))
    const foe = createActor(dummyDef)
    const ctx = new BattleCtx(createRng(1), me, foe)
    ctx.round = 1
    ctx.phase = 'actions'
    ctx.beginAction(me)
    expect(() => {
      me.onRoundStart(ctx)
      me.onAction(ctx)
      me.onSettle(ctx)
    }).not.toThrow()
    validateEvents(ctx.events)
  })
})

// ---------- 全角色两两对局矩阵 ----------

describe('全角色两两对局矩阵', () => {
  const pairs: [string, string][] = []
  for (const a of ids) {
    for (const b of ids) {
      if (a !== b) pairs.push([a, b])
    }
  }

  it.each(pairs)('%s vs %s @42：正常收尾且事件流合法', (a, b) => {
    const r = vsEachOther(a, b, 42)
    expect(r.rounds).toBeLessThanOrEqual(100)
    expect(['p1', 'p2', 'draw']).toContain(r.outcome)
    expect(r.events.at(-1)?.type).toBe('battleEnd')
    validateEvents(r.events)
  })

  it('非平局对局必有败者死亡事件（死亡判定完备）', () => {
    for (const [a, b] of pairs.slice(0, 12)) {
      const r = vsEachOther(a, b, 7)
      if (r.outcome !== 'draw') {
        const loser = r.outcome === 'p1' ? 'p2' : 'p1'
        expect(of(r.events, 'death').some((e) => e.side === loser)).toBe(true)
      }
    }
  })
})
