# 对战模拟器 Web 版设计文档（现状定稿）

> 本文是 Web 版**唯一权威设计文档**，与 `src/` 代码现状一一对应。
> 历史文档的关系：`web_sim_设计文档.md`（含多轮设计修订的演进记录）与 `battle_sim_架构与时序.md`（Python 参考实现）作为设计过程存档保留；**实现冲突时以本文为准**。
> 更新时间：2026-09；对应代码：M1（引擎+12 角色）✅、M2（批量层）✅、M3（UI）进行中。

---

## 1. 项目定位与形态

- **用途**：12 名角色的回合制对战模拟器，支持单场带日志对局与大批量胜率统计。
- **形态**：Vue 3 SPA。引擎运行在 **Web Worker** 线程，UI 不卡顿；同 seed 逐事件确定性复现。
- **与 Python 参考实现的关系**：算法同源（同一套角色规则与回合时序），但随机流与舍入约定独立，不追求逐场数字一致。

## 2. 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Vue 3.5 + `<script setup>` + TS strict | `noUncheckedIndexedAccess` 开启 |
| 状态 | Pinia 4（setup store） | 唯一状态源 `stores/battle.ts` |
| 组件库 | Element Plus 2.14 **按需加载** | `unplugin-auto-import` + `unplugin-vue-components` + `ElementPlusResolver`；dts 生成在 `src/` 下（被 `tsconfig.app.json` include 覆盖） |
| 测试 | Vitest 5 | 组件测试：`@vue/test-utils` + `happy-dom` |
| 构建 | Vite 8 | `@` → `src/` 别名；Worker 以独立 chunk 产出 |

## 3. 总体架构

```
表现层   App.vue ─ BatchPanel.vue / ActorPicker.vue / BattleLog.vue
           │ useBattleStore()（Pinia，唯一状态源）
协议层   workers/batchClient.ts ── postMessage ── workers/sim.worker.ts
批量层   core/simulate.ts（纯函数：runOne / batch）
引擎层   core/engine.ts（四节点调度器，对角色语义零知识）
协议层   core/context.ts（Ctx：事件 / 攻击协议 / 状态施加 / 死亡 / 驱散）
角色层   core/actor.ts（基类）+ core/registry/（版本化注册表 + 12 角色）
基础层   core/types.ts（契约）+ core/rng.ts（mulberry32）
```

目录：

```
src/
├─ core/
│  ├─ types.ts            # 跨模块契约（类型即契约，对角色机制零知识）
│  ├─ rng.ts              # mulberry32：next/chance/int/pick
│  ├─ actor.ts            # Actor 基类 + createActor 工厂 + VAR 约定键
│  ├─ context.ts          # BattleCtx：Ctx 接口实现 + 攻击协议
│  ├─ engine.ts           # Battle：四节点回合循环
│  ├─ simulate.ts         # runOne / batch（纯同步纯函数）
│  └─ registry/
│     ├─ index.ts         # 版本聚合：getCharacter / getCharacterIn / listCharacters
│     ├─ types.ts         # Hooks / CharacterDef（接口即文档）
│     ├─ CTX_API.md       # 角色作者的 Ctx 使用指南（kind 矩阵等）
│     └─ 202609/          # 版本目录：12 个角色文件
├─ workers/
│  ├─ sim.worker.ts       # batch 的 Worker 薄包装（progress/done 协议）
│  └─ batchClient.ts      # UI 唯一入口 runBatch(): Promise<BatchResult>
├─ stores/battle.ts       # Pinia：表单 / 运行状态机 / 派生胜率
├─ components/            # ActorPicker / BatchPanel / BattleLog
└─ App.vue
```

**依赖纪律**：UI 只 import `batchClient` / `registry/index.ts` / `core/types.ts`；UI 与 store 不得 import 具体版本角色文件、engine、simulate。

## 4. 核心类型契约（core/types.ts）

