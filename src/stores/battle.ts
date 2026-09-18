import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

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

// ---------- 表单持久化（localStorage；运行状态不落盘） ----------

const PERSIST_KEY = 'battle.form.v1';

/** 持久化的表单字段（版本键 v1：字段结构变更时升版本，旧数据自然失效） */
interface PersistedForm {
  p1Id?: string;
  p2Id?: string;
  count?: number;
  seed?: number;
  randomMode?: boolean;
  logFirst?: boolean;
}

function loadForm(): PersistedForm {
  try {
    return JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '{}') as PersistedForm;
  } catch {
    return {}; // 隐私模式/配额/解析失败：静默降级为默认值
  }
}

function saveForm(form: PersistedForm): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(form));
  } catch {
    /* 写失败不影响功能 */
  }
}

/** 轻量校验：localStorage 里的旧数据可能类型不符，逐字段守卫 */
function restoreForm(): Required<PersistedForm> {
  const s = loadForm();
  const characters = listCharacters();
  const isStr = (v: unknown): v is string => typeof v === 'string';
  const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return {
    p1Id: isStr(s.p1Id) ? s.p1Id : (characters[0]?.id ?? ''),
    p2Id: isStr(s.p2Id) ? s.p2Id : (characters[1]?.id ?? ''),
    count: isNum(s.count) && s.count > 0 ? s.count : 1000,
    seed: isNum(s.seed) && s.seed >= 0 ? s.seed : 42,
    randomMode: s.randomMode === true,
    logFirst: s.logFirst !== false, // 缺省 true（与默认行为一致）
  };
}

export const useBattleStore = defineStore('battle', () => {
  // ---------- 表单状态（首次创建即从 localStorage 还原，等价 onLoad） ----------
  const characters = listCharacters();
  const saved = restoreForm();
  const p1Id = ref(saved.p1Id);
  const p2Id = ref(saved.p2Id);
  const count = ref(saved.count);
  const seed = ref(saved.seed);
  const logFirst = ref(saved.logFirst); // 首场携带事件流（时间轴数据源）
  const randomMode = ref(saved.randomMode); // 种子随机模式：运行时自动生成随机种子，忽略输入框值

  // 表单任一字段变化即持久化（浅监听各 ref；写入失败静默）
  watch([p1Id, p2Id, count, seed, randomMode, logFirst], () => {
    saveForm({
      p1Id: p1Id.value,
      p2Id: p2Id.value,
      count: count.value,
      seed: seed.value,
      randomMode: randomMode.value,
      logFirst: logFirst.value,
    });
  });

  // ---------- 运行状态 ----------
  const running = ref(false);
  const progress = ref({ done: 0, total: 0 });
  const result = ref<BatchResult | null>(null);
  const error = ref<string | null>(null);
  const lastSeed = ref<number | null>(null); // 最近一次实际使用的种子（结果可复现的锚点）

  // ---------- 派生 ----------
  const progressPercent = computed(() =>
    progress.value.total > 0 ? Math.round((progress.value.done / progress.value.total) * 100) : 0,
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
