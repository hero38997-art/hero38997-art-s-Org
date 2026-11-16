export type Role = 'passenger' | 'inspector' | 'faker';

export type GamePhase = 'lobby' | 'intro' | 'play' | 'meeting' | 'eject' | 'end';

export type SabotageType = 'lights' | 'doors' | 'brakes' | 'comms' | null;

export type TaskType =
  | 'swipe'
  | 'wires'
  | 'code'
  | 'lights'
  | 'clean'
  | 'luggage'
  | 'throttle'
  | 'canteen'
  | 'signal'
  | 'wipe'
  | 'scan'
  | 'trash'
  | 'ac'
  | 'tap';

export interface TaskSpot {
  id: number;
  coach: number;
  type: TaskType;
  label: string;
  x: number;
  y: number;
  dur: number;
  visual?: boolean;
  hard?: boolean;
}

export interface PlayerTask {
  spot: TaskSpot;
  done: boolean;
}

export interface Seat {
  coach: number;
  side: 0 | 1;
  idx: number;
  x: number;
  x0: number;
  w: number;
}

export interface ObstacleRect {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'rack' | 'counter' | 'console' | 'partition' | 'generator';
  blocksVision: boolean;
  label?: string;
}

export interface HazardZone {
  id: string;
  coach: number;
  label: string;
  kind: 'oil' | 'wet';
  x: number;
  y: number;
  w: number;
  h: number;
  multiplier: number;
}

export interface PlayerStatusSummary {
  stunnedLeft: number;
  hasteLeft: number;
  slowMultiplier: number;
  slowReason: string | null;
  visionReduced: boolean;
  speedMultiplier: number;
}

export interface VentNode {
  id: number;
  coach: number;
  x: number;
  y: number;
  links: number[];
}

export interface CameraNode {
  id: number;
  coach: number;
  name: string;
  x: number;
  y: number;
  viewX: number;
  viewY: number;
}

export interface SabotageSpot {
  id: string;
  type: Exclude<SabotageType, null | 'doors'>;
  coach: number;
  label: string;
  x: number;
  y: number;
}

export interface BotGoal {
  kind: 'task' | 'wander' | 'hunt' | 'fix' | 'vent' | 'alarm' | 'watch' | 'flee';
  task?: PlayerTask;
  sabSpot?: SabotageSpot;
  ventId?: number;
  pid?: number;
  x?: number;
  y?: number;
  exp?: number;
}

export interface BotAIState {
  goal: BotGoal | null;
  wait: number;
  huntCd: number;
  stuck: number;
  nudge: number;
  nx: number;
  ny: number;
  chkCd: number;
  reportT: number;
  rep: boolean;
  sightings?: Record<number, { coach: number; t: number }>;
  clearedIds?: number[];
  tempo?: number;
  ventStay?: number;
  watchCd?: number;
  lastScanSeen?: Record<number, boolean>;
}

export interface Player {
  id: number;
  name: string;
  color: string;
  acc: number;
  skin: string;
  pants: string;
  hair: string;
  isMe: boolean;
  role: Role;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  ph: number;
  moving: boolean;
  inVent: number | null;
  scanningUntil: number;
  lungeUntil: number;
  stunnedUntil: number;
  hasteUntil: number;
  slowReason?: string | null;
  speedMul?: number;
  seat: Seat;
  tasks: PlayerTask[];
  coolSteal: number;
  coolCheck: number;
  uses: number;
  known: Record<number, boolean>;
  susp: Record<number, number>;
  lastCoach: number;
  chains: number;
  ai: BotAIState;
}

export interface StolenBody {
  id: number;
  x: number;
  y: number;
  pid: number;
  color: string;
  name: string;
  createdAt: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface Footprint {
  x: number;
  y: number;
  alpha: number;
  color: string;
  angle: number;
  suspect?: boolean;
}

export interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  color: string;
}

export interface ScheduledChat {
  at: number;
  pid: number;
  text: string;
  done: boolean;
}

export interface MeetingState {
  stage: 'discuss' | 'vote' | 'result' | 'eject';
  t: number;
  callerId: number;
  body: StolenBody | null;
  votes: Record<number, number>;
  sched: ScheduledChat[];
  botAt: Record<number, number>;
  mention: Record<number, number>;
  out: Player | null;
  ejectProgress: number;
  chatLog: Array<{ id: number; name?: string; color?: string; text: string; sys?: boolean }>;
}

export interface LobbyConfig {
  name: string;
  color: number;
  acc: number;
  skin: number;
  count: number;
  fakers: number;
}

export type ActiveModal =
  | null
  | { kind: 'task'; task: PlayerTask }
  | { kind: 'sabotageFix'; spot: SabotageSpot }
  | { kind: 'cctv' }
  | { kind: 'radar' }
  | { kind: 'map' }
  | { kind: 'sabotageMenu' };

export interface SabotageState {
  active: SabotageType;
  timer: number;
  fixedParts: Record<string, boolean>;
  cooldown: number;
  doorLockedUntil: number;
}

export interface GameWorld {
  phase: GamePhase;
  players: Player[];
  me: Player;
  t: number;
  scroll: number;
  trainSpeed: number; // 0 (stopped at station) to 1 (cruising)
  stationStopUntil: number; // > t when stopped at station platform
  stationDoorOpen: number; // 0 to 1 smooth station exterior door open amount
  ventAnim: Record<number, number>; // 0 to 1 lid open per vent
  bodies: StolenBody[];
  particles: Particle[];
  footprints: Footprint[];
  shockwaves: Shockwave[];
  totalTasks: number;
  doneTasks: number;
  nearTask: PlayerTask | null;
  nearChain: boolean;
  nearBody: StolenBody | null;
  nearVent: VentNode | null;
  nearSabFix: SabotageSpot | null;
  nearCctv: boolean;
  nearRadar: boolean;
  hold: { task: PlayerTask | null; prog: number };
  sabotage: SabotageState;
  camsInUse: boolean;
  m: MeetingState | null;
  cam: { x: number; y: number; shake: number };
  hitFlash: number;
  modal: ActiveModal;
  nextStation: number;
  stIdx: number;
  fakers: number;
  endReason: string;
  endWinner: 'passengers' | 'fakers' | null;
  toastText: string;
  toastUntil: number;
  isOnline?: boolean;
  matchTimer?: number;
  myUsesMax?: number;
  myKnown?: Record<number, boolean>;
}

export interface LobbyChatEntry {
  id: number;
  fromId?: number;
  name?: string;
  color?: string;
  text: string;
  sys?: boolean;
}

export interface NetRoomPlayer {
  id: number;
  name: string;
  color: string;
  acc: number;
  skin: string;
  isBot: boolean;
  connected: boolean;
  ready?: boolean;
}

export interface NetRoomState {
  code: string;
  isPublic: boolean;
  teamName?: string;
  hostId: number;
  maxPlayers: number;
  fillBots: boolean;
  countdown: number | null;
  phase: GamePhase;
  players: NetRoomPlayer[];
  lobbyChat?: LobbyChatEntry[];
}
