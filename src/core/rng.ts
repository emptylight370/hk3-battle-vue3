// ============================================================
// core/rng.ts —— 可播种确定性随机源（mulberry32）
//
// 契约：
// 1. 同 seed → 同序列（整个战斗确定性的地基）
// 2. 随机流只进不退：RNG 状态不进角色快照（时间倒转回溯状态但不回溯随机流）
// 3. 语义 helper 集中于此：角色代码一律经 ctx.rng() 调用，
//    便于 grep 出全部随机消费点并钉死每个角色的消耗序列
// ============================================================

export interface Rng {
  /** [0, 1) 均匀浮点 —— 所有随机的基础原语 */
  next(): number;
  /** 概率判定：p 概率返回 true（陨石 20%、闪避 25%、复活 15%…） */
  chance(p: number): boolean;
  /** [min, max] 均匀整数，含两端 —— 对应 Python random.randint 语义 */
  int(min: number, max: number): number;
  /** 等概率多选一 —— 游云三选一 */
  pick<T>(items: readonly T[]): T;
}

/** 创建可播种随机源（mulberry32）：同 seed 产生完全相同的序列 */
export function createRng(seed: number): Rng {
  // seed 归一化到 uint32
  let a = seed >>> 0;

  // mulberry32：32 位内部状态，每次调用移位异或 + 自增
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };

  return {
    next,
    chance: (p) => next() < p,
    // 含两端：+1 不可省（屏障 4~10 为均匀整数）
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      // next() < 1 保证索引不越界
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
