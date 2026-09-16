# Ctx 使用指南 —— 角色钩子如何访问属性与事件

> 面向角色注册表作者。`Ctx` 是角色钩子**唯一的世界入口**：钩子永不直接摸引擎或对方面板，一切通过 `ctx`。
> 实现见 `../context.ts`（`Ctx` 接口 + `BattleCtx`），类型见 `../types.ts`。完整角色示例见 `202609/*.ts`。

---

## 1. 两条基本纪律

1. **`ctx.self` = 行动方，`ctx.target` = 受击方**。引擎在每次行动/结算前已设置好，钩子内直接用。
   访问自身面板/状态一律 `ctx.self`，**不要依赖 `this`**（函数体绑定的 `this` 仅是运行时便利，类型上不可靠）。
2. **只读该读的，只写该写的**。Actor 字段分三类（详见 `../actor.ts` 注释）：

   | 类别                         | 字段                                                             | 钩子能否直接写                              |
   | ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
   | 引擎级流程状态               | `hp / shield / stunRound / noActRound / defDown / defDownRounds` | ✘ 一律走 `ctx` 辅助方法                     |
   | 敌方施加状态（挂在目标身上） | `marks`                                                          | ✘ 走 `ctx.applyMark / opponentMark`         |
   | 我方私有状态袋               | `vars`（数值键值对）                                             | ✓ 只读写**自己的键**（`ctx.self.vars.xxx`） |

   派生属性只读：`ctx.self.curAtk / curDef / isAlive / maxHp`。

---

## 2. 属性与环境信息

```ts
ctx.round; // 当前回合号（1 起）
ctx.phase; // 当前阶段：'roundStart' | 'actions' | 'settlement' | 'roundEnd'
ctx.finished; // 战斗是否已分出胜负（true 后所有攻击空转）
ctx.rng; // 随机源（见 §4）
ctx.p1 / ctx.p2; // 对局双方引用（按阵营，非行动序）
ctx.self; // 当前行动方
ctx.target; // 当前受击方
ctx.events; // 已发出的事件流（只读）
ctx.sideOf(actor); // 查某 Actor 的阵营 'p1' | 'p2'
```

常用读取示例：

```ts
const hpPct = ctx.self.hp / ctx.self.maxHp; // 自身血量比例（时间倒转判断）
const raw = ctx.target.curDef; // 目标当前防御（动态计算子弹伤害）
if (ctx.target.isAlive) {
  /* 死亡目标早退 */
}
```

---

## 3. 攻击 API —— kind 矩阵（最容易做错的点）

| 方法                       | 闪避 | 攻击方 onHit | 受击方 onDamaged | 防御     | 护盾     | 用途                         |
| -------------------------- | ---- | ------------ | ---------------- | -------- | -------- | ---------------------------- |
| `ctx.attack(desc)`         | ✓    | ✓            | ✓                | 减       | 吸收     | 攻击动作（普攻/主动技主段）  |
| `ctx.segment(base, label)` | ✗    | ✗            | ✓                | 减       | 吸收     | 技能效果段（点燃/子弹/碎片） |
| `ctx.flat(base, label)`    | ✗    | ✗            | ✓                | **无视** | 吸收     | 无视防御追加（芽衣）         |
| `ctx.pierce(base, label)`  | ✗    | ✗            | ✓                | **无视** | **无视** | 真伤，最低 1（琪亚娜）       |

`ctx.attack` 的入参与出参：

```ts
const r = ctx.attack({ kind: 'attack', base: 22, label: '灼光强袭', mult?: 1.5 });
// HitResult 判别联合：
//   { missed: true }                                  ← 被闪避（无伤害语义）
//   { missed: false, dealt: number, killed: boolean }  ← dealt=计算伤害（不按剩余血截断）
```

**多段与短路**：

```ts
const r = ctx.attack({ kind: 'attack', base: base, label: '普攻' });
if (!r.missed && !r.killed) {
  /* 第二段 */
} // 击杀/闪避都不接后续段
```

伤害公式：`raw = max(1, round(base × (mult ?? 1)) − 目标.curDef)`（JS 四舍五入约定）。

---

## 4. 随机 —— `ctx.rng`

```ts
ctx.rng.chance(0.25); // 概率判定（眩晕/麻痹/陨石/复活）
ctx.rng.int(4, 10); // [4,10] 均匀整数，含两端（屏障护盾）
ctx.rng.pick(['a', 'b', 'c']); // 等概率多选一（游云三选一）
ctx.rng.next(); // [0,1) 基础原语（一般不直接用）
```

**纪律**：全部随机必须走 `ctx.rng`（禁止 `Math.random`）；掷骰顺序决定种子复现，必须与官方日志的"触发成功"行位置一致——先掷后算还是先算后掷，以日志为准。

