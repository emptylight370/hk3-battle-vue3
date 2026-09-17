<script setup lang="ts">
import { computed, ref } from 'vue';

const open = ref(false); // 折叠开关（默认展开）
const odd1 = ref(0);
const odd2 = ref(0);

const rate = computed(() => {
  const total = odd1.value + odd2.value;
  if (total <= 0) return null;
  const pct = (odd: number) => `${((odd / total) * 100).toFixed(1)}%`;
  // r1 用 odd2 归一化（交叉互倒）
  const r1 = pct(odd2.value);
  const r2 = pct(odd1.value);
  return { r1, r2 };
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