```ts
type Side = 'p1' | 'p2';
type Outcome = Side | 'draw';                          // 100 回合上限记平局
type RoundPhase = 'roundStart' | 'actions' | 'settlement' | 'roundEnd';
type BlockReason = 'stun' | 'paralysis' | 'transform';
type StackKind = 'flower' | 'ember' | 'stance' | (string & {});

interface Panel { id; name; hp; atk; def; speed }      // 纯数值面板
interface MarkState { until: number; value?: number }  // 敌方标记槽（约定 #1 换算集中施加侧）
type AttackType = 'attack' | 'segment' | 'flat' | 'pierce';

interface AttackDesc { kind: AttackType; base: number; label: string; mult?: number; hits?: number }
type HitResult = { missed: true } | { missed: false; dealt: number; killed: boolean };
// dealt = 计算伤害（不按剩余血量截断，对齐官方日志"造成 N 点伤害，剩余 0"）

type BattleEvent = { round; phase; side? } & (
  // 整场
  | { type: 'battleStart'; first: Side }                          // 随机流首消费点（同速掷先手）
  // roundStart
  | { type: 'roundStart' }
  | { type: 'passiveTrigger'; label: string; detail?: string }    // 时间倒转/游云三选一
  // actions（攻击相关统一走 damage）
  | { type: 'action'; skill: string; isNormal: boolean }
  | { type: 'actionBlocked'; reason: BlockReason }
  | { type: 'attackStart'; label: string }                        // 仅 attack 类；segment 不发
  | { type: 'dodge'; label: string }
  | { type: 'damage'; label: string; raw: number; dealt: number;
      absorbed?: number; hits?: number; trueDamage?: number }     // raw−dealt=护盾吸收
  | { type: 'proc'; kind: 'trueDamage' | 'passive'; label: string }
  | { type: 'death'; side: Side }                                 // 跨 phase，标实际发生处
  // settlement / roundEnd
  | { type: 'statusApply'; status: StatusName; until: number; sourceId: string }
  | { type: 'statusExpire'; status: StatusName; sourceId?: string }
  | { type: 'shieldGain'; value: number }
  | { type: 'heal'; value: number }
  | { type: 'stacks'; kind: StackKind; delta: number; total: number }
  | { type: 'revive'; hp: number }
  | { type: 'battleEnd'; outcome: Outcome; totalRounds: number }
);

interface BattleResult { outcome; rounds; events: BattleEvent[] }
interface BatchRequest { p1; p2; count; seed; logFirst? }
interface BatchResult { p1; p2; p1Win; p2Win; draw; firstEvents?: BattleEvent[] }
```

要点：**日志 = 事件流**。三类发出方（引擎骨架 / 攻击协议 / 角色钩子）一个出口（`ctx.emit`），角色私有数据（vars）不外泄、变化事实公开；文本日志是事件流的渲染投影。

## 5. Actor 基类（core/actor.ts）

### 5.1 字段三分法

| 字段组 | 归属 | 读写者 |
|---|---|---|
| 面板：`id/name/maxHp/atkBase/defBase/speed/activeInterval` | 基类（构造时从 Panel 键名映射并**克隆引用字段**，切断注册表共享——确定性根基） | 构造 |
| 通用流程状态：`hp/shield/stunRound/noActRound/noGainAtkRound/noGainDefRound/timedAtk/timedDef/marks/blockStatus/_side` | 基类 | 引擎与协议 |
| 角色私有：`vars: Record<string, number>`（约定键 `atkBonus/defBonus` 只由 ctx 增益 API 累加，角色勿直写） | 基类提供袋子 | 只由角色钩子读写 |
| 回溯队列：`snapQueue: ActorState[]` | 基类容器 | 快照钩子 |

### 5.2 派生属性

```
curAtk = max(0, atkBase + vars.atkBonus + Σ timedAtk[*].value)
curDef = max(0, defBase + vars.defBonus + Σ timedDef[*].value)
isAlive = hp > 0
```

### 5.3 流程钩子（全部 no-op，"未实现即正常继续"）

