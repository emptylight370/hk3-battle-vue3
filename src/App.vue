<script setup lang="ts">
import BatchPanel from '@/components/BatchPanel.vue';
import BattleLog from '@/components/BattleLog.vue';
import OddsCalc from './components/OddsCalc.vue';
import ActorView from './components/ActorView.vue';
</script>

<template>
  <el-container class="layout">
    <el-header class="header">
      <h1 class="title">对战模拟器</h1>
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
</style>
