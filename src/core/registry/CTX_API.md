# Ctx 使用指南 —— 角色钩子如何访问属性与事件

> 面向角色注册表作者。`Ctx` 是角色钩子**唯一的世界入口**：钩子永不直接摸引擎或对方面板，一切通过 `ctx`。
> 实现见 `../context.ts`（`Ctx` 接口 + `BattleCtx`），类型见 `../types.ts`。完整角色示例见 `202609/*.ts`。

---

## 1. 两条基本纪律

1. **`ctx.self` = 行动方，`ctx.target` = 受击方**。引擎在每次行动/结算前已设置好，钩子内直接用。
   访问自身面板/状态一律 `ctx.self`，**不要依赖 `this`**（函数体绑定的 `this` 仅是运行时便利，类型上不可靠）。
2. **只读该读的，只写该写的**。Actor 字段分三类（详见 `../actor.ts` 注释）：

   | 类别                         | 字段                                                                                           | 钩子能否直接写                              |
   | ---------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
   | 引擎级流程状态               | `hp / shield / stunRound / noActRound / noGainAtkRound / noGainDefRound / timedAtk / timedDef` | ✘ 一律走 `ctx` 辅助方法                     |
   | 敌方施加状态（挂在目标身上） | `marks`                                                                                        | ✘ 走 `ctx.applyMark / opponentMark`         |
   | 我方私有状态袋               | `vars`（数值键值对）                                                                           | ✓ 只读写**自己的键**（`ctx.self.vars.xxx`） |

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

**唯一的伤害入口是 `ctx.attack(desc, who?)`**——四种伤害类型由 `desc.kind` 区分，不要再用单独的 segment/flat/pierce 函数（已移除）：

| `desc.kind` | 闪避 | 攻击方 onHit | 受击方 onDamaged | 防御     | 护盾     | 用途                         |
| ----------- | ---- | ------------ | ---------------- | -------- | -------- | ---------------------------- |
| `'attack'`  | ✓    | ✓            | ✓                | 减       | 吸收     | 攻击动作（普攻/主动技主段）  |
| `'segment'` | ✗    | ✗            | ✓                | 减       | 吸收     | 技能效果段（点燃/子弹/碎片） |
| `'flat'`    | ✗    | ✗            | ✓                | **无视** | 吸收     | 无视防御追加（芽衣）         |
| `'pierce'`  | ✗    | ✗            | ✓                | **无视** | **无视** | 真伤，最低 1（琪亚娜）       |

`ctx.attack` 的入参与出参：

