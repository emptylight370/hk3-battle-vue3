// 阵营
export type Side = 'p1' | 'p2';

// 结果（p1/p2 胜出或平局）
export type Outcome = Side | 'draw';

// 回合阶段
export type RoundPhase = 'roundStart' | 'actions' | 'settlement' | 'roundEnd';

// 行动封锁状态
export type BlockReason = 'stun' | 'paralysis' | 'transform';

// 角色面板
export interface ActorPanel {
  id: string;
  name: string;
  hp: number;
  atk: number;
  def: number;
  speed: number;
}

// 角色状态（通用标记槽：数据挂目标身上，语义归施加者钩子独占）
export interface MarkState {
  until: number;
  value?: number; // 多数标记无附加值
}
export type Marks = Record<string, MarkState>;

// 事件基础组成（成员可收窄 side 为必填，如 death）
export interface EventBase {
  round: number;
  phase: RoundPhase;
  side?: Side;
}

// 引擎级状态名（封闭集合）；自定义标记名通过 `| (string & {})` 放行
export type EngineStatus =
  | '眩晕'
  | '麻痹'
  | '禁锢'
  | '魅惑'
  | '降防'
  | '屏障';
export type StatusName = EngineStatus | (string & {});

// 层数类状态（受击判花 / 灼光 / 刀势）
export type StackKind = 'flower' | 'ember' | 'stance';

// 战斗事件（按回合四阶段组织的扁平判别联合）
export type BattleEvent = EventBase &
  (// ---- 整场：战斗开始（round: 0；同速掷先手时此处即随机流首消费点）----
    | { type: 'battleStart'; first: Side } // 对应日志首行"……，X 先手"
    // ---- roundStart：回合开始（回合开始被动，可致死）----
    | { type: 'roundStart' }
    | { type: 'passiveTrigger'; label: string; detail?: string } // 时间倒转/游云触发
    // ---- actions：双方攻击 ----
    | { type: 'action'; skill: string; isNormal: boolean } // 行动宣告（普攻无独立宣告行）
    | { type: 'actionBlocked'; reason: BlockReason } // 封锁：无法行动
    | { type: 'attackStart'; label: string } // 攻击动作开始（segment 不发）
    | { type: 'dodge'; label: string } // 被闪避（仅 attack 可触发）
    // 通用伤害段（attack/segment/flat/pierce 统一走此事件）
    | {
        type: 'damage';
        label: string; // 含效果段/反击/追加
        raw: number; // 防御减免前
        dealt: number; // 实扣血量
        absorbed?: number; // 护盾吸收量 = raw − dealt（有则填）
        hits?: number; // 多段聚合数（如"2次分裂"）
        trueDamage?: number; // 含真伤标注（pierce 并入此处）
      }
    | { type: 'proc'; kind: 'trueDamage' | 'passive'; label: string } // 命中前/后概率标记
    | { type: 'death'; side: Side } // 跨阶段：标实际发生处
    // ---- settlement：状态结算 ----
    | { type: 'statusApply'; status: StatusName; until: number; sourceId: string }
    | { type: 'statusExpire'; status: StatusName; sourceId?: string } // 到期统一在结算段扫出
    | { type: 'shieldGain'; value: number } // 官方日志有"获得 N 点护盾"行
    | { type: 'heal'; value: number }
    | { type: 'stacks'; kind: StackKind; delta: number; total: number } // 刀势/花等：数据私有、变化公开
    | { type: 'revive'; hp: number }
    // ---- roundEnd：回合结束（无调用，仅事件）----
    | { type: 'battleEnd'; outcome: Outcome; totalRounds: number }
  );

// 攻击协议
export type AttackType = 'attack' | 'segment' | 'flat' | 'pierce';

// 攻击描述
export interface AttackDesc {
  kind: AttackType;
  base: number;
  label: string;
  mult?: number; // 攻击倍率（如灼光强化 ×1.5）
  hits?: number; // 多段聚合数（如布洛妮娅"2次分裂"，仅展示用，逐段单独走协议）
}

// 受击结果（判别联合：闪避时无伤害语义，防止 dealt=0 的歧义）
export type HitResult =
  | { missed: true }
  | { missed: false; dealt: number; killed: boolean };

// 事件输入：round/phase/side 可省略（由 ctx.emit 自动补当前值）
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<BattleEvent, 'round' | 'phase' | 'side'> & {
  round?: number;
  phase?: RoundPhase;
  side?: Side;
};

// 单场结果
export interface BattleResult {
  outcome: Outcome;
  rounds: number;
  events: BattleEvent[];
}

// 批量请求 Worker
export interface BatchRequest {
  p1: string; // 角色 id
  p2: string; // 角色 id
  count: number;
  seed: number;
  logFirst?: boolean; // 首场携带完整事件流（单场带日志按需）
}

// 批量结果 Worker
export interface BatchResult {
  p1: string;
  p2: string;
  p1Win: number;
  p2Win: number;
  draw: number;
}
