import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { baselineOf, runBattle, type BattleBaseline } from './helpers'
import type { VersionTag } from '@/core/registry'

// ============================================================
// 回归测试 —— 固定 seed 对局基准（版本化）
//
// 用法：
// 1. 在 CASES 登记基准对局 [version, p1Id, p2Id, seed]；
//    角色一律按版本取用（getCharacterIn，不跨版本回退）——
//    合入新版本注册表后，旧 CASES 继续测旧版本数据，不随聚合表漂移。
// 2. 首次生成基准：UPDATE_BASELINES=1 pnpm test（PowerShell：
//    $env:UPDATE_BASELINES='1'; pnpm test），确认数值合理后提交 json；
// 3. 此后任何代码改动导致基准变化 = 行为漂移，必须查明原因，
//    确属有意变更才更新基准并回填设计文档。
// ============================================================

const BASELINE_URL = new URL('./__baselines__/regression.json', import.meta.url)
// Windows 下 URL.pathname 是 "/D:/..."，直接交给 fs 会得到 "D:\D:\..."；必须经 fileURLToPath 转换
const BASELINE_PATH = fileURLToPath(BASELINE_URL)
const UPDATE = process.env.UPDATE_BASELINES === '1'

/** 基准对局表：新版本/新角色合入后在此登记（version = 角色所属版本目录） */
const CASES: [version: VersionTag, p1Id: string, p2Id: string, seed: number][] = [
  ['202609', 'bronya', 'kelali', 42],
  ['202609', 'seele', 'xinadia', 42],
  ['202609', 'kiana', 'mei', 7],
];

const key = ([v, p1, p2, seed]: (typeof CASES)[number]) => `${v}.${p1}vs${p2}@${seed}`;

// ---------- 确定性自检（不依赖基准文件，任何时期都有效） ----------

describe('确定性自检', () => {
  it('同 seed 两次运行，事件流逐条相等', () => {
    const r1 = runBattle('seele', 'xinadia', 42, '202609');
    const r2 = runBattle('seele', 'xinadia', 42, '202609');
    expect(baselineOf(r1)).toEqual(baselineOf(r2));
  });

  it('不同 seed 产生不同事件流（排除退化）', () => {
    const r1 = runBattle('seele', 'xinadia', 42, '202609');
    const r2 = runBattle('seele', 'xinadia', 43, '202609');
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
        const [v, p1, p2, seed] = c;
        out[key(c)] = baselineOf(runBattle(p1, p2, seed, v));
      }
      mkdirSync(dirname(BASELINE_PATH), { recursive: true });
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

  it.each(CASES)('%s: %s vs %s @%i 与基准一致', (v, p1, p2, seed) => {
    const k = key([v, p1, p2, seed]);
    const r = runBattle(p1, p2, seed, v);
    expect(baselineOf(r)).toEqual(baselines[k]);
  });
});