| 钩子 | 节点 | 说明 |
|---|---|---|
| `onRoundStart(ctx)` | ① | 回合开始被动（含自管快照推入，可致死） |
| `onAction(ctx)` | ② | **默认实现 = 按 `activeInterval` 分流**（主动技/普攻），注册表不要重复实现分流 |
| `normalAttack(ctx)` | ② | 默认走完整攻击管线（base=curAtk） |
| `activeSkill(ctx)` | ② | 只写技能效果；声明了 activeInterval 必须覆写 |
| `beforeHit(ctx, atk): boolean` | 受击 | 返回 false = 被闪避（仅 attack 类触发） |
| `computeIncoming(ctx, atk, raw): number` | 受击 | 最终扣血覆写；**只允许改数字**，护盾/扣血路径留在协议层 |
| `onHit(ctx, atk)` | 攻击方 | 命中后（仅 attack 类且未击杀） |
| `onDamaged(ctx, atk)` | 受击方 | 每段伤害独立触发；击杀一击不触发 |
| `onLethal(ctx): boolean` | 受击方 | 致命伤拦截，true=复活（回血自行设置 hp） |
| `onStatusApply(ctx, status, sourceId)` | 被动感知 | 被施加封锁/降防/敌方标记时触发 |
| `onSettle(ctx)` | ③ | 角色私有衰减（层数 −1 等） |
| `snapshot()/restore(s)` | 回溯 | 基类挂空；快照内容与还原由角色自定义（`ActorState` 不透明容器），`pushSnapshot(depth)` 提供通用队列 |

### 5.4 通用槽结算（引擎结算段按序调用，不走覆写链）

| 方法 | 行为 |
|---|---|
| `settleBlocks(ctx)` | `stunRound/noActRound/noGainAtkRound/noGainDefRound` 计数 −1；归零按 `blockStatus` 字典发 `statusExpire` |
| `settleTimed(ctx)` | `timedAtk/timedDef` 各标记 rounds −1；归零移除并发 `statusExpire` |
| `sweepMarks(ctx)` | 敌方标记 `until < round` 过期；`sourceId` 从键名前缀（`施加者id.状态名`）还原 |

## 6. Context 与攻击协议（core/context.ts）

`Ctx` 是角色函数的唯一世界入口。`self/target` 由引擎在每次行动/结算前 `beginAction()` 设置；战斗结束后 `emit` 空转（battleEnd 恒为事件流最后一条）。

### 6.1 统一伤害入口（kind 矩阵集中实现）

```ts
ctx.attack(desc: AttackDesc, who?: Actor): HitResult
// who 缺省 = ctx.target；受击钩子反击攻击方时传 ctx.self
```

| kind | 闪避 | 攻击方 onHit | 受击方 onDamaged | 防御 | 护盾 | 用途 |
|---|---|---|---|---|---|---|
| `attack` | ✓ | ✓ | ✓ | 减 | 吸收 | 攻击动作（普攻/主动技主段） |
| `segment` | ✗ | ✗ | ✓ | 减 | 吸收 | 技能效果段（点燃/子弹/反击） |
| `flat` | ✗ | ✗ | ✓ | **无视** | 吸收 | 无视防御追加 |
| `pierce` | ✗ | ✗ | ✓ | **无视** | **无视** | 真伤，最低 1 |

伤害公式：`raw = max(1, round(base × (mult ?? 1)) − curDef)`（flat/pierce 不减防御）。反击固定以 `segment` 发起（不吃闪避）+ depth 护栏防双闪避递归；每段结束即时 `resolveDeaths()`（单一死亡检查点）。

### 6.2 资源与状态施加

| API | 说明 |
|---|---|
| `heal(amount, who?)` | 回血封顶 maxHp，默认作用于自身 |
| `shieldGain(value)` | 自身加盾 |
| `block(target, status, rounds, scope)` | 封锁类合并施加：scope `'action'`→stunRound（封全部行动）／`'active'`→noActRound（仅阻止主动技）／`'defUp'`→noGainDefRound（防御获得封锁）；刷新语义，`blockStatus` 字典记录状态名供到期还原 |
| `atkUp/atkDown(target, value, duration, rounds?, tag?)` | 攻击变化统一入口：`duration: 'perm'`（写入 vars.atkBonus）／`'temp'`（写入 timedAtk，同 tag 刷新）；**增益方向受 noGainAtkRound 封锁（返回 false），减益不受限** |
| `defUp/defDown(...)` | 防御变化，语义同上（timedDef / vars.defBonus） |
| `applyMark(label, duration, value?)` / `opponentMark(label)` | 施加者独占标记：数据挂 `target.marks`（键=`施加者id.状态名`），语义只有施加者读取 |
| `ownDebuffs() / clearDebuffs()` | 负面状态枚举与**驱散**（封锁计数清零 + 删敌方标记，逐项发 statusExpire；自身 vars 增益不算负面） |
| `resolveDeaths() / finish(outcome)` | 死亡单一检查点；回合上限平局走 finish |

