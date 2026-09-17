import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { listCharacters } from '@/core/registry';
import type { BatchResult } from '@/core/types';
import { runBatch } from '@/workers/batchClient';

// ============================================================
// 对战 store —— M3 UI 的唯一状态源
//
// 纪律（registry/index.ts 头注释）：
// - 只 import batchClient / registry/index.ts / core/types；
// - 引擎跑在 Worker 线程，store 只做协议状态机：
//   idle → running（含进度）→ done / error。
// ============================================================

export const useBattleStore = defineStore('battle', () => {
  // ---------- 表单状态 ----------
  const characters = listCharacters();
  const p1Id = ref(characters[0]?.id ?? '');
  const p2Id = ref(characters[1]?.id ?? '');
  const count = ref(1000);
  const seed = ref(42);
  const logFirst = ref(true); // 首场携带事件流（时间轴数据源）
  const randomMode = ref(false); // 种子随机模式：运行时自动生成随机种子，忽略输入框值

  // ---------- 运行状态 ----------
  const running = ref(false);
  const progress = ref({ done: 0, total: 0 });
  const result = ref<BatchResult | null>(null);
  const error = ref<string | null>(null);
  const lastSeed = ref<number | null>(null); // 最近一次实际使用的种子（结果可复现的锚点）

  // ---------- 派生 ----------
  const progressPercent = computed(() =>
    progress.value.total > 0
      ? Math.round((progress.value.done / progress.value.total) * 100)
      : 0,
  );

  /** 胜率百分比（含平局），无结果时 null */
  const winRates = computed<{ p1: number; p2: number; draw: number } | null>(() => {
    const r = result.value;
    if (!r) return null;
    const total = r.p1Win + r.p2Win + r.draw;
    if (total === 0) return null;
    const pct = (n: number) => Math.round((n / total) * 1000) / 10;
    return { p1: pct(r.p1Win), p2: pct(r.p2Win), draw: pct(r.draw) };
  });

  // ---------- 动作 ----------

  /** 随机种子：填满 32 位无符号空间（rng 内部 seed>>>0） */
  function randomSeed(): number {
    return Math.floor(Math.random() * 0x1_0000_0000);
  }

  async function run(): Promise<void> {
    if (running.value) return;
    running.value = true;
    error.value = null;
    result.value = null;

    // 随机模式：运行时生成随机种子并回写输入框（可复现、可复制）
    const usedSeed = randomMode.value ? randomSeed() : seed.value;
    if (randomMode.value) seed.value = usedSeed;

    try {
      lastSeed.value = usedSeed; // 记录实际使用的种子，运行后展示
      result.value = await runBatch(
        {
          p1: p1Id.value,
          p2: p2Id.value,
          count: count.value,
          seed: usedSeed,
          logFirst: logFirst.value,
        },
        (done, total) => {
          progress.value = { done, total };
        },
      );
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      running.value = false;
    }
  }

  return {
    // 表单
    characters,
    p1Id,
    p2Id,
    count,
    seed,
    logFirst,
    randomMode,
    // 运行
    running,
    progress,
    progressPercent,
    result,
    error,
    winRates,
    lastSeed,
    // 动作
    run,
  };
});
