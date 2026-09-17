import type { ActorState } from '@/core/actor';
import type { CharacterDef } from '../types';

/**
 * 寻梦者
 *
 * hp 100 atk 18 def 9 speed 23
 *
 * 主动技能【时锢锚定】每3回合，攻击造成24点伤害，有20%概率对目标释放时间禁锢，持续2回合，期间无法获得攻击和防御提高。
 * 被动技能【时序之力】每回合开始时触发时间倒转，若自身生命低于25%，回复到4回合之前，回合开始时的HP状态，但是防御降低4（最低为0）。
 */
export const dreamer: CharacterDef = {
  id: 'dreamer',
  name: '寻梦者',
  hp: 100,
  atk: 18,
  def: 9,
  speed: 23,
  activeInterval: 3,
  // 被动技能
  onRoundStart(ctx) {
    const s = ctx.self.pushSnapshot(4) as ActorState;

    if (ctx.self.hp < ctx.self.maxHp * 0.25) {
      ctx.emit({ type: 'passiveTrigger', label: '时序之力' });
      ctx.self.restore(s);
      ctx.defDown(ctx.self, 4, 'perm');
    }
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.attack({ kind: 'attack', base: 24, label: '时锢锚定' });
    if (ctx.rng.chance(0.2)) {
      ctx.block(ctx.target, '时间禁锢(攻击)', 2, 'atkUp');
      ctx.block(ctx.target, '时间禁锢(防御)', 2, 'defUp');
    }
  },
  // 被动技能
  snapshot() {
    const state: ActorState = {
      hp: this.hp,
    };
    return state;
  },
  // 被动技能
  restore(s) {
    this.hp = s.hp as number;
  },
};
