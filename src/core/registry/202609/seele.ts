import type { CharacterDef } from '../types';

/**
 * 希儿
 *
 * hp 100 atk 18 def 8 speed 26
 *
 * 主动技能【润愈之镰】每3回合清除自身所有的负面状态，使用镰刀攻击敌人造成15点伤害，然后获得1朵花。
 * 被动技能【落英旋舞】每次受到伤害时，有35%获得围绕在身边的花；被赋予异常状态或被控制时，有30%获得围绕在身边的花，上限3个。在下次攻击时会消耗全部的花，每消耗一个额外造成6点伤害，并恢复4点生命。
 */
export const seele: CharacterDef = {
  id: 'seele',
  name: '希儿',
  hp: 100,
  atk: 18,
  def: 8,
  speed: 26,
  activeInterval: 3,
  vars: {
    flowers: 0,
  },
  // 被动技能
  normalAttack(ctx) {
    if (ctx.self.vars.flowers && ctx.self.vars.flowers > 0) {
      ctx.emit({ type: 'proc', kind: 'passive', label: '落英旋舞' });
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk + 6 * ctx.self.vars.flowers, label: '普攻' });
      ctx.heal(ctx.self.vars.flowers * 4);
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '花', delta: -ctx.self.vars.flowers, total: 0 });
      ctx.self.vars.flowers = 0;
    } else {
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻' });
    }
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.clearDebuffs();
    if (ctx.self.vars.flowers && ctx.self.vars.flowers > 0) {
      ctx.emit({ type: 'proc', kind: 'passive', label: '落英旋舞' });
      ctx.attack({ kind: 'attack', base: 15 + 6 * ctx.self.vars.flowers, label: '润愈之镰' });
      ctx.heal(ctx.self.vars.flowers * 4);
      ctx.emit({ type: 'stacks', kind: '花', delta: -ctx.self.vars.flowers, total: 0 });
    } else {
      ctx.attack({ kind: 'attack', base: 15, label: '润愈之镰' });
    }
    ctx.emitFor(ctx.self, { type: 'stacks', kind: '花', delta: 1, total: 1 });
    ctx.self.vars.flowers = 1;
  },
  // 被动技能
  onDamaged(ctx, _) {
    if (ctx.rng.chance(0.35)) {
      ctx.emit({ type: 'proc', kind: 'passive', label: '落英旋舞' });
      if (ctx.target.vars.flowers && ctx.target.vars.flowers < 3) {
        ctx.target.vars.flowers++;
        ctx.emitFor(ctx.target, { type: 'stacks', kind: '花', delta: 1, total: ctx.target.vars.flowers });
      }
    }
  },
  // 被动技能
  onStatusApply(ctx, _status, _sourceId) {
    if (ctx.rng.chance(0.3)) {
      ctx.emit({ type: 'proc', kind: 'passive', label: '落英旋舞' });
      if (ctx.target.vars.flowers && ctx.target.vars.flowers < 3) {
        ctx.target.vars.flowers++;
        ctx.emit({ type: 'stacks', kind: '花', delta: 1, total: ctx.target.vars.flowers });
      }
    }
  },
};
