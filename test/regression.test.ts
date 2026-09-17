import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

import { baselineOf, runBattle, type BattleBaseline } from './helpers'

// ============================================================
// 回归测试 —— 固定 seed 对局基准
//
// 用法：
// 1. 新角色合入后，在 CASES 登记基准对局 [p1Id, p2Id, seed]；
// 2. 首次生成基准：UPDATE_BASELINES=1 pnpm test（PowerShell：
//    $env:UPDATE_BASELINES='1'; pnpm test），确认数值合理后提交 json；
// 3. 此后任何代码改动导致基准变化 = 行为漂移，必须查明原因，
//    确属有意变更才更新基准并回填设计文档的校准记录。
// ============================================================

const BASELINE_PATH = new URL('./__baselines__/regression.json', import.meta.url)
const UPDATE = process.env.UPDATE_BASELINES === '1'

/** 基准对局表：新角色合入后在此登记 */
const CASES: [p1Id: string, p2Id: string, seed: number][] = [
  // TODO(M1): 角色齐全后登记，如 ['bronya', 'korali', 42]
];

const key = ([p1, p2, seed]: (typeof CASES)[number]) => `${p1}vs${p2}@${seed}`;

// ---------- 确定性自检（不依赖基准文件，任何时期都有效） ----------

describe('确定性自检', () => {
  it('同 seed 两次运行，事件流逐条相等', () => {
    const r1 = runBattle('seele', 'xinadia', 42);
    const r2 = runBattle('seele', 'xinadia', 42);
    expect(baselineOf(r1)).toEqual(baselineOf(r2));
  });

  it('不同 seed 产生不同事件流（排除退化）', () => {
    const r1 = runBattle('seele', 'xinadia', 42);
    const r2 = runBattle('seele', 'xinadia', 43);
    expect(baselineOf(r1).sig).not.toBe(baselineOf(r2).sig);
  });
});

// ---------- 基准对局 ----------

const d = CASES.length > 0 ? describe : describe.skip;

d('回归基准对局', () => {
  // 首次生成 / 显式更新：合并写入（新结果覆盖同 key，保留未登记的旧基准）
  if (UPDATE) {
    it('更新基准文件', () => {
      if (CASES.length === 0) {
        throw new Error('CASES 为空——拒绝覆盖基准文件（会清空已有基准）');
      }
      const out: Record<string, BattleBaseline> = existsSync(BASELINE_PATH)
        ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
        : {};
      for (const c of CASES) {
        out[key(c)] = baselineOf(runBattle(...c));
      }
      mkdirSync(dirname(BASELINE_PATH.pathname), { recursive: true });
      writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2));
      expect(Object.keys(out).length).toBeGreaterThan(0);
    });
    return;
  }

  const baselines: Record<string, BattleBaseline> = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
    : {};

  it('基准文件存在且覆盖全部登记对局', () => {
    expect(existsSync(BASELINE_PATH), `基准缺失：${BASELINE_PATH}（用 UPDATE_BASELINES=1 生成）`).toBe(true);
    for (const c of CASES) {
      expect(baselines[key(c)], `基准缺失：${key(c)}`).toBeDefined();
    }
  });

  it.each(CASES)('%s vs %s @%i 与基准一致', (p1, p2, seed) => {
    const k = key([p1, p2, seed]);
    const r = runBattle(p1, p2, seed);
    expect(baselineOf(r)).toEqual(baselines[k]);
  });
});