```ts
const r = ctx.attack({ kind: 'attack', base: 22, label: '灼光强袭', mult?: 1.5 });
// who 可选：生效目标，缺省 = ctx.target（受击钩子反击攻击方时传 ctx.self）
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

伤害公式：`raw = max(1, round(base × (mult ?? 1)) − 目标.curDef)`（`flat/pierce` 无视防御，即 `max(1, round(base × mult))`）。

> **`HitResult` 里没有护盾吸收量**：`dealt` 是"护盾吸收后的实扣血量"（致命一击时也可能大于目标剩余血量，不截断）。需要吸收量时从对应的 `damage` 事件读 `absorbed` 字段，或自行 `raw − dealt` 计算。

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
ctx.block(target, '禁锢', 2, 'atkUp'); // scope 'atkUp'：封锁攻击获得
ctx.block(target, '禁锢', 2, 'defUp'); // scope 'defUp'：封锁防御获得
ctx.block(ctx.self, '变身封锁', 1, 'action'); // 也可以封自己（薇塔变身）

// 攻防变化（增益/减益统一入口；第一个参数 = 生效目标）
// value 带符号：正 = 提升，负 = 降低；duration 选存储通道；rounds/tag 仅 'temp' 有效
ctx.atkUp(target, 10, 'perm'); // 永久提升：目标 vars.atkBonus += 10（受攻击获得封锁）
ctx.atkUp(ctx.self, 8, 'temp'); // 回合内提升：timedAtk['base'] += 8，结算段过期
ctx.atkUp(ctx.self, 1, 'perm'); // 希娜狄雅陨石：每颗永久 +1
ctx.atkDown(target, 5, 'temp', 2, '削弱'); // 限时降攻 5，持续 2 回合，标记'削弱'
ctx.defUp(target, 3, 'temp', 2, '结界'); // 限时加防 3，持续 2 回合，标记'结界'
ctx.defDown(target, 3, 'temp', 2, '幽影收割'); // 丽塔降防 3，持续 2 回合（约定 #11）
ctx.defDown(target, 4, 'perm'); // 永久降防 4（时间倒转：永久变化值 −4）

// 施加者独占标记（数据挂目标，键 = '我的id.状态名'，语义只有我能读）
ctx.applyMark('标记', 2, 7); // duration 含施加回合（约定 #1），value 可选
ctx.opponentMark('标记'); // 读取自己挂的标记；过期返回 undefined
// → { until: number, value?: number }

// 查询与驱散自身负面状态（作用于 self；希儿"清除自身负面"用）
ctx.ownDebuffs();
// → [{ kind: 'block', status: '眩晕', rounds: 2 },       // 封锁计数
//     { kind: 'defDown', status: '降防', rounds: 2, value: -3 }, // 负向限时变化
//     { kind: 'mark', status: '标记', sourceId: 'bronya', value: 7 }] // 敌方标记
ctx.clearDebuffs(); // 清零计数 + 清除负向限时变化 + 删除敌方标记，逐项发 statusExpire
```

标记的三个细节：

- **同名覆盖**：重复施加同 `label` 直接覆盖旧标记（刷新语义），不会并存多条；
- **当回合即可读**：有效期判断是 `until >= 当前回合`，施加当回合挂的标记立刻能被 `opponentMark` 读到（布洛妮娅 R3 挂标记，同回合的子弹若走普攻查询即命中双击）；
- **标记不产生任何引擎行为**：不写效果 = 纯数据。它的作用（双击/额外伤害）完全由施加者的钩子实现。

口径说明（约定 #1/#2 集中实现，钩子内**不需要**自己换算）：

- `rounds/duration` 均为"含施加回合"：施加于 R、持续 2 → 生效 R~R+1；
- 重复施加 = 刷新为满时长（不是叠加）；
- 计数器由引擎结算段逐回合 −1，归零自动发 `statusExpire`（"眩晕状态结束"）。
- **封锁状态名记录在字典中**（计数器字段名 → 状态名），多种封锁并存时各自独立到期、状态名互不干扰。
- **攻防获得的封锁语义**：`ctx.block(..., 'atkUp'/'defUp')` 只拦增益方向的 `atkUp/defUp`（返回 false），目标已有值不受影响，也不封锁行动——对应"禁锢封锁攻防获得，不减益"的机制。
- **`duration: 'perm'` 的减益不受封锁**：`atkDown/defDown` 是减益方向（内部写负值），即使目标处于攻防获得封锁期也照常生效。

### 5.1 攻防变化的存储模型

| 通道       | 存储                                                           | 写入函数                                                                                 | 生命周期                                     |
| ---------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| 永久变化值 | `vars.atkBonus / defBonus`（带符号：正增负减）                 | `ctx.atkUp/defUp(target, v, 'perm')` 累加；`ctx.atkDown/defDown(target, v, 'perm')` 累减 | 永久，跨回合存活                             |
| 限时变化   | `timedAtk / timedDef: Record<标记, { value, rounds, status }>` | `ctx.atkUp/defUp(target, v, 'temp', rounds, tag)`；`ctx.atkDown/defDown(...)` 写负值     | 结算段逐回合 −1，归零移除并发 `statusExpire` |

派生属性：`curAtk = max(0, atkBase + atkBonus + Σ timedAtk.value)`（def 同构）。

