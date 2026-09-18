import type { CharacterDef } from '../types';

/**
 * 赫丽娅
 *
 * hp 100 atk 20 def 9 speed 22
 *
 * 主动技能【飞矢流刃】每3回合攻击，造成22点伤害，并有25%概率造成麻痹，使其无法行动1回合。
 * 被动技能【坚守道途】每次攻击会获得1层动能灼光，当灼光满3层，下一次普通攻击伤害提高50%，并清除所有灼光。
 */
export const heliya: CharacterDef = {
  id: 'heliya',
  name: '赫丽娅',
  hp: 100,
  atk: 20,
  def: 9,
  speed: 22,
  activeInterval: 3,
  vars: {
    light: 0,
  },
  // 被动技能
  normalAttack(ctx) {
    if (ctx.self.vars.light && ctx.self.vars.light >= 3) {
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '坚守道途' });
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk * 1.5, label: '普攻' });
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '灼光', delta: -ctx.self.vars.light, total: 0 });
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '坚守道途' });
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '灼光', delta: 1, total: ctx.self.vars.light });
      ctx.self.vars.light = 1;
    }
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.attack({ kind: 'attack', base: 22, label: '飞矢流刃' });
    if (ctx.rng.chance(0.25)) {
      ctx.block(ctx.target, '麻痹', 1, 'action');
    }
    ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '坚守道途' });
    if (ctx.self.vars.light) {
      ctx.self.vars.light++;
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '灼光', delta: 1, total: ctx.self.vars.light });
    }
  },
};
