import { describe, expect, it } from 'vitest';

import { createRng, type Rng } from '@/core/rng';

describe('createRng — 确定性', () => {
  it('同 seed 两次实例化，next() 序列逐值相等', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('不同 seed 产生不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
});

describe('createRng — 固定向量（防止换算法/改实现悄悄破坏下游回归种子）', () => {
  // mulberry32 标准实现，seed 0/1/42 的前 5 个输出（10 位小数截断比较）
  it.each([
    [0, [0.2664292087, 0.0003297457, 0.2232720274, 0.1462021479, 0.4673278229]],
    [1, [0.6270739406, 0.0027357212, 0.52744704, 0.9810509675, 0.9683778982]],
    [42, [0.6011037519, 0.448290559, 0.8524657935, 0.6697340414, 0.1748138987]],
  ])('seed %i 前 5 个值符合固定向量', (seed, expected) => {
    const rng = createRng(seed);
    for (const v of expected) {
      expect(rng.next()).toBeCloseTo(v, 9);
    }
  });
});

describe('createRng — 值域', () => {
  it('next() 1 万次全在 [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(4, 10) 1 万次全在 [4, 10] 且两端都出现（含两端语义）', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(4, 10);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen.has(4)).toBe(true);
    expect(seen.has(10)).toBe(true);
  });

  it('pick 返回集合内成员且等概率覆盖所有成员', () => {
    const rng = createRng(7);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const v = rng.pick(items);
      expect(items).toContain(v);
      seen.add(v);
    }
    expect(seen.size).toBe(3);
  });
});

describe('createRng — helper 随机流消耗数（各恰好 1 次 next）', () => {
  // helper 闭包引用内部 next，无法从外部拦截；
  // 改用同 seed 双实例比对：helper 消耗 n 次后，主实例的下一个值 = 参照序列第 n+1 个（下标 n）
  const consumed = (use: (rng: Rng) => unknown): number => {
    const main = createRng(99);
    const ref = createRng(99);
    const refSeq = Array.from({ length: 4 }, () => ref.next());
    use(main);
    const idx = refSeq.indexOf(main.next());
    expect(idx).toBeGreaterThanOrEqual(0); // 主实例下一个值必须能在参照序列中定位
    return idx;
  };

  it('chance 消耗 1 次 next', () => {
    expect(consumed((r) => r.chance(0.5))).toBe(1);
  });

  it('int 消耗 1 次 next', () => {
    expect(consumed((r) => r.int(4, 10))).toBe(1);
  });

  it('pick 消耗 1 次 next', () => {
    expect(consumed((r) => r.pick(['x', 'y']))).toBe(1);
  });
});
