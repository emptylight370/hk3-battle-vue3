<script setup lang="ts">
import { useBattleStore } from '@/stores/battle';
import type { VersionTag } from '@/core/registry';
import { computed } from 'vue';

// 双方角色选择器：直接绑定 store 的 p1Id/p1Version、p2Id/p2Version。
// 选项值 = `版本:id` 复合键——同名 id 的不同版本是不同选项，
// 选中即锁定版本，调用时精确命中，不因新版本覆盖而调错。
const props = defineProps<{ side: 'p1' | 'p2' }>();

const store = useBattleStore();
const model = computed({
  get: () => (props.side === 'p1' ? `${store.p1Version}:${store.p1Id}` : `${store.p2Version}:${store.p2Id}`),
  set: (v: string) => {
    const sep = v.indexOf(':');
    const version = v.slice(0, sep);
    const id = v.slice(sep + 1);
    if (props.side === 'p1') {
      store.p1Version = version as VersionTag;
      store.p1Id = id;
    } else {
      store.p2Version = version as VersionTag;
      store.p2Id = id;
    }
  },
});
const label = props.side === 'p1' ? '左边' : '右边';
</script>

<template>
  <el-select v-model="model" :placeholder="`选择${label}角色`" class="picker">
    <el-option
      v-for="c in store.characters"
      :key="`${c.version}:${c.id}`"
      :value="`${c.version}:${c.id}`"
      :label="`[${c.version}] ${c.name}`"
    />
  </el-select>
</template>

<style scoped>
.picker {
  width: 100%;
}
</style>
