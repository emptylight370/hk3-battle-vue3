import type { CharacterDef } from '../types';

/**
 * 芽衣
 *
 * 真的是无视防御吗，怎么日志里是4点真伤啊，来骗人来了
 *
 * hp 100 atk 18 def 8 speed 24
 *
 * 主动技能【掣电一斩】对敌方造成15点伤害，并有5%概率造成无视防御的4%自身最大生命上限的伤害。当拥有2层刀势的时候释放强化主动技能，对敌方造成25点伤害，如果未击败对方，则额外造成无视防御的8%自身最大生命上限的伤害并清空当前刀势。
 * 被动技能【自性纯一】主动技能命中后有40%获得1层刀势，60%获得2层刀势，上限2层。
 */
export const mei: CharacterDef = {
  id: 'mei',
  name: '芽衣',
  hp: 100,
  atk: 18,
  def: 8,
  speed: 24,
  activeInterval: 1,
  vars: {
    blade: 0,
  },
  // 主动技能
  activeSkill(ctx) {
    if (ctx.self.vars.blade && ctx.self.vars.blade >= 2) {
      // 强化：官方日志"刀势清零"在强化攻击之前打出——先消耗，再攻击，
      // 命中后的被动【自性纯一】加层得以保留（强化后刀势由运气决定）
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '刀势', delta: -ctx.self.vars.blade, total: 0 });
      ctx.self.vars.blade = 0;
      const result = ctx.attack({ kind: 'attack', base: 25, label: '掣电一斩' });
      if (!result.missed && !result.killed) {
        ctx.emitFor(ctx.self, { type: 'proc', kind: 'trueDamage', label: '掣电一斩' });
        ctx.attack({ kind: 'pierce', base: ctx.self.maxHp * 0.08, label: '掣电一斩' });
      }
    } else {
      if (ctx.rng.chance(0.05)) {
        ctx.emitFor(ctx.self, { type: 'proc', kind: 'trueDamage', label: '掣电一斩' });
        ctx.attack({ kind: 'pierce', base: ctx.self.maxHp * 0.04, label: '掣电一斩' });
      }
      ctx.attack({ kind: 'attack', base: 15, label: '掣电一斩' });
    }
  },
  // 被动技能
  onHit(ctx) {
    ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '自性纯一' });
    const cur = ctx.self.vars.blade ?? 0;
    if (ctx.rng.chance(0.4)) {
      if (cur < 2) {
        // 40%：+1 层（0 层也生效；已满 2 层则上限截断，不发增加事件）
        ctx.self.vars.blade = cur + 1;
        ctx.emitFor(ctx.self, { type: 'stacks', kind: '刀势', delta: 1, total: cur + 1 });
      }
    } else if (cur < 2) {
      // 60%：升至 2 层，delta 为实际差值（官方日志"刀势+N（N层）"中 N = 实际增量）
      ctx.self.vars.blade = 2;
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '刀势', delta: 2 - cur, total: 2 });
    }
  },
};