- **不同标记并存叠加**：`atkDown(t, 5, 'temp', 2, '削弱A')` + `atkDown(t, 3, 'temp', 2, '削弱B')` → 合计 −8；同标记重复施加 = 刷新覆盖。
- 限时变化的 `tag` 即状态名（statusApply/statusExpire 用），起一个可读的名字（如 `'幽影收割'`、`'变身'`）。
- 角色钩子**不得直写** `vars.atkBonus/defBonus` 与 `timedAtk/timedDef`——它们只由这四个函数管理（直写会绕过封锁检查）。

> ⚠️ **关键口径：封锁的"实际封锁回合数"= rounds − 1**。
> 官方日志观察证实：**所有效果都在回合结束前统一结算一次**，与施加方先手/后手无关——后手施加的 debuff 同样会在当前回合消耗一次计数。因此 `rounds` 覆盖的回合中，施加当回合通常已经行动过，真正被封锁的是后续 `rounds − 1` 个回合：
>
> | 传参                                     | 实际效果                                                     |
> | ---------------------------------------- | ------------------------------------------------------------ |
> | `rounds: 1`                              | **不封锁任何回合**（当回合末即归零）——想封锁下一回合必须传 2 |
> | `rounds: 2`（眩晕 2 回合 / 麻痹 1 回合） | 封锁下一回合（约定 #1"实际封锁下一回合"、约定 #3）           |
> | `rounds: 3`（禁锢 3 回合）               | 封锁下两个回合的主动技                                       |
>
> **换算口诀**：官方描述的"持续 N 回合"（N ≥ 2）直接传 N；官方描述"封锁下一回合"类的 1 回合效果（麻痹）传 **2**。

---

## 6. 事件 —— `emitFor`（唯一的事件发送方法）

```ts
ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '自性纯一' }); // side = 自己
ctx.emitFor(ctx.self, { type: 'stacks', kind: 'stance', delta: 1, total: 1 }); // 刀势 +1 归自己
ctx.emitFor(ctx.target, { type: 'stacks', kind: 'ember', delta: 1, total: 1 }); // 灼光累积归对手
```

- **角色钩子一律用 `emitFor`**：`side` 取第一个参数的阵营，省略的 `round / phase` 自动补当前值。
- **不要用裸 `emit`**：它不补 `side`，归属敏感事件（stacks/heal/shieldGain 等）在界面上会回退显示成 p1——当角色是 p2 时看起来就是"登记到对手身上"。裸 `emit` 仅限引擎骨架内部使用（`roundStart`/`battleEnd` 等无归属事件），不属于角色 API。
- 归属速查：加给自己 = `emitFor(ctx.self, ...)`；加给对手 = `emitFor(ctx.target, ...)`；受击方钩子（onDamaged/onLethal）中自己 = `ctx.target`、攻击方 = `ctx.self`。
- 完整事件类型清单见 `../types.ts` 的 `BattleEvent`。

### 6.1 需要注册表**显式 emitFor** 的事件（共 3 类）

只有三类"协议拿不到的私有事实"需要钩子自己发。判断口诀：**这条日志的数字/名字，协议拿得到吗？拿不到才发。**

#### ① `proc` —— 攻击结算中的概率触发标记

```ts
ctx.emitFor(ctx.self, { type: 'proc', kind: 'trueDamage', label: '掣电一斩' }); // 命中前掷骰
ctx.emitFor(ctx.self, { type: 'proc', kind: 'passive', label: '自性纯一' }); // 命中后掷骰
```

- **何时发**：攻击动作/受击管线里掷骰命中了（真伤触发、攻击后被动触发）。
- **`kind` 决定渲染位置**（对应官方日志两行式）：
  - `kind: 'trueDamage'` → 命中**前**掷骰（先决定有没有真伤，再算伤）→ 渲染在 damage 行**之前**，对应日志"[掣电一斩] 真伤触发成功"；
  - `kind: 'passive'` → 命中**后**掷骰（攻击后被动）→ 渲染在 damage 行**之后**，对应日志"被动技能【自性纯一】触发成功"。
