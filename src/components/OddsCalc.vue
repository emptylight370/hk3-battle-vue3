<script setup lang="ts">
import { computed, ref } from 'vue';

const open = ref(false); // 折叠开关（默认展开）
const odd1 = ref(0);
const odd2 = ref(0);

const rate = computed(() => {
  const total = odd1.value + odd2.value;
  if (total <= 0) return null;
  // 概率 → 百分比，保留 1 位小数（四舍五入）
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return { r1: pct(odd1.value), r2: pct(odd2.value) };
});
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header" @click="open = !open">
        <span>赔率计算胜率</span>
        <span class="arrow" :class="{ open }">▾</span>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="open">
        <el-text>输入赔率</el-text>
        <el-input-number v-model="odd1" :min="0" :step="0.1"></el-input-number>
        :
        <el-input-number v-model="odd2" :min="0" :step="0.1"></el-input-number>
        <br />
        <el-text>胜率：{{ rate ? `${rate.r1}:${rate.r2}` : '—' }}</el-text>
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.arrow {
  transition: transform 0.3s;
}
.arrow.open {
  transform: rotate(180deg);
}
</style>
