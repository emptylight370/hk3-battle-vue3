import type { CharacterDef } from '../types';

/**
 * 游云
 *
 * 原来被动是真伤吗，老师你太恐怖了
 *
 * hp 100 atk 20 def 7 speed 25
 *
 * 主动技能【绝对认真的炮击！】每3回合，进行一次认真准备的炮击，对敌人造成22点伤害，并使得下一次随机触发效果翻倍。
 * 被动技能【论文指导】每次回合开始时有33%概率随机触发以下一个效果：回复自身12点生命值，对敌方造成15点伤害，使对方防御永久降低2。
 */
export const youyun: CharacterDef = {
  id: 'youyun',
  name: '游云',
  hp: 100,
  atk: 20,
  def: 7,
  speed: 25,
  activeInterval: 3,
  vars: {
    double: 0,
  },
  // 被动技能
  onRoundStart(ctx) {
    if (ctx.rng.chance(0.33)) {
      ctx.emit({ type: 'proc', kind: 'passive', label: '论文指导' });
      const result = ctx.rng.pick([1, 2, 3]);
      let t = 1;
      if (ctx.self.vars.double) {
        ctx.emit({ type: 'proc', kind: 'passive', label: '绝对认真的炮击！' });
        t = 2;
        ctx.self.vars.double = 0;
      }
      if (result === 1) {
        ctx.heal(12 * t);
      } else if (result === 2) {
        // AI分析得15伤害为真伤直接添加至总伤，现在胜率对了
        ctx.attack({ kind: 'pierce', base: 15 * t, label: '论文指导' });
      } else if (result === 3) {
        ctx.defDown(ctx.target, 2 * t, 'perm');
      }
    }
  },
  // 主动技能
  activeSkill(ctx) {
    ctx.attack({ kind: 'attack', base: 22, label: '绝对认真的炮击！' });
    ctx.self.vars.double = 1;
  },
};