- **只在触发成功时发**（"proc"即"触发"）：未命中的掷骰不发事件——事件流与官方日志逐行对应，未触发靠随机流序列在测试中推演。
- 触发产生的**后果不要在这里发**：随后的伤害走 `ctx.attack/segment`、状态走 `ctx.block`，它们各自自动发事件。

#### ② `stacks` —— 层数类私有状态的变化

```ts
ctx.emitFor(ctx.self, { type: 'stacks', kind: 'stance', delta: 1, total: 1 }); // 刀势 +1
ctx.emitFor(ctx.self, { type: 'stacks', kind: 'stance', delta: -2, total: 0 }); // 清零（delta 为负）
```

- **何时发**：`vars` 里的层数状态发生变化时（刀势、花、灼光）。
- **字段**：`kind` 为层数键（开放字符串，注册表按版本定义）；`delta` 带符号（清零 = 负值/累计负值）；`total` 为变化后的总数。
- **对应日志**："[自性纯一] 芽衣「刀势」+1（1层）"、"「刀势」清零"。
- 数据本身留在 `vars`（私有），但**每次变化都要发**——否则无法对齐官方日志的层数行。

#### ③ `passiveTrigger` —— 回合开始被动触发

```ts
ctx.emitFor(ctx.self, { type: 'passiveTrigger', label: '游云', detail: '敌方防御永久 −2' });
```

- **何时发**：`onRoundStart` 里时间倒转/游云这类**回合开始被动被触发**时。
- **`detail`**：携带结果描述（游云三选一抽中了哪项）——渲染在 passiveTrigger 行内。
- 触发产生的伤害/状态同样走后续 `ctx` API（它们自动发事件，且 phase 已是 roundStart）。
- 与 `proc` 的区别：见 §6.2。

### 6.2 `passiveTrigger` 与 `proc` 的区别（不要混用）

| 维度     | `passiveTrigger`                           | `proc`                                     |
| -------- | ------------------------------------------ | ------------------------------------------ |
| 阶段     | 仅回合开始（roundStart，节点①）            | 仅行动阶段（actions，攻击管线内）          |
| 语义     | 回合开始被动**整个被触发**（大效果的开端） | 攻击结算中**某个概率分支命中**（一次掷骰） |
| 位置语义 | 无"相对伤害行"概念                         | `kind` 决定相对 damage 行的前/后           |
| 来源钩子 | `onRoundStart`                             | `onHit / onDamaged / activeSkill`          |

### 6.3 协议自动发出（钩子**不要**重复发）

| 事件                                                           | 发出点                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `roundStart / battleStart / actionBlocked / death / battleEnd` | 引擎骨架                                                            |
| `attackStart / damage / dodge / counter* / revive`             | 攻击协议（`ctx.attack` 管线）                                       |
| `statusApply`                                                  | `ctx.block / defDown / atkDown / applyMark`                         |
| `statusExpire`                                                 | 结算段（`settleBlocks/settleVars/sweepMarks`）与 `ctx.clearDebuffs` |
| `shieldGain`                                                   | `ctx.shieldGain`                                                    |
| `heal`                                                         | `ctx.heal`                                                          |

注：`counter` 反击伤害以 `damage(label: '幻象反击')` 呈现；护盾吸收量在 `damage.absorbed` 字段内，无独立事件。

### 6.4 0 值事件是合法的

满血时 `ctx.heal(n)` 仍会发 `heal(value: 0)`；同理层数不变时若发了 `stacks(delta: 0)` 也合法——渲染层按需过滤，测试断言时留意。

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
| `onStatusApply`                         | 自身被施加状态时（瞬时）   | —          | 本 Actor     |
| `onSettle`                              | 结算段（③）                | 本 Actor   | 对方         |

注意：

