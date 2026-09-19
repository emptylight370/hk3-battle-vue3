import { describe, expect, it } from 'vitest';

import { batch, runOne } from '@/core/simulate';
import type { BatchRequest } from '@/core/types';
import { runBattle } from '../helpers';

// ============================================================
// 批量统计层测试 —— simulate.batch 的协议与确定性
//
// Worker 是 batch 的薄包装（Vitest Node 环境无 Worker 运行时，
// 不做运行时测试）；本文件锁住 batch 的全部行为契约。
// ============================================================

const P1 = 'seele';
const P2 = 'xinadia';

const req = (over: Partial<BatchRequest> = {}): BatchRequest => ({
  p1: P1,
  p2: P2,
  count: 20,
  seed: 1,
  ...over,
});

// 用测试侧独立路径（helpers.runBattle）聚合期望结果
function expectedByDirectRun(p1: string, p2: string, seed: number, count: number) {
  let p1Win = 0;
  let p2Win = 0;
  let draw = 0;
  for (let i = 0; i < count; i++) {
    const o = runBattle(p1, p2, seed + i).outcome;
    if (o === 'p1') p1Win++;
    else if (o === 'p2') p2Win++;
    else draw++;
  }
  return { p1Win, p2Win, draw };
}

describe('batch — 基本协议', () => {
  it('总数守恒：p1Win + p2Win + draw = count，id 回显', () => {
    const r = batch(req({ count: 30 }));
    expect(r.p1).toBe(P1);
    expect(r.p2).toBe(P2);
    expect(r.p1Win + r.p2Win + r.draw).toBe(30);
    expect(r.draw).toBeLessThan(30); // 非退化：不能全是平局（引擎失效信号）
  });

  it('第二组阵容抽查：同样守恒且非全平局', () => {
    const r = batch(req({ p1: 'bronya', p2: 'kelali', count: 10 }));
    expect(r.p1Win + r.p2Win + r.draw).toBe(10);
    expect(r.draw).toBeLessThan(10);
  });

  it('count = 0 → 全零结果', () => {
    const r = batch(req({ count: 0 }));
    expect(r).toEqual({ p1: P1, p2: P2, p1Win: 0, p2Win: 0, draw: 0 });
  });

  it('未知角色 id 抛错（fail fast）', () => {
    expect(() => batch(req({ p2: 'nobody' }))).toThrow(/未注册/);
  });

  it('带版本调用：精确命中该版本，不回退聚合表', () => {
    // 当前仅 202609 一个版本：带正确版本 = 正常；带未注册版本 = 抛错（证明版本确实参与解析）
    const r = batch(req({ count: 3, seed: 1, p1Version: '202609', p2Version: '202609' }));
    expect(r.p1Win + r.p2Win + r.draw).toBe(3);
    expect(() => batch(req({ count: 1, p1Version: '19990101' }))).toThrow(/19990101/);
  });
});

describe('batch — 确定性与 seed 派生', () => {
  it('同请求两次运行结果逐字段相等（幂等）', () => {
    const a = batch(req({ count: 15 }));
    const b = batch(req({ count: 15 }));
    expect(a).toEqual(b);
  });

  it('seed 派生 = seed + i：与逐场独立运行聚合一致', () => {
    const r = batch(req({ count: 20, seed: 7 }));
    expect(r).toMatchObject(expectedByDirectRun(P1, P2, 7, 20));
  });

  it('基准 seed 平移后的批次结果合法且守恒', () => {
    const a = batch(req({ count: 10, seed: 1 }));
    const b = batch(req({ count: 10, seed: 2 }));
    for (const r of [a, b]) {
      expect(r.p1Win + r.p2Win + r.draw).toBe(10);
      expect(r.draw).toBeLessThan(10);
    }
  });
});

describe('batch — logFirst 首场事件流', () => {
  it('logFirst: 携带第 0 场（seed 本身）完整事件流', () => {
    const r = batch(req({ count: 5, seed: 100, logFirst: true }));
    const first = runOne(P1, P2, 100);
    expect(r.firstEvents).toEqual(first.events);
    expect(r.firstEvents!.length).toBeGreaterThan(0);
  });

  it('缺省不携带事件流', () => {
    const r = batch(req({ count: 5 }));
    expect(r.firstEvents).toBeUndefined();
  });
});
