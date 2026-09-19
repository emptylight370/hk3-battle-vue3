import type { CharacterDef } from '../types';

/**
 * 希娜狄雅
 *
 * hp 100 atk 17 def 7 speed 25
 *
 * 主动技能【梦中的流星雨】每3回合，连续召唤3波魔法碎片，每波碎片造成一次当前攻击力的伤害。
 * 被动技能【影中曙光】普通攻击召唤1波魔法碎片，每波魔法碎片都有20%的概率召唤一个魔法陨石作为替代，魔法陨石额外造成10点伤害并永久提升自己1点攻击。
 */
export const xinadia: CharacterDef = {
  id: 'xinadia',
  name: '希娜狄雅',
  hp: 100,
  atk: 17,
  def: 7,
  speed: 25,
  activeInterval: 3,
  // 被动技能
  normalAttack(ctx) {
    if (ctx.rng.chance(0.2)) {
      // 发送消息提示被动触发
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '影中曙光' });
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk + 10, label: '普攻' });
      ctx.atkUp(ctx.self, 1, 'perm');
    } else {
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻' });
    }
  },
  // 主动技能
  activeSkill(ctx) {
    let hits = 0;
    for (let i = 0; i < 3; i++) {
      if (ctx.rng.chance(0.2)) {
        hits += 1;
      }
    }
    const atks = ctx.self.curAtk * 3 + hits * 10 - ctx.target.curDef * 2;
    if (hits > 0) ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '魔法陨石' });
    ctx.attack({ kind: 'attack', base: atks, label: '梦中的流星雨', hits: 3 });
    if (hits > 0) ctx.atkUp(ctx.self, hits, 'perm');
  },
};