状态施加日志为两行式：`proc(kind:'passive')`（触发成功）+ `statusApply(side=目标, sourceId=施加者)`。

## 7. 引擎（core/engine.ts）——四节点调度器

```ts
for (rnd of 1..100) {
  ① roundStart:  emit roundStart → 逐个 beginAction(a) + a.onRoundStart → 死亡兜底
  ② actions:     逐个 beginAction →
                 stunRound > 0 → actionBlocked 跳过（封锁不顺延）→
                 activeInterval 命中且 noActRound > 0 → 降级普攻（节奏不顺延）→
                 否则 a.onAction → 死亡兜底（双向：击杀/反击反杀）
  ③ settlement:  逐个 beginAction → settleBlocks → settleTimed → sweepMarks → onSettle
  ④ roundEnd:    仅推进 phase，无调用
}
```

先手：速度高者；同速掷随机（随机流首消费点）。事件自动携带 `round/phase`（骨架事件可显式覆盖）。

## 8. 角色注册表（core/registry/）

- **版本化**：角色按版本目录存放（`202609/`），`index.ts` 聚合（较新版本覆盖同名 id）。
  - `getCharacter(id)`——聚合入口（UI/simulate 用）；
  - **`getCharacterIn(version, id)`**——只在指定版本表内查找、跨版本不回退：新版本合入后，带旧版本参数的测试继续测旧版本数据；
  - `listCharacters()`——UI 选择器列表（带版本标签）。
- **12 角色**：希儿、芽衣、科拉莉、布洛妮娅、赫丽娅、琪亚娜、丽塔、薇塔、游云、希娜狄雅、幽兰黛尔、寻梦者。
- **CharacterDef** = `Panel & { activeInterval; vars? } & Hooks`（全部钩子可选）。`createActor` 工厂把注册表函数体绑定为实例方法，未覆写落基类 no-op。
- 角色作者指南见 `registry/CTX_API.md`（kind 矩阵、钩子触发时机、约定清单）。

## 9. 批量统计层

| 文件 | 职责 |
|---|---|
| `core/simulate.ts` | 纯同步纯函数。`runOne(p1, p2, seed)` 单场；`batch(req, onProgress?)` 批量统计。只消费 outcome，不留事件（每场 events 随作用域 GC）；`logFirst` 仅保留第 0 场事件流挂 `BatchResult.firstEvents` |
| `workers/sim.worker.ts` | 薄包装：入站 `BatchRequest`，出站 `{type:'progress'}`（每 500 场）与 `{type:'done', result}` |
| `workers/batchClient.ts` | UI 唯一入口：`runBatch(req, onProgress?): Promise<BatchResult>` |

**seed 派生策略（写死）**：第 i 场 = `seed + i`（i 从 0 起）。每场独立满种子，任意一场可单独 `runOne` 复现；批量与单场共享同一确定性契约。`count >= 500` 才启用进度上报。

## 10. UI 层

### 10.1 store（stores/battle.ts，setup 风格）

| 分组 | 成员 |
|---|---|
| 表单 | `p1Id/p2Id`（默认注册表前两个角色）、`count(1000)`、`seed(42)`、`logFirst(true)`、`randomMode`（种子随机开关） |
| 运行 | `running`、`progress{done,total}`、`progressPercent`、`result`、`error`、`lastSeed`（**实际使用的种子**，随机模式运行时生成并回写输入框——可复现锚点） |
| 派生 | `winRates`（三向百分比） |
| 动作 | `run()`（协议状态机 idle→running(进度)→done/error，running 守卫防重入） |

