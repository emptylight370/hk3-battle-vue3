<script setup lang="ts">
import { computed, ref } from 'vue';

import { getCharacter, listCharacters } from '@/core/registry';

const open = ref(true); // 折叠开关（默认展开）
const characters = listCharacters();
const selectedId = ref(characters[0]?.id ?? '');

/** 选中角色的完整定义（含 Hooks，但展示时只取数值字段） */
const def = computed(() => (selectedId.value ? getCharacter(selectedId.value) : null));
/** 版本标签（listCharacters 与注册表同源，按 id 反查） */
const version = computed(
  () => characters.find((c) => c.id === selectedId.value)?.version ?? '',
);
/** vars 数值参数袋（如 rewindDepth 等，供查看） */
const varsEntries = computed(() => Object.entries(def.value?.vars ?? {}));
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header" @click="open = !open">
        <span>查看单个角色面板</span>
        <span class="arrow" :class="{ open }">▾</span>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="open">
        <el-select v-model="selectedId" placeholder="选择角色" class="picker">
          <el-option
            v-for="c in characters"
            :key="c.id"
            :value="c.id"
            :label="`[${c.version}] ${c.name}`"
          />
        </el-select>

        <template v-if="def">
          <el-descriptions :column="3" size="small" class="panel" border>
            <el-descriptions-item label="名称" :span="1">{{ def.name }}</el-descriptions-item>
            <el-descriptions-item label="版本" :span="1">{{ version }}</el-descriptions-item>
            <el-descriptions-item label="主动技" :span="1">
              {{ def.activeInterval > 0 ? `每 ${def.activeInterval} 回合` : '无' }}
            </el-descriptions-item>
            <el-descriptions-item label="HP">{{ def.hp }}</el-descriptions-item>
            <el-descriptions-item label="攻击">{{ def.atk }}</el-descriptions-item>
            <el-descriptions-item label="防御">{{ def.def }}</el-descriptions-item>
            <el-descriptions-item label="速度" :span="1">{{ def.speed }}</el-descriptions-item>
          </el-descriptions>

          <template v-if="varsEntries.length">
            <el-divider content-position="left">数值参数（vars）</el-divider>
            <el-descriptions :column="3" size="small">
              <el-descriptions-item v-for="[k, v] in varsEntries" :key="k" :label="k">
                {{ v }}
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </template>
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
.picker {
  width: 100%;
  margin-bottom: 12px;
}
.panel {
  margin-top: 4px;
}
</style>
