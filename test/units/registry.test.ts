import { describe, expect, it } from 'vitest'

import { CHARACTERS, getCharacter, listCharacters } from '@/core/registry'

/**
 * 注册表健全性测试 —— 全角色自动覆盖。
 * 添加新角色后此处无需改动；注册错误（缺字段/非法值/成对声明缺失）当场暴露。
 */
describe('注册表健全性（全角色）', () => {
  const all = Object.values(CHARACTERS);

  it('注册表非空（防误删/聚合失效）', () => {
    expect(all.length).toBeGreaterThan(0)
  })

  it('id 唯一且非空', () => {
    const ids = all.map((d) => d.id)
    expect(ids.every((id) => id.length > 0)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('面板数值合法（正数）', () => {
    for (const def of all) {
      expect(def.hp, `${def.id}.hp`).toBeGreaterThan(0)
      expect(def.atk, `${def.id}.atk`).toBeGreaterThanOrEqual(0)
      expect(def.def, `${def.id}.def`).toBeGreaterThanOrEqual(0)
      expect(def.speed, `${def.id}.speed`).toBeGreaterThan(0)
      expect(def.name, `${def.id}.name`).toBeTruthy()
    }
  })

  it('activeInterval 与 activeSkill 成对声明', () => {
    for (const def of all) {
      expect(def.activeInterval, `${def.id}.activeInterval`).toBeGreaterThanOrEqual(0)
      if (def.activeInterval > 0) {
        expect(
          def.activeSkill,
          `${def.id} 声明了主动技节奏但没实现 activeSkill`,
        ).toBeDefined()
      }
    }
  })

  it('vars 预置值必须是 number', () => {
    for (const def of all) {
      for (const [k, v] of Object.entries(def.vars ?? {})) {
        expect(typeof v, `${def.id}.vars.${k}`).toBe('number')
      }
    }
  })

  it('vars 保留键约束：temp 前缀键不应预置（结算段每回合清零，预置无意义）', () => {
    for (const def of all) {
      for (const k of Object.keys(def.vars ?? {})) {
        expect(
          k.startsWith('temp'),
          `${def.id}.vars.${k} 是临时键（temp 前缀，结算清零），不应出现在 def.vars 预置中`,
        ).toBe(false)
      }
    }
  })

  it('id 命名规范：小写字母开头，仅含小写字母/数字/下划线（日志与导出安全）', () => {
    for (const def of all) {
      expect(def.id, `${def.name} 的 id`).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('listCharacters 与 CHARACTERS 一致，且带版本标签', () => {
    const list = listCharacters()
    expect(list.length).toBe(all.length)
    for (const item of list) {
      expect(CHARACTERS[item.id]).toBeDefined()
      expect(item.version).toBeTruthy()
    }
  })

  it('getCharacter：合法 id 返回定义，未注册 id 抛错（fail fast）', () => {
    const [first] = Object.keys(CHARACTERS)
    expect(getCharacter(first!).id).toBe(first)
    expect(() => getCharacter('__not_registered__')).toThrow(/未注册/)
  })
})
