import type { CharacterDef } from '../types';

/**
 * 丽塔
 *
 * hp 100 atk 18 def 8 speed 21
 *
 * 主动技能【幽影收割】每2回合镰刀攻击敌人造成18点伤害，并使得敌方防御降低3，持续2回合。
 * 被动技能【谍影重重】释放幻象闪避伤害，25%概率闪避敌人主动攻击，每次成功闪避敌人，对敌人造成20点伤害。
 */
export const rita: CharacterDef = {
  id: 'rita',
  name: '丽塔',
  hp: 100,
  atk: 18,
  def: 8,
  speed: 21,
  activeInterval: 2,
  comment:
    '闪避判定粒度：闪避挂在单次攻击事件上，beforeHit 每次 ctx.attack 只判一次——\n一次攻击的 hits 多段伤害整体判定一次闪避，不会逐段重复判定；\n用多次独立 ctx.attack 实现的分段（如科拉莉点燃）则每段各判一次',
  // 主动技能
  activeSkill(ctx) {
    ctx.attack({ kind: 'attack', base: 18, label: '幽影收割' });
    ctx.defDown(ctx.target, 3, 'temp', 2, '幽影收割');
  },
  // 被动技能
  beforeHit(ctx, _) {
    if (ctx.rng.chance(0.25)) {
      ctx.emitFor(ctx.target, { type: 'proc', kind: 'passive', label: '谍影重重' });
      ctx.attack({ kind: 'attack', base: 20, label: '谍影重重' }, ctx.self);
      return false;
    } else {
      return true;
    }
  },
};
