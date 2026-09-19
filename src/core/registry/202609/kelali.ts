import type { CharacterDef } from '../types';

/**
 * 科拉莉
 *
 * hp 100 atk 17 def 6 speed 21
 *
 * 主动技能【别怕，只是打个哈欠】每3回合，喷出火焰造成25点伤害，并点燃敌人2次，每次造成15点伤害。
 * 被动技能【来，睡个好觉】攻击时有25%概率对敌人造成眩晕，持续2回合。
 */
export const kelali: CharacterDef = {
  id: 'kelali',
  name: '科拉莉',
  hp: 100,
  atk: 17,
  def: 6,
  speed: 21,
  activeInterval: 3,
  // 被动技能
  normalAttack(ctx) {
    ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻' });
    if (ctx.rng.chance(0.25)) {
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '来，睡个好觉' });
      ctx.block(ctx.target, '眩晕', 2, 'action');
    }
  },
  // 主动技能
  activeSkill(ctx) {
    const atk1 = ctx.attack({ kind: 'attack', base: 25, label: '别怕，只是打个哈欠' });
    if (ctx.rng.chance(0.25)) {
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '来，睡个好觉' });
      ctx.block(ctx.target, '眩晕', 2, 'action');
    }
    if (!atk1.missed && !atk1.killed) {
      ctx.attack({ kind: 'attack', base: 15, label: '别怕，只是打个哈欠', hits: 2 });
    }
  },
};