---

## 5. 资源与状态施加

```ts
// 资源（默认作用于自身；heal 可指定对象）
ctx.heal(12); // 回血，封顶 maxHp，发 heal 事件
ctx.heal(12, ctx.self); // 显式指定
ctx.shieldGain(5); // 加护盾（作用于 self），发 shieldGain 事件

// 封锁类状态（眩晕/麻痹/禁锢/变身封锁…同类合并，调用方给状态名）
ctx.block(target, '眩晕', 2, 'action'); // scope 'action'：封锁全部行动（stunRound）
ctx.block(target, '禁锢', 2, 'active'); // scope 'active'：仅阻止主动技能（noActRound）
ctx.block(ctx.self, '变身封锁', 1, 'action'); // 也可以封自己（薇塔变身）

// 限时降防（刷新制，只降目标——约定 #11）
ctx.defDown(target, 2, 3); // 目标 def −3，持续到本回合 +1 回合

// 施加者独占标记（数据挂目标，键 = '我的id.状态名'，语义只有我能读）
ctx.applyMark('标记', 2, 7); // duration 含施加回合（约定 #1），value 可选
ctx.opponentMark('标记'); // 读取自己挂的标记；过期返回 undefined
// → { until: number, value?: number }
```

口径说明（约定 #1/#2 集中实现，钩子内**不需要**自己换算）：

- `rounds/duration` 均为"含施加回合"：施加于 R、持续 2 → 生效 R~R+1；
- 重复施加 = 刷新为满时长（不是叠加）；
- 计数器由引擎结算段逐回合 −1，归零自动发 `statusExpire`（"眩晕状态结束"）。

---

## 6. 事件 —— `emit / emitFor`

```ts
ctx.emit({ type: 'proc', kind: 'passive', label: '自性纯一' });       // 自动补 round/phase
ctx.emitFor(ctx.self, { type: 'stacks', kind: 'stance', delta: 1, total: 1 }); // 再补 side
ctx.emit({ type: 'battleEnd', phase: 'roundEnd', ... });              // 骨架事件可显式覆盖
```

- 省略的 `round / phase / side` 自动补当前值；`emitFor(actor, e)` 的 `side` 取该 actor 阵营。
- **角色钩子该发什么**：只有私有事实——`proc`（触发成功）、`stacks`（刀势/花/灼光层数变化）、`passiveTrigger`（回合开始被动）。伤害/护盾/状态施加由协议和 `ctx` 辅助方法发，不要重复发。
- 完整事件类型清单见 `../types.ts` 的 `BattleEvent`。

---

## 7. 钩子触发时机与 self/target 状态

| 钩子                                    | 触发时机                   | `ctx.self` | `ctx.target` |
| --------------------------------------- | -------------------------- | ---------- | ------------ |
| `onRoundStart`                          | 每回合开始（①）            | 本 Actor   | 对方         |
| `onAction / activeSkill / normalAttack` | 行动阶段（②）              | 本 Actor   | 对方         |
| `beforeHit`                             | 被攻击时（受击方）         | 攻击方     | **本 Actor** |
| `computeIncoming`                       | 扣血计算前（受击方）       | 攻击方     | 本 Actor     |
| `onHit`                                 | 命中后（攻击方）           | 本 Actor   | 受击方       |
| `onDamaged`                             | 受击后，每段独立（受击方） | 攻击方     | 本 Actor     |
| `onLethal`                              | 致命伤时（受击方）         | 攻击方     | 本 Actor     |
| `onSettle`                              | 结算段（③）                | 本 Actor   | 对方         |

注意：

- `onDamaged` 对**每段伤害独立触发**（主段、点燃、子弹各一次）；死亡目标早退（击杀一击不触发，约定 #9）。
- `onLethal` 返回 `true` 即复活；**回血由钩子自己设置**——此时受击方即自身，直接写自身 `hp` 是本钩子的唯一例外（协议在返回后发 `revive` 事件并继续判定）。
- 引擎/协议负责死亡兜底与 `finished` 空转，钩子无需（也不应）自己判死。

---

## 8. 禁忌清单

1. ✘ 直接改 `ctx.target.hp / marks / stunRound`——走 `ctx` 辅助方法。
2. ✘ `Math.random()`——一切随机走 `ctx.rng`（种子复现的根基）。
3. ✘ 钩子内 `await` / 定时器——模拟是同步纯计算。
4. ✘ 在 `finished === true` 后继续结算——协议会空转，钩子也应尽早返回。
5. ✘ 重复发协议已发的事件（damage/statusApply/shieldGain 等）。
6. ✘ 依赖 `this` 访问面板/状态——用 `ctx.self`。
