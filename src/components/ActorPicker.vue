<script setup lang="ts">
import { computed } from 'vue';
import { useBattleStore } from '@/stores/battle';

// 双方角色选择器：直接绑定 store 的 p1Id / p2Id
const props = defineProps<{ side: 'p1' | 'p2' }>();

const store = useBattleStore();
const model = computed({
  get: () => (props.side === 'p1' ? store.p1Id : store.p2Id),
  set: (v: string) => (props.side === 'p1' ? (store.p1Id = v) : (store.p2Id = v)),
});
const label = props.side === 'p1' ? '左边' : '右边';
</script>

<template>
  <el-select v-model="model" :placeholder="`选择${label}角色`" class="picker">
    <el-option v-for="c in store.characters" :key="c.id" :value="c.id" :label="`[${c.version}] ${c.name}`" />
  </el-select>
</template>

<style scoped>
.picker {
  width: 100%;
}
</style>
