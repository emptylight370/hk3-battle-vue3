import type { CharacterDef } from '../types';

/**
 * 幽兰黛尔
 *
 * hp 100 atk 16 def 11 speed 22
 *
 * 主动技能【特殊的滑板技巧】每2回合，使用滑板攻击敌人，造成15点伤害，20%概率额外触发一次攻击，造成25点伤害。
 * 被动技能【小身躯，大潜力】每次攻击，自身获得3点护盾值，护盾值可抵挡伤害且可叠加。
 */
export const youlandaier: CharacterDef = {
  id: 'youlandaier',
  name: '幽兰黛尔',
  hp: 100,
  atk: 16,
  def: 11,
  speed: 22,
  activeInterval: 2,
  // 被动技能
  normalAttack(ctx) {
    ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻' });
    ctx.emit({ type: 'proc', kind: 'passive', label: '小身躯，大潜力' });
    ctx.shieldGain(3);
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.attack({ kind: 'attack', base: 15, label: '特殊的滑板技巧' });
    ctx.emit({ type: 'proc', kind: 'passive', label: '小身躯，大潜力' });
    ctx.shieldGain(3);
    if (ctx.rng.chance(0.2)) {
      ctx.attack({ kind: 'attack', base: 25, label: '特殊的滑板技巧' });
      ctx.emit({ type: 'proc', kind: 'passive', label: '小身躯，大潜力' });
      ctx.shieldGain(3);
    }
  },
};
