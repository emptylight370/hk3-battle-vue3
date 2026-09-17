import type { CharacterDef } from '../types';

/**
 * 琪亚娜
 *
 * hp 100 atk 16 def 8 speed 23
 *
 * 主动技能【鼓乐喧天】每2回合攻击时，额外造成一次特殊武器技攻击（梦幻共演,不占用普攻回合），造成20点伤害。
 * 被动技能【梦中突袭】特殊武器技攻击（梦幻共演）命中时必定造成敌方当前生命15%的伤害，此伤害无视防御，护盾和减伤，最低造成1点。
 */
export const kiana: CharacterDef = {
  id: 'kiana',
  name: '琪亚娜',
  hp: 100,
  atk: 16,
  def: 8,
  speed: 23,
  activeInterval: 2,
  // 主动技能
  activeSkill(ctx) {
    const result = ctx.attack({ kind: 'attack', base: 20, label: '鼓乐喧天' });
    if (!result.missed) {
      ctx.attack({ kind: 'pierce', base: Math.max(1, ctx.target.hp * 0.15), label: '梦中突袭' });
    }
    ctx.self.normalAttack(ctx);
  },
};