- `onDamaged` 对**每段伤害独立触发**（主段、点燃、子弹各一次）；死亡目标早退（击杀一击不触发，约定 #9）。
- `onLethal` 返回 `true` 即复活；**回血由钩子自己设置**——此时受击方即自身，直接写自身 `hp` 是本钩子的唯一例外（协议在返回后发 `revive` 事件并继续判定）。
- 引擎/协议负责死亡兜底与 `finished` 空转，钩子无需（也不应）自己判死。
- **死亡即战斗结束**：不存在"我死了之后我的钩子还会被调用"的场景——任何一方死亡立即 `finished`，本回合后续阶段（含结算段）全部跳过。复活是唯一续命方式。
- **`settleBlocks / settleVars / sweepMarks` 由引擎在结算段调用**：钩子内不要自己调用它们（会双重递减计数器）。`onSettle` 只写角色私有衰减。

---

## 8. 禁忌清单

1. ✘ 直接改 `ctx.target.hp / marks / stunRound`——走 `ctx` 辅助方法。
2. ✘ `Math.random()`——一切随机走 `ctx.rng`（种子复现的根基）。
3. ✘ 钩子内 `await` / 定时器——模拟是同步纯计算。
4. ✘ 在 `finished === true` 后继续结算——协议会空转，钩子也应尽早返回。
5. ✘ 重复发协议已发的事件（damage/statusApply/shieldGain 等）。
6. ✘ 依赖 `this` 访问面板/状态——用 `ctx.self`。

---

## 9. 盲区自查 —— 不读源码时最容易踩的坑

### 9.1 `vars` 的保留键（写入即有副作用）

| 键         | 效果                                      | 生命周期                                                         |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `atkBonus` | 永久攻击变化值（正增负减），计入 `curAtk` | **永久**，跨回合存活；只经 `ctx.atkUp/atkDown(..., 'perm')` 写入 |
| `defBonus` | 永久防御变化值（正增负减），计入 `curDef` | **永久**，跨回合存活；只经 `ctx.defUp/defDown(..., 'perm')` 写入 |

陷阱：**永久变化值是带符号的**——负值即永久减益（时间倒转 −4 防就是这样实现的），驱散不清除它。回合内的攻防变化不再走 `vars`（`tempAtk/tempDef` 键已废弃），由 `timedAtk/timedDef` 承载并经 `ctx.atkUp(..., 'temp', ...)` 等 API 管理。自定义键避开这两个名字。

### 9.2 封锁状态并存时的到期归属

`blockStatus` 是字典（计数器字段名 → 状态名）：眩晕 + 禁锢 + 攻防获得封锁可以并存，各计数器独立递减、归零时按各自记录的状态名发 `statusExpire`，互不干扰。历史遗留的单值实现曾导致"先归零的一方发出对方状态名"的错行问题，现已修复——若发现到期状态名错行，优先检查是否绕过了 `ctx.block` 直改计数器。

### 9.3 快照必须包含你要回溯的一切

`snapshot()/restore()` 由角色自定义：回溯后"丢了刀势/花/标记"的 bug 几乎都是快照漏字段。自查方法：把本角色 `onRoundStart/onAction/activeSkill/onHit/onDamaged` 读写过的**所有** `vars` 键和关心的字段列出来，逐项对照快照内容。`snapQueue` 自身永不入快照。

### 9.4 随机流是全局单序列

你的每一次 `ctx.rng.*` 都在消耗同一支流，**闪避掷骰、反击、对方的被动掷骰都会移动它**。不要假设"我掷骰时流的位置"固定——跨角色对局的数值必须靠固定 seed 的整场回归测试锁定，不能靠单角色推演。

### 9.5 计数消耗与先手/后手无关

字段（降防、封锁计数、标记）**施加即生效**——后手方若本回合尚未行动，先手方施加的 debuff 会立刻影响其后手行动。但**计数消耗与行动顺序无关**：结算在回合结束前统一执行一次，无论谁施加、何时施加，**当回合都会消耗一次计数**。推演口诀：字段立即生效 + 当回合结算必 −1；不要因"我是后手才施的"而假设当回合不消耗。

### 9.6 事件流的 `round` 从 0 开始有一条

`battleStart` 事件 `round: 0`，之后每回合从 1 起。渲染时间轴/断言回合数时注意偏移。
