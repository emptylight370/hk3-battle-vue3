import type { CharacterDef } from '../types';

/**
 * 薇塔
 *
 * 这假面愚者的机制不会是瞎编的吧，反正淘汰了不管了
 *
 * hp 100 atk 23 def 7 speed 27
 *
 * 主动技能【蔽羽遮天】每3回合变身为全知的羽翼，持续1回合，期间攻击提高8，防御提高3，变身结束无法行动1回合。
 * 被动技能【看呆了吗？】受到攻击后，有35%概率使得敌人陷入魅惑状态，2回合内无法使用主动技能。受到致命伤害，有15%概率复活，并回复20%最大生命值。<br/>
 */
export const vita: CharacterDef = {
  id: 'vita',
  name: '薇塔',
  hp: 100,
  atk: 23,
  def: 7,
  speed: 27,
  activeInterval: 3,
  vars: {
    super: 0,
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.self.vars.tempAtk = 8;
    ctx.self.vars.tempDef = 3;
    ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '蔽羽遮天' });
    ctx.self.vars.super = 1; // 变身标记
  },
  // 被动技能
  onDamaged(ctx, _) {
    if (ctx.rng.chance(0.35) && ctx.target.isAlive) {
      ctx.block(ctx.target, '魅惑', 2, 'active');
    }
  },
  // 主动技能
  onSettle(ctx) {
    if (ctx.self.vars.super && ctx.self.vars.super > 0) {
      ctx.self.vars.super--;
      ctx.block(ctx.self, '变身结束', 1, 'action');
    }
  },
  // 被动技能
  onLethal(ctx) {
    if (ctx.rng.chance(0.15)) {
      ctx.self.hp = ctx.self.maxHp * 0.2;
      return true;
    } else {
      return false;
    }
  },
};