### 10.2 组件

| 组件 | 职责 |
|---|---|
| `ActorPicker.vue` | 角色选择器（`side` prop 双实例复用），选项带版本标签 |
| `BatchPanel.vue` | 配置表单 + 随机种子开关（选中高亮，运行时生成并回写）+ 运行按钮（甲乙同角色禁用）+ 进度条 + 三向胜率条 + "使用种子 N（同种子可复现）"展示；错误经 watch → `ElMessage.error`（store 保持框架无关） |
| `BattleLog.vue` | 单场时间轴：`battleStart/battleEnd` 摘为首尾行，其余按回合折叠；15 种事件 → 官方日志式文案（`damage` 的 absorbed/trueDamage/hits 后缀、statusApply 带 sourceId 溯源、stacks 清零 vs 增层）；每行带 phase 四色标签 |

## 11. 测试体系（269+ tests，全部通过）

| 套件 | 覆盖 |
|---|---|
| `units/rng.test.ts`（11） | 确定性、固定向量（seed 0/1/42 硬编码，防换算法破坏下游种子）、值域、helper 消耗数（同 seed 双实例比对） |
| `units/actor.test.ts` | 面板映射、派生属性、onAction 分流、工厂绑定、快照队列 |
| `units/context.test.ts`（38） | **kind 矩阵四路径全覆盖**、闪避+反击、护盾吸收、复活/击杀短路、block 刷新、标记过期、驱散、事件自动补全 |
| `units/engine.test.ts` | 先手、事件 phase 序列合法性、封锁跳过/恢复、主动技降级、平局上限 |
| `units/registry.test.ts` | 聚合/版本化取角 |
| `units/characters.test.ts`（169） | 12 角色逐技能行为锁定 |
| `units/simulate.test.ts` | 总数守恒、幂等、**seed+i 派生与逐场独立运行交叉验证**、logFirst |
| `units/battle-store.test.ts` | store 状态机、随机模式种子生成/回写 |
| `units/batch-panel.test.ts` | 组件挂载：点击→运行→"使用种子"文案（element-plus 内联进 vitest 管线处理样式导入） |
| `regression.test.ts` | **版本化基准对局**：`CASES: [version, p1, p2, seed][]`（key = `版本.p1vsp2@seed`），`UPDATE_BASELINES=1` 生成基准 json；任何基准变化 = 行为漂移须查明；已登记 202609 三组对局 |

## 12. 关键设计决策（速查）

1. **确定性三支柱**：mulberry32 固定向量钉死 / Actor 构造克隆引用字段（切断注册表共享）/ seed+i 派生可单独复现。RNG 状态不入快照（随机流只进不退）。
2. **引擎零知识**：引擎只调钩子 + 通用槽结算；角色私有状态全在 vars/marks/钩子内。
3. **受击方协议**：标准扣减（护盾吸收/复活）有默认实现，`computeIncoming` 只覆写数字，统一扣血路径不可绕过。
4. **事件取舍**："仅公开必要"——pierce 并入 `damage.trueDamage`、counter 用 segment damage 表达、吸收量作 `absorbed` 字段；`stacks` 等内部状态"数据私有、变化公开"。
5. **状态三分法**：引擎级（封锁/护盾/限时攻防，基类字段）／施加者独占（marks，数据挂目标语义归施加者）／纯记录（vars）。
6. **限时状态统一模型**：施加置满时长（刷新）→ 结算段 −1 → 归零发 statusExpire；`until` 字段仅供事件展示。
7. **已移除**：官方日志校准/反推通道（含 M4 里程碑与 scanSeed 工具）——项目定位为独立模拟器，回归基准 + 规则不变量即行为守卫。

## 13. 现状与后续

- **已完成**：core 全层、12 角色（202609 版）、批量层 + Worker、UI MVP（选角 → 批量 → 胜率 → 时间轴）、版本化回归基准。
- **待做**：
  - UI 细节迭代：平均回合数展示、时间轴事件过滤、数值高亮；
  - 新版本角色注册表流程演练（`getCharacterIn` 已就绪，旧基准不漂移）；
  - 大批量性能观察（10 万场量级）。
