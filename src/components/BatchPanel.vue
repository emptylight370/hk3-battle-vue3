<script setup lang="ts">
import { useBattleStore } from '@/stores/battle';
import { ElMessage } from 'element-plus';
import { computed, watch } from 'vue';
import ActorPicker from './ActorPicker.vue';

const store = useBattleStore();

// 数值输入约束
const safeCount = computed({
  get: () => store.count,
  set: (v: number | undefined) => (store.count = Math.max(1, Math.min(1_000_000, v ?? 1))),
});
const safeSeed = computed({
  get: () => store.seed,
  set: (v: number | undefined) => (store.seed = Math.max(0, Math.floor(v ?? 0))),
});

// 错误气泡提示（store 保持框架无关，消息提示放组件层）
watch(
  () => store.error,
  (e) => {
    if (e) ElMessage.error(e);
  },
);

// 胜率条：平局灰、p1 蓝、p2 红
const bars = computed(() => {
  const r = store.winRates;
  if (!r) return null;
  return [
    { label: '左边胜', value: r.p1, color: '#409eff' },
    { label: '平局', value: r.draw, color: '#909399' },
    { label: '右边胜', value: r.p2, color: '#f56c6c' },
  ];
});
</script>

<template>
  <el-card shadow="never">
    <template #header>对战配置</template>

    <el-form label-width="72px" @submit.prevent>
      <el-form-item label="左边">
        <ActorPicker side="p1" />
      </el-form-item>
      <el-form-item label="右边">
        <ActorPicker side="p2" />
      </el-form-item>
      <el-form-item label="对局数">
        <el-input-number v-model="safeCount" :min="1" :max="1000000" :step="100" />
      </el-form-item>
      <el-form-item label="种子">
        <el-input-number v-model="safeSeed" :min="0" :step="1" :disabled="store.randomMode" />
        <el-button
          :type="store.randomMode ? 'primary' : 'default'"
          :plain="store.randomMode"
          class="dice"
          @click="store.randomMode = !store.randomMode"
        >
          随机{{ store.randomMode ? '开' : '关' }}
        </el-button>
        <span v-if="store.lastSeed !== null" class="seed-used">使用种子 {{ store.lastSeed }}</span>
      </el-form-item>
      <el-form-item label="首场日志">
        <el-switch v-model="store.logFirst" />
        <span class="hint">首场（seed 本身）携带事件流，用于时间轴</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="store.running" :disabled="store.p1Id === store.p2Id" @click="store.run()">
          {{ store.running ? '对局中…' : '开始批量对局' }}
        </el-button>
        <span v-if="store.p1Id === store.p2Id" class="hint">双方不能相同</span>
      </el-form-item>
    </el-form>

    <template v-if="store.running">
      <el-progress
        :percentage="store.progressPercent"
        :format="() => `${store.progress.done}/${store.progress.total}`"
      />
    </template>

    <template v-if="bars">
      <el-divider content-position="left"
        >结果（共 {{ store.result!.p1Win + store.result!.p2Win + store.result!.draw }} 场）</el-divider
      >
      <div v-for="b in bars" :key="b.label" class="bar-row">
        <span class="bar-label">{{ b.label }}</span>
        <el-progress :percentage="b.value" :color="b.color" :stroke-width="16" :format="() => `${b.value}%`" />
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.dice {
  margin-left: 8px;
}
.seed-used {
  margin-left: 12px;
  color: var(--el-color-primary);
  font-size: 12px;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.bar-label {
  width: 56px;
  flex: none;
  text-align: right;
  font-size: 13px;
}
.bar-row :deep(.el-progress) {
  flex: 1;
}
</style>
