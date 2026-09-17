<script setup lang="ts">
import ActorView from '@/components/ActorView.vue';
import BatchPanel from '@/components/BatchPanel.vue';
import BattleLog from '@/components/BattleLog.vue';
import OddsCalc from '@/components/OddsCalc.vue';
import { ref } from 'vue';

const dark = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

function toggleDark() {
  if (dark.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
</script>

<template>
  <el-container class="layout">
    <el-header class="header">
      <h1 class="title">崩坏三斗蛐蛐模拟器</h1>
      <el-switch
        v-model="dark"
        @change="toggleDark"
        active-text="NIGHT"
        inactive-text="DAY"
        class="dark-switch"
      ></el-switch>
    </el-header>
    <el-main class="main">
      <el-row :gutter="16">
        <el-col :xs="24" :md="10">
          <BatchPanel />
        </el-col>
        <el-col :xs="24" :md="14">
          <BattleLog />
        </el-col>
        <el-col :xs="24" :md="10">
          <OddsCalc />
        </el-col>
        <el-col :xs="24" :md="14">
          <ActorView />
        </el-col>
      </el-row>
    </el-main>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}
.header {
  border-bottom: 1px solid var(--el-border-color-light);
  display: flex;
  align-items: center;
}
.title {
  font-size: 18px;
  margin: 0;
}
.main {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
.dark-switch {
  --el-switch-on-color: #272525;
  /* --el-switch-off-color: #818080; */
  position: absolute;
  right: 30px;
}
</style>
