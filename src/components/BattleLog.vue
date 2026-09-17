<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BattleEvent } from '@/core/types';
import { useBattleStore } from '@/stores/battle';

// ============================================================
// 单场事件时间轴 —— BatchResult.firstEvents 的渲染视图
//
// 结构化事件（core/types）→ 官方日志式文案。分组：
// - round 0 的 battleStart 单独一行（含先手信息）
// - 其余按回合折叠（el-collapse），行内带 phase 标签
// ============================================================

const store = useBattleStore();

const open = ref(true);

/** side → 角色名（经 store 的表单选择解析） */
function nameOf(side: Side): string {
  if (side === 'p1') return nameById(store.p1Id);
  return nameById(store.p2Id);
}
function nameById(id: string): string {
  return store.characters.find((c) => c.id === id)?.name ?? id;
}
function other(side: Side): Side {
  return side === 'p1' ? 'p2' : 'p1';
}

const BLOCK_REASON: Record<string, string> = {
  stun: '眩晕',
  paralysis: '麻痹',
  transform: '变身封锁',
};

/** 事件 → 日志文案（措辞对齐官方日志） */
function describe(e: BattleEvent): string {
  switch (e.type) {
    case 'battleStart':
      return `战斗开始，${nameOf('p1')} 对战 ${nameOf('p2')}，${nameOf(e.first)} 先手`;
    case 'passiveTrigger':
      return `被动【${e.label}】触发${e.detail ? `：${e.detail}` : ''}`;
    case 'action':
      return e.isNormal ? '' : `${nameOf(e.side ?? 'p1')} 使用主动技能【${e.skill}】`;
    case 'actionBlocked':
      return `${nameOf(e.side ?? 'p1')} 处于${BLOCK_REASON[e.reason] ?? e.reason}状态，无法行动`;
    case 'dodge':
      return `【${e.label}】被 ${nameOf(e.side ?? 'p1')} 闪避`;
    case 'damage': {
      // side = 受击方；攻击方为其对面
      const atk = nameOf(other(e.side ?? 'p2'));
      const def = nameOf(e.side ?? 'p2');
      let text = `【${e.label}】${atk} 对 ${def} 造成 ${e.dealt} 点伤害`;
      if (e.trueDamage) text += `（含${e.trueDamage}点真实伤害）`;
      if (e.absorbed) text += `（护盾吸收${e.absorbed}）`;
      if (e.hits) text += `（${e.hits}段）`;
      return text;
    }
    case 'proc':
      return e.kind === 'trueDamage' ? `【${e.label}】真伤触发成功` : `被动技能【${e.label}】触发成功`;
    case 'death':
      return `★ ${nameOf(e.side)} 阵亡`;
    case 'statusApply': {
      // 永久攻防变化带幅度（until = -1）；temp 状态无 value
      const amount = e.value !== undefined ? ` ${e.value > 0 ? '+' : ''}${e.value}` : '';
      return `${nameOf(e.side ?? 'p1')} 获得【${e.status}】${amount}效果（由 ${nameById(e.sourceId)} 施加）`;
    }
    case 'statusExpire':
      return `${nameOf(e.side ?? 'p1')} 的${e.status}状态结束`;
    case 'shieldGain':
      return `${nameOf(e.side ?? 'p1')} 获得 ${e.value} 点护盾`;
    case 'heal':
      return `${nameOf(e.side ?? 'p1')} 回复 ${e.value} 点生命`;
    case 'stacks': {
      const who = nameOf(e.side ?? 'p1');
      return e.delta < 0 ? `${who} 的${e.kind}清零` : `${who} ${e.kind}+${e.delta}（${e.total}层）`;
    }
    case 'revive':
      return `${nameOf(e.side ?? 'p1')} 复活（血量 ${e.hp}）`;
    case 'battleEnd':
      return e.outcome === 'draw' ? '战斗结束：平局' : `${nameOf(e.outcome)} 获得了胜利`;
    default:
      return '';
  }
}

const PHASE_TAG: Record<string, { label: string; type: 'primary' | 'success' | 'warning' | 'info' }> = {
  roundStart: { label: '回合开始', type: 'primary' },
  actions: { label: '行动', type: 'success' },
  settlement: { label: '结算', type: 'warning' },
  roundEnd: { label: '回合结束', type: 'info' },
};

interface RoundGroup {
  round: number;
  lines: { text: string; phase: string }[];
}

/** 事件流 → 分组行（battleStart 摘出，其余按回合聚合；空文案行丢弃） */
const groups = computed<RoundGroup[]>(() => {
  const events = store.result?.firstEvents ?? [];
  const byRound = new Map<number, RoundGroup>();
  for (const e of events) {
    if (e.type === 'battleStart' || e.type === 'battleEnd') continue;
    const text = describe(e);
    if (!text) continue; // 普攻无独立宣告行等空文案
    let g = byRound.get(e.round);
    if (!g) byRound.set(e.round, (g = { round: e.round, lines: [] }));
    g.lines.push({ text, phase: e.phase });
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
});

const opening = computed(() => {
  const e = store.result?.firstEvents?.find((x) => x.type === 'battleStart');
  return e ? describe(e) : '';
});
const ending = computed(() => {
  const e = store.result?.firstEvents?.find((x) => x.type === 'battleEnd');
  return e ? describe(e) : '';
});

type Side = 'p1' | 'p2';
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <div class="card-header" @click="open = !open">
        <span>单场时间轴<span v-if="!store.result?.firstEvents" class="empty">（开启"首场日志"后展示）</span></span>
        <span class="arrow" :class="{ open }">▾</span>
      </div>
    </template>
    <el-collapse-transition>
      <div v-show="open">
        <template v-if="store.result?.firstEvents?.length">
          <p class="opening">{{ opening }}</p>
          <el-collapse>
            <el-collapse-item v-for="g in groups" :key="g.round" :title="`—— 第 ${g.round} 回合 ——`">
              <p v-for="(l, i) in g.lines" :key="i" class="line">
                <el-tag :type="PHASE_TAG[l.phase]?.type ?? 'info'" size="small" class="tag">
                  {{ PHASE_TAG[l.phase]?.label ?? l.phase }}
                </el-tag>
                {{ l.text }}
              </p>
            </el-collapse-item>
          </el-collapse>
          <p class="ending">{{ ending }}</p>
        </template>
        <el-empty v-else description="尚无对局结果" :image-size="60" />
      </div>
    </el-collapse-transition>
  </el-card>
</template>

<style scoped>
.opening,
.ending {
  font-weight: 600;
  margin: 0 0 8px;
}
.ending {
  margin: 8px 0 0;
}
.line {
  margin: 4px 0;
  font-size: 13px;
}
.tag {
  margin-right: 8px;
}
.empty {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: normal;
}
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
