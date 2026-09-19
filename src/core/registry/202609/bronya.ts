import type { CharacterDef } from '../types';

/**
 * 布洛妮娅
 *
 * 说说吧，邪恶板鸭，你到底是来干什么的，来捣乱就把你做成酱板鸭哦
 *
 * hp 100 atk 16 def 8 speed 23
 *
 * 主动技能【分裂屏障】每3回合，在自身前方展开存在2回合的分裂屏障，并发射两枚标记子弹，分裂屏障释放时，自身立即获得4-10点护盾
 * 被动技能【力场，解构！】普通攻击命中被标记子弹打中的敌人，会造成2次打击。
 */
export const bronya: CharacterDef = {
  id: 'bronya',
  name: '布洛妮娅',
  hp: 100,
  atk: 16,
  def: 8,
  speed: 23,
  activeInterval: 3,
  vars: {
    shieldExpand: 0,
  },
  // 被动技能
  normalAttack(ctx) {
    if (ctx.opponentMark('标记')) {
      ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '力场，解构！' });
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻', hits: 2 });
    } else {
      ctx.attack({ kind: 'attack', base: ctx.self.curAtk, label: '普攻' });
    }
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.self.vars.shieldExpand = 2;
    ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '分裂屏障' });
    ctx.shieldGain(ctx.rng.int(4, 10));
    ctx.applyMark('标记', 2, 1);
    ctx.self.normalAttack(ctx);
  },
  // 主动技能
  onSettle(ctx) {
    if (ctx.self.vars.shieldExpand && ctx.self.vars.shieldExpand > 0) {
      ctx.self.vars.shieldExpand--;
      ctx.emitFor(ctx.self, { type: 'stacks', kind: '分裂屏障', delta: -1, total: ctx.self.vars.shieldExpand });
    }
  },
};
