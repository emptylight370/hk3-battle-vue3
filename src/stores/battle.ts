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

  // ---------- 运行状态 ----------
  const running = ref(false);
  const progress = ref({ done: 0, total: 0 });
  const result = ref<BatchResult | null>(null);
  const error = ref<string | null>(null);

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
  async function run(): Promise<void> {
    if (running.value) return;
    running.value = true;
    error.value = null;
    result.value = null;
    progress.value = { done: 0, total: count.value };

    try {
      result.value = await runBatch(
        {
          p1: p1Id.value,
          p2: p2Id.value,
          count: count.value,
          seed: seed.value,
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
    // 运行
    running,
    progress,
    progressPercent,
    result,
    error,
    winRates,
    // 动作
    run,
  };
});
