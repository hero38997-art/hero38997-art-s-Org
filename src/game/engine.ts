import { soundEngine } from './audio';
import {
  botVoteDecision,
  generateBotLines,
  generateReactiveBotReplies,
  updateBot,
} from './botAI';
import {
  BENCH,
  BOT_NAMES,
  CCTV_CONSOLE,
  CH,
  CHAIN,
  COACH_NAMES,
  COLORS,
  DISCUSS_TIME,
  HAIRS,
  PANTS,
  RADAR_CONSOLE,
  RESULT_TIME,
  SABOTAGE_SPOTS,
  SEATS,
  SKINS,
  SPOTS,
  STATIONS,
  VENTS,
  VOTE_TIME,
  bn,
  clampOutOfGangway,
  coachOf,
  getPlayerStatus,
  movePlayer,
  pick,
  rnd,
  shuffle,
} from './mapData';
import {
  GameWorld,
  LobbyConfig,
  Player,
  PlayerTask,
  SabotageType,
  StolenBody,
  TaskType,
} from './types';

export const MINI_TASK_TYPES: TaskType[] = [
  'swipe',
  'wires',
  'code',
  'lights',
  'clean',
  'luggage',
  'throttle',
  'canteen',
  'signal',
  'wipe',
  'scan',
];

export function isInteractiveMiniTask(type: TaskType): boolean {
  return MINI_TASK_TYPES.includes(type);
}

function createPlayer(
  id: number,
  name: string,
  color: string,
  acc: number,
  skin: string,
  isMe: boolean
): Player {
  return {
    id,
    name,
    color,
    acc,
    skin,
    pants: pick(PANTS),
    hair: pick(HAIRS),
    isMe,
    role: 'passenger',
    alive: true,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: 1,
    ph: 0,
    moving: false,
    inVent: null,
    scanningUntil: 0,
    lungeUntil: 0,
    stunnedUntil: 0,
    hasteUntil: 0,
    slowReason: null,
    speedMul: 1,
    seat: SEATS[0],
    tasks: [],
    coolSteal: 10,
    coolCheck: 0,
    uses: 5,
    known: {},
    susp: {},
    lastCoach: 3,
    chains: 1,
    ai: {
      goal: null,
      wait: 0,
      huntCd: rnd(6, 15),
      stuck: 0,
      nudge: 0,
      nx: 0,
      ny: 0,
      chkCd: rnd(6, 13),
      reportT: 0,
      rep: false,
    },
  };
}

function placeAtSeat(p: Player): void {
  p.x = p.seat.x;
  p.y = p.seat.side ? CH - BENCH - 14 : BENCH + 14;
  p.inVent = null;
}

function pickPlayerTasks(): PlayerTask[] {
  const used: Record<string, boolean> = {};
  const out: PlayerTask[] = [];
  shuffle(SPOTS).forEach((s) => {
    if (out.length < 6 && !used[s.type]) {
      used[s.type] = true;
      out.push({ spot: s, done: false });
    }
  });
  return out;
}

export function createWorld(cfg: LobbyConfig): GameWorld {
  const total = Math.max(4, Math.min(7, cfg.count));
  const players: Player[] = [];
  players.push(
    createPlayer(
      0,
      cfg.name.trim() || 'আমি',
      COLORS[cfg.color] || COLORS[1],
      cfg.acc,
      SKINS[cfg.skin] || SKINS[1],
      true
    )
  );

  const availCols = shuffle(COLORS.map((_, i) => i).filter((c) => c !== cfg.color));
  const availNames = shuffle(BOT_NAMES.filter((n) => n !== cfg.name.trim()));
  for (let i = 1; i < total; i++) {
    players.push(
      createPlayer(
        i,
        availNames[i - 1] || `যাত্রী ${bn(i)}`,
        COLORS[availCols[i - 1]],
        (Math.random() * 8) | 0,
        SKINS[(Math.random() * SKINS.length) | 0],
        false
      )
    );
  }

  const maxFakers = total >= 7 ? Math.min(2, cfg.fakers) : 1;
  const rolePool: Array<'faker' | 'inspector' | 'passenger'> = ['faker', 'inspector', 'passenger'];
  const humanRole = rolePool[(Math.random() * rolePool.length) | 0];
  players[0].role = humanRole;

  const botIds = shuffle(players.slice(1).map((p) => p.id));
  let cursor = 0;
  const remainingFakers = Math.max(0, maxFakers - (humanRole === 'faker' ? 1 : 0));
  for (let f = 0; f < remainingFakers && cursor < botIds.length; f++) {
    players[botIds[cursor++]].role = 'faker';
  }
  if (humanRole !== 'inspector' && cursor < botIds.length) {
    players[botIds[cursor++]].role = 'inspector';
  }

  const seats = shuffle(SEATS).slice(0, total);
  let totalTasks = 0;
  players.forEach((p, idx) => {
    p.seat = seats[idx] || SEATS[idx % SEATS.length];
    placeAtSeat(p);
    p.tasks = pickPlayerTasks();
    if (p.role !== 'faker') totalTasks += p.tasks.length;
  });

  return {
    phase: 'intro',
    players,
    me: players[0],
    t: 0,
    scroll: 0,
    trainSpeed: 1,
    stationStopUntil: 0,
    stationDoorOpen: 0,
    ventAnim: {},
    bodies: [],
    particles: [],
    footprints: [],
    shockwaves: [],
    totalTasks,
    doneTasks: 0,
    nearTask: null,
    nearChain: false,
    nearBody: null,
    nearVent: null,
    nearSabFix: null,
    nearCctv: false,
    nearRadar: false,
    hold: { task: null, prog: 0 },
    sabotage: {
      active: null,
      timer: 0,
      fixedParts: {},
      cooldown: 14,
      doorLockedUntil: 0,
    },
    camsInUse: false,
    m: null,
    cam: { x: players[0].x, y: CH / 2, shake: 0 },
    hitFlash: 0,
    modal: null,
    nextStation: 26,
    stIdx: (Math.random() * STATIONS.length) | 0,
    fakers: maxFakers,
    endReason: '',
    endWinner: null,
    toastText: '',
    toastUntil: 0,
  };
}

export function showToast(world: GameWorld, text: string, duration = 3): void {
  world.toastText = text;
  world.toastUntil = world.t + duration;
}

export function spawnParticles(
  world: GameWorld,
  x: number,
  y: number,
  color: string,
  count = 14
): void {
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = rnd(25, 110);
    world.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      life: rnd(0.35, 0.8),
      maxLife: 0.8,
      size: rnd(2, 4.5),
      color,
    });
  }
}

export function checkWin(world: GameWorld): void {
  if (world.phase === 'end') return;
  const alive = world.players.filter((p) => p.alive);
  const fakers = alive.filter((p) => p.role === 'faker').length;
  const others = alive.length - fakers;

  if (fakers === 0) {
    finishGame(world, 'passengers', 'সব চোর ধরা পড়েছে ও ট্রেন থেকে নামানো হয়েছে!');
    return;
  }
  if (fakers >= others) {
    finishGame(world, 'fakers', 'চোরের সংখ্যা যাত্রীদের সমান হয়ে গেছে!');
    return;
  }
  if (world.doneTasks >= world.totalTasks) {
    finishGame(world, 'passengers', 'যাত্রীরা মিলে মেট্রোর সব কাজ সম্পন্ন করেছে!');
  }
}

export function finishGame(
  world: GameWorld,
  winner: 'passengers' | 'fakers',
  reason: string
): void {
  if (world.phase === 'end') return;
  world.phase = 'end';
  world.modal = null;
  world.endWinner = winner;
  world.endReason = reason;
  soundEngine.setRumble(false);
  const iWin = (winner === 'fakers') === (world.me.role === 'faker');
  soundEngine.sfx(iWin ? 'win' : 'lose');
}

export function completeTask(world: GameWorld, p: Player, taskIndex: number): void {
  const t = p.tasks[taskIndex];
  if (!t || t.done) return;
  t.done = true;
  if (p.role !== 'faker') world.doneTasks++;

  if (t.spot.type === 'trash') {
    spawnParticles(world, t.spot.x, t.spot.y + 18, '#94a3b8', 18);
  }
  if (t.spot.type === 'scan' && p.role !== 'faker') {
    p.scanningUntil = world.t + 3.5;
    if (p.isMe) soundEngine.sfx('scan');
  }
  if (t.spot.hard && p.alive) {
    p.hasteUntil = Math.max(p.hasteUntil || 0, world.t + 4.5);
    if (p.isMe) soundEngine.sfx('haste');
  }
  if (p.isMe) {
    soundEngine.sfx('task');
    spawnParticles(world, t.spot.x, t.spot.y, '#4ade80', 14);
    world.shockwaves.push({
      x: t.spot.x,
      y: t.spot.y,
      r: 8,
      maxR: 48,
      alpha: 0.85,
      color: '#4ade80',
    });
    showToast(
      world,
      p.role === 'faker'
        ? 'কাজের ভান শেষ হয়েছে'
        : t.spot.hard
        ? 'কঠিন কাজ সম্পন্ন! ৪.৫ সেকেন্ড দ্রুতগতি সক্রিয়'
        : 'কাজ সফলভাবে শেষ হয়েছে'
    );
  }
  checkWin(world);
}

export function stealBag(world: GameWorld, killer: Player, victim: Player): void {
  if (!victim.alive || !killer.alive) return;
  victim.alive = false;
  victim.inVent = null;
  world.bodies.push({
    id: world.bodies.length + 1,
    x: victim.x,
    y: victim.y,
    pid: victim.id,
    color: victim.color,
    name: victim.name,
    createdAt: world.t,
  });
  killer.coolSteal = 22;
  killer.lungeUntil = world.t + 0.34;
  killer.face = victim.x >= killer.x ? 1 : -1;
  spawnParticles(world, victim.x, victim.y - 12, '#ef4444', 22);
  world.shockwaves.push({
    x: victim.x,
    y: victim.y - 10,
    r: 8,
    maxR: 72,
    alpha: 0.9,
    color: '#ef4444',
  });

  // Nearby witnesses gain suspicion
  world.players.forEach((q) => {
    if (
      q.alive &&
      !q.isMe &&
      q.role !== 'faker' &&
      q !== victim &&
      Math.hypot(q.x - victim.x, q.y - victim.y) < 185 &&
      Math.random() < 0.72
    ) {
      q.susp[killer.id] = (q.susp[killer.id] || 0) + 2;
    }
  });

  if (victim.isMe || killer.isMe) {
    soundEngine.sfx('steal');
    world.cam.shake = 0.65;
    world.hitFlash = 1;
  }
  if (victim.isMe) {
    world.modal = null;
    showToast(world, 'তোমার ব্যাগ ছিনতাই হয়েছে! এখন ভূত হয়ে বাকি কাজ শেষ করো', 4.5);
  } else if (killer.isMe) {
    showToast(world, `${victim.name}-এর ব্যাগ চুরি করেছো! দ্রুত সরে পড়ো`);
  }
  checkWin(world);
}

export function triggerSabotage(
  world: GameWorld,
  type: Exclude<SabotageType, null>,
  byBot = false
): void {
  if (world.sabotage.active || world.sabotage.cooldown > 0 || world.phase !== 'play') return;
  world.sabotage.cooldown = 30;

  if (type === 'doors') {
    world.sabotage.doorLockedUntil = world.t + 12;
    world.sabotage.active = null;
    soundEngine.sfx('doorlock');
    world.cam.shake = 0.35;
    let meStunned = false;
    world.players.forEach((p) => {
      if (p.alive && p.inVent === null && clampOutOfGangway(p)) {
        p.stunnedUntil = Math.max(p.stunnedUntil || 0, world.t + 2.2);
        spawnParticles(world, p.x, p.y - 16, '#f5b73d', 12);
        if (p.isMe) meStunned = true;
      }
    });
    if (meStunned) {
      soundEngine.sfx('stun');
      world.cam.shake = 0.55;
      showToast(world, 'দরজার ধাক্কায় তুমি ২.২ সেকেন্ডের জন্য স্তব্ধ হয়েছো!', 3);
    } else {
      showToast(world, 'সব কোচের দরজা ১২ সেকেন্ডের জন্য লক হয়েছে!');
    }
    return;
  }

  world.sabotage.active = type;
  world.sabotage.fixedParts = {};
  if (type === 'brakes') {
    world.sabotage.timer = 45;
    soundEngine.sfx('sabotage');
    let meStunned = false;
    world.players.forEach((p) => {
      if (p.alive && p.inVent === null && coachOf(p.x) === 6) {
        p.stunnedUntil = Math.max(p.stunnedUntil || 0, world.t + 2.6);
        spawnParticles(world, p.x, p.y - 16, '#ef4444', 14);
        if (p.isMe) meStunned = true;
      }
    });
    if (meStunned) {
      soundEngine.sfx('stun');
      world.cam.shake = 0.55;
    }
    showToast(world, 'জরুরি ব্রেক ফেইল! ঝাঁকুনিতে সবার গতি কমেছে — ৪৫ সেকেন্ডে ভালভ রিসেট করো!', 4.5);
  } else if (type === 'lights') {
    world.sabotage.timer = 0;
    soundEngine.sfx('sabotage');
    let meStunned = false;
    world.players.forEach((p) => {
      if (p.alive && p.inVent === null && coachOf(p.x) === 0) {
        p.stunnedUntil = Math.max(p.stunnedUntil || 0, world.t + 3.0);
        spawnParticles(world, p.x, p.y - 16, '#38bdf8', 16);
        world.shockwaves.push({ x: p.x, y: p.y - 12, r: 6, maxR: 48, alpha: 0.9, color: '#38bdf8' });
        if (p.isMe) meStunned = true;
      }
    });
    if (meStunned) {
      soundEngine.sfx('stun');
      world.cam.shake = 0.55;
    }
    showToast(world, 'মেট্রোর লাইট বন্ধ ও ভোল্টেজ শক! ইলেকট্রিক্যালে গিয়ে ব্রেকার ঠিক করো', 4);
  } else if (type === 'comms') {
    world.sabotage.timer = 0;
    if (world.modal?.kind === 'cctv' || world.modal?.kind === 'radar') {
      world.camsInUse = false;
      world.modal = null;
    }
    soundEngine.sfx('sabotage');
    showToast(world, 'যোগাযোগ ও রাডার বিচ্ছিন্ন! সিকিউরিটি রুমে রাউটার রিসেট করো', 4);
  }
  if (!byBot) world.modal = null;
}

export function fixSabotagePart(world: GameWorld, spotId: string, byBot = false): void {
  const sab = world.sabotage;
  if (!sab.active) return;

  if (sab.active === 'lights' && spotId === 'lights') {
    sab.active = null;
    sab.fixedParts = {};
    if (!byBot && world.me.alive) {
      world.me.hasteUntil = Math.max(world.me.hasteUntil || 0, world.t + 4.0);
      soundEngine.sfx('haste');
    }
    soundEngine.sfx('task');
    showToast(world, 'লাইট আবার চালু হয়েছে!');
  } else if (sab.active === 'comms' && spotId === 'comms') {
    sab.active = null;
    sab.fixedParts = {};
    if (!byBot && world.me.alive) {
      world.me.hasteUntil = Math.max(world.me.hasteUntil || 0, world.t + 4.0);
      soundEngine.sfx('haste');
    }
    soundEngine.sfx('task');
    showToast(world, 'যোগাযোগ ব্যবস্থা সচল হয়েছে!');
  } else if (sab.active === 'brakes' && (spotId === 'brake_rear' || spotId === 'brake_front')) {
    sab.fixedParts[spotId] = true;
    if (sab.fixedParts.brake_rear && sab.fixedParts.brake_front) {
      sab.active = null;
      sab.timer = 0;
      sab.fixedParts = {};
      if (!byBot && world.me.alive) {
        world.me.hasteUntil = Math.max(world.me.hasteUntil || 0, world.t + 4.0);
        soundEngine.sfx('haste');
      }
      soundEngine.sfx('task');
      showToast(world, 'জরুরি ব্রেক নিয়ন্ত্রণ ফিরে এসেছে!');
    } else if (!byBot) {
      soundEngine.sfx('check');
      showToast(world, 'একটি ভালভ ঠিক হয়েছে! অপর পাশের ভালভটিও দ্রুত ঠিক করো');
    }
  }
  if (!byBot) world.modal = null;
}

export function startMeeting(world: GameWorld, callerId: number, body: StolenBody | null): void {
  if (world.phase !== 'play') return;
  world.phase = 'meeting';
  world.modal = null;
  world.hold = { task: null, prog: 0 };
  world.sabotage.doorLockedUntil = 0;
  // Clear critical brakes timer on meeting (Among Us rule)
  if (world.sabotage.active === 'brakes') {
    world.sabotage.active = null;
    world.sabotage.timer = 0;
    world.sabotage.fixedParts = {};
  }
  world.players.forEach((p) => {
    p.inVent = null;
    p.stunnedUntil = 0;
    p.hasteUntil = 0;
  });
  world.shockwaves.push({
    x: world.players[callerId]?.x || CHAIN.x,
    y: world.players[callerId]?.y || CHAIN.y,
    r: 12,
    maxR: 160,
    alpha: 0.95,
    color: '#f5b73d',
  });

  soundEngine.sfx('alarm');
  soundEngine.setRumble(false);

  const caller = world.players[callerId];
  const m = {
    stage: 'discuss' as const,
    t: DISCUSS_TIME,
    callerId,
    body,
    votes: {} as Record<number, number>,
    sched: [] as GameWorld['m'] extends infer T ? (T extends { sched: infer S } ? S : never) : never,
    botAt: {} as Record<number, number>,
    mention: {} as Record<number, number>,
    out: null as Player | null,
    ejectProgress: 0,
    chatLog: [] as Array<{ id: number; name?: string; color?: string; text: string; sys?: boolean }>,
  };

  if (body) {
    const victim = world.players[body.pid];
    m.chatLog.push({
      id: 1,
      sys: true,
      text: `${caller.name} একটি ফেলে রাখা ব্যাগ রিপোর্ট করেছে (${COACH_NAMES[coachOf(body.x)]})। শিকার: ${victim.name}।`,
    });
  } else {
    m.chatLog.push({
      id: 1,
      sys: true,
      text: `${caller.name} জরুরি চেইন টেনেছে! সবাই মিলে আলোচনা করো।`,
    });
  }

  world.players.forEach((p) => {
    if (p.alive && !p.isMe) {
      const baseAt = p.id === callerId ? rnd(0.8, 1.8) : rnd(2.2, Math.max(5, DISCUSS_TIME - 10));
      generateBotLines(p, world, m).forEach((tx, idx) => {
        m.sched.push({ at: baseAt + idx * 3.8, pid: p.id, text: tx, done: false });
      });
    }
  });

  world.m = m;
}

export function sendMeetingChat(world: GameWorld, text: string): void {
  const m = world.m;
  const me = world.me;
  const clean = text.trim();
  if (!m || !me.alive || !clean || m.stage === 'result') return;
  m.chatLog.push({
    id: m.chatLog.length + 1,
    name: me.name,
    color: me.color,
    text: clean,
  });
  world.players.forEach((q) => {
    if (q !== me && clean.includes(q.name)) {
      m.mention[q.id] = (m.mention[q.id] || 0) + 1;
    }
  });
  const elapsedSec = m.stage === 'discuss' ? DISCUSS_TIME - m.t : DISCUSS_TIME + (VOTE_TIME - m.t);
  generateReactiveBotReplies(me.id, clean, world, m, elapsedSec);
}

export function castVote(world: GameWorld, pid: number, target: number): void {
  const m = world.m;
  if (!m || m.stage !== 'vote' || m.votes[pid] !== undefined) return;
  const p = world.players[pid];
  if (!p || !p.alive) return;
  m.votes[pid] = target;
  if (pid === 0) soundEngine.sfx('vote');
}

function beginVote(world: GameWorld): void {
  const m = world.m;
  if (!m) return;
  m.stage = 'vote';
  m.t = VOTE_TIME;
  world.players.forEach((p) => {
    if (p.alive && !p.isMe) m.botAt[p.id] = rnd(2.5, VOTE_TIME - 6);
  });
  m.chatLog.push({ id: m.chatLog.length + 1, sys: true, text: 'ভোট শুরু হয়েছে! সন্দেহজনক যাত্রীকে বেছে নাও।' });
}

function showVoteResult(world: GameWorld): void {
  const m = world.m;
  if (!m) return;
  world.players.forEach((p) => {
    if (p.alive && m.votes[p.id] === undefined) m.votes[p.id] = -1;
  });

  const cnt: Record<number, number> = {};
  Object.values(m.votes).forEach((t) => {
    if (t >= 0) cnt[t] = (cnt[t] || 0) + 1;
  });

  const rows = world.players
    .filter((p) => p.alive)
    .map((p) => ({ p, c: cnt[p.id] || 0 }))
    .sort((a, b) => b.c - a.c);
  const max = rows.length ? rows[0].c : 0;
  const tops = rows.filter((r) => r.c === max);
  m.out = max > 0 && tops.length === 1 ? tops[0].p : null;
  m.stage = 'result';
  m.t = RESULT_TIME;
}

export function endMeeting(world: GameWorld): void {
  const m = world.m;
  if (!m) return;
  if (m.out) m.out.alive = false;
  world.bodies = [];
  world.m = null;
  checkWin(world);
  if (world.phase === 'end') return;

  world.players.forEach((p) => {
    placeAtSeat(p);
    p.ai.goal = null;
    p.ai.wait = 0;
    p.ai.reportT = 0;
    p.ai.sightings = {};
    p.ai.huntCd = rnd(8, 16);
    p.coolSteal = Math.max(p.coolSteal, 15);
  });
  world.hold = { task: null, prog: 0 };
  world.phase = 'play';
  world.cam.x = world.me.x;
  soundEngine.setRumble(true);
  showToast(world, world.me.alive ? 'ট্রেন আবার যাত্রা শুরু করলো…' : 'তুমি এখন ভূত। বাকি কাজগুলো শেষ করো!');
}

export function nearestOther(
  world: GameWorld,
  me: Player,
  range: number,
  pred?: (q: Player) => boolean
): Player | null {
  let best: Player | null = null;
  let bd = range;
  world.players.forEach((q) => {
    if (q === me || !q.alive || q.inVent !== null) return;
    if (pred && !pred(q)) return;
    const d = Math.hypot(q.x - me.x, q.y - me.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  });
  return best;
}

export function pressUse(world: GameWorld, setHoldActive: (v: boolean) => void): void {
  if (world.phase !== 'play' || world.modal) return;
  const me = world.me;
  if (me.inVent !== null || (me.alive && me.stunnedUntil > world.t)) return;

  if (world.nearSabFix) {
    world.modal = { kind: 'sabotageFix', spot: world.nearSabFix };
    return;
  }
  if (world.nearCctv && me.alive && world.sabotage.active !== 'comms') {
    world.camsInUse = true;
    world.modal = { kind: 'cctv' };
    return;
  }
  if (world.nearRadar && me.alive && world.sabotage.active !== 'comms') {
    world.modal = { kind: 'radar' };
    return;
  }
  if (world.nearTask) {
    if (isInteractiveMiniTask(world.nearTask.spot.type)) {
      world.modal = { kind: 'task', task: world.nearTask };
    } else {
      setHoldActive(true);
    }
    return;
  }
  if (world.nearChain && me.alive && me.chains > 0) {
    me.chains--;
    startMeeting(world, 0, null);
  }
}

export function pressAbility(world: GameWorld): void {
  if (world.phase !== 'play' || world.modal) return;
  const me = world.me;
  if (!me.alive || me.inVent !== null || me.stunnedUntil > world.t) return;

  if (me.role === 'faker' && me.coolSteal <= 0) {
    const v = nearestOther(world, me, 62, (q) => q.role !== 'faker');
    if (v) stealBag(world, me, v);
  } else if (me.role === 'inspector' && me.coolCheck <= 0 && me.uses > 0) {
    const t = nearestOther(world, me, 68);
    if (t) {
      me.known[t.id] = t.role === 'faker';
      me.coolCheck = 18;
      me.uses--;
      soundEngine.sfx('check');
      showToast(
        world,
        `${t.name}-এর টিকেট: ${t.role === 'faker' ? 'ভুয়া টিকেট!' : 'বৈধ টিকেট'} (বাকি ${bn(me.uses)})`
      );
    }
  }
}

export function pressReport(world: GameWorld): void {
  if (world.phase !== 'play' || !world.me.alive || !world.nearBody) return;
  startMeeting(world, 0, world.nearBody);
}

export function toggleVent(world: GameWorld): void {
  const me = world.me;
  if (world.phase !== 'play' || !me.alive || me.role !== 'faker' || me.stunnedUntil > world.t) return;

  if (me.inVent !== null) {
    const vid = me.inVent;
    me.inVent = null;
    world.ventAnim[vid] = 1;
    soundEngine.sfx('vent');
    spawnParticles(world, me.x, me.y - 6, '#94a3b8', 12);
    world.players.forEach((q) => {
      if (q.alive && !q.isMe && q.role !== 'faker' && Math.hypot(q.x - me.x, q.y - me.y) < 180) {
        q.susp[me.id] = (q.susp[me.id] || 0) + 3;
      }
    });
    return;
  }

  if (world.nearVent) {
    me.inVent = world.nearVent.id;
    me.x = world.nearVent.x;
    me.y = world.nearVent.y;
    world.ventAnim[world.nearVent.id] = 1;
    spawnParticles(world, me.x, me.y - 6, '#94a3b8', 12);
    soundEngine.sfx('vent');
  }
}

export function cycleVent(world: GameWorld, dir: 1 | -1): void {
  const me = world.me;
  if (me.inVent === null) return;
  const cur = VENTS[me.inVent];
  if (!cur) return;
  const nextId = dir === 1 ? cur.links[1] : cur.links[0];
  const nextVent = VENTS[nextId];
  if (!nextVent) return;
  me.inVent = nextVent.id;
  me.x = nextVent.x;
  me.y = nextVent.y;
  world.ventAnim[nextVent.id] = 1;
  spawnParticles(world, me.x, me.y - 6, '#94a3b8', 8);
  soundEngine.sfx('vent');
}

export function updateWorld(
  world: GameWorld,
  rawDt: number,
  input: { ix: number; iy: number; useHeld: boolean }
): void {
  const dt = Math.min(0.05, Math.max(0, rawDt));
  world.scroll += dt * 115 * world.trainSpeed;
  world.hitFlash = Math.max(0, world.hitFlash - dt * 2.2);
  world.cam.shake = Math.max(0, world.cam.shake - dt * 1.8);

  if (world.phase === 'meeting' && world.m) {
    const m = world.m;
    m.t -= dt;
    if (m.stage === 'discuss' || m.stage === 'vote') {
      const el = m.stage === 'discuss' ? DISCUSS_TIME - m.t : DISCUSS_TIME + (VOTE_TIME - m.t);
      m.sched.forEach((s) => {
        if (!s.done && el >= s.at) {
          s.done = true;
          const p = world.players[s.pid];
          if (p && p.alive) {
            m.chatLog.push({ id: m.chatLog.length + 1, name: p.name, color: p.color, text: s.text });
            world.players.forEach((q) => {
              if (q !== p && s.text.includes(q.name)) {
                m.mention[q.id] = (m.mention[q.id] || 0) + 1;
              }
            });
          }
        }
      });
    }
    if (m.stage === 'discuss') {
      if (m.t <= 0) beginVote(world);
    } else if (m.stage === 'vote') {
      const ev = VOTE_TIME - m.t;
      world.players.forEach((p) => {
        if (p.alive && !p.isMe && m.votes[p.id] === undefined && ev >= (m.botAt[p.id] || 10)) {
          m.votes[p.id] = botVoteDecision(p, world, m);
        }
      });
      const allVoted = world.players.every((p) => !p.alive || m.votes[p.id] !== undefined);
      if (allVoted || m.t <= 0) showVoteResult(world);
    } else if (m.stage === 'result') {
      if (m.t <= 0) {
        if (m.out) {
          m.stage = 'eject';
          m.t = 6.6;
          m.ejectProgress = 0;
        } else {
          endMeeting(world);
        }
      }
    } else if (m.stage === 'eject') {
      m.ejectProgress = 6.6 - m.t;
      if (m.t <= 0) endMeeting(world);
    }
    return;
  }

  if (world.phase !== 'play') return;

  const me = world.me;
  world.t += dt;
  const doorsLocked = world.sabotage.doorLockedUntil > world.t;

  // Sabotage cooldown & critical brakes timer
  world.sabotage.cooldown = Math.max(0, world.sabotage.cooldown - dt);
  if (world.sabotage.active === 'brakes') {
    world.sabotage.timer -= dt;
    if (world.sabotage.timer <= 0) {
      finishGame(world, 'fakers', 'জরুরি ব্রেক রিসেট না হওয়ায় মেট্রোর নিয়ন্ত্রণ নষ্ট হয়েছে!');
      return;
    }
  }

  // Player cooldowns
  world.players.forEach((p) => {
    p.coolSteal = Math.max(0, p.coolSteal - dt);
    p.coolCheck = Math.max(0, p.coolCheck - dt);
  });

  // Update particles, shockwaves, vent lids & footprints
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.footprints.length - 1; i >= 0; i--) {
    world.footprints[i].alpha -= dt * 0.36;
    if (world.footprints[i].alpha <= 0) world.footprints.splice(i, 1);
  }
  for (let i = world.shockwaves.length - 1; i >= 0; i--) {
    const sw = world.shockwaves[i];
    sw.r += (sw.maxR - sw.r) * Math.min(1, dt * 8.5) + dt * 65;
    sw.alpha -= dt * 1.9;
    if (sw.alpha <= 0 || sw.r >= sw.maxR) world.shockwaves.splice(i, 1);
  }
  for (const vid in world.ventAnim) {
    world.ventAnim[vid] = Math.max(0, world.ventAnim[vid] - dt * 2.4);
  }

  // Local player movement & status effect multiplier
  const myStatus = getPlayerStatus(me, world);
  me.speedMul = myStatus.speedMultiplier;
  me.slowReason = myStatus.slowReason;

  let ix = input.ix;
  let iy = input.iy;
  if (world.modal || me.inVent !== null || myStatus.stunnedLeft > 0) {
    ix = 0;
    iy = 0;
  }
  if (myStatus.stunnedLeft > 0 && Math.random() < dt * 12) {
    world.particles.push({
      x: me.x + rnd(-10, 10),
      y: me.y - rnd(22, 48),
      vx: rnd(-35, 35),
      vy: rnd(-35, 10),
      life: 0.24,
      maxLife: 0.24,
      size: rnd(1.5, 2.8),
      color: Math.random() < 0.5 ? '#38bdf8' : '#f5b73d',
    });
  }
  const m = Math.hypot(ix, iy);
  if (m > 1) {
    ix /= m;
    iy /= m;
  }
  me.moving = m > 0.12;
  if (me.moving) {
    const baseSpeed = me.alive ? 152 : 185;
    const speed = me.alive ? baseSpeed * myStatus.speedMultiplier : baseSpeed;
    if (me.alive) {
      movePlayer(me, ix * speed * dt, iy * speed * dt, doorsLocked);
    } else {
      // Ghosts glide freely through partitions and doors!
      me.x = Math.max(20, Math.min(6480, me.x + ix * speed * dt));
      me.y = Math.max(BENCH, Math.min(CH - BENCH, me.y + iy * speed * dt));
    }
    if (Math.abs(ix) > 0.12) me.face = ix > 0 ? 1 : -1;
    me.ph += dt * (me.alive ? Math.max(0.55, myStatus.speedMultiplier) : 1);
    if (me.alive) {
      soundEngine.playFootstep();
      if (Math.random() < dt * 7.5) {
        const recentSteal = me.role === 'faker' && world.t < me.lungeUntil + 4.5 && me.lungeUntil > 0;
        world.footprints.push({
          x: me.x,
          y: me.y + 1,
          alpha: recentSteal ? 0.92 : 0.72,
          color: me.color,
          angle: Math.atan2(iy, ix),
          suspect: recentSteal,
        });
      }
      if (Math.random() < dt * 9) {
        const pCol =
          myStatus.hasteLeft > 0
            ? 'rgba(67, 192, 122, 0.75)'
            : myStatus.slowMultiplier < 1
            ? 'rgba(245, 183, 61, 0.65)'
            : 'rgba(203, 213, 225, 0.55)';
        world.particles.push({
          x: me.x - ix * 8 + rnd(-4, 4),
          y: me.y + rnd(-2, 2),
          vx: -ix * rnd(12, 26),
          vy: rnd(-12, -2),
          life: 0.3,
          maxLife: 0.3,
          size: rnd(1.4, 2.6),
          color: pCol,
        });
      }
    }
  }

  // Bot updates + track moving footsteps for subtle realism
  const botCallbacks = {
    onFinishTask: (p: Player, idx: number) => completeTask(world, p, idx),
    onSteal: (k: Player, v: Player) => stealBag(world, k, v),
    onStartMeeting: (cid: number, b: StolenBody | null) => startMeeting(world, cid, b),
    onTriggerSabotage: (type: Exclude<SabotageType, null>, byBot?: boolean) =>
      triggerSabotage(world, type, byBot),
    onFixSabotagePart: (id: string, byBot?: boolean) => fixSabotagePart(world, id, byBot),
  };

  for (let pi = 0; pi < world.players.length; pi++) {
    const p = world.players[pi];
    if (!p.isMe) {
      const ox = p.x;
      const oy = p.y;
      updateBot(p, dt, world, botCallbacks);
      if (world.phase !== 'play') return;
      if (p.alive && p.moving && Math.random() < dt * 5.2) {
        const ang = Math.atan2(p.y - oy, p.x - ox);
        const recentSteal = p.role === 'faker' && world.t < p.lungeUntil + 4.5 && p.lungeUntil > 0;
        world.footprints.push({
          x: p.x,
          y: p.y + 1,
          alpha: recentSteal ? 0.9 : 0.65,
          color: p.color,
          angle: ang,
          suspect: recentSteal,
        });
      }
    }
    p.lastCoach = coachOf(p.x);
  }

  // Detect nearest interactive objects for local player
  let nt: PlayerTask | null = null;
  let nd = 52;
  me.tasks.forEach((t) => {
    if (!t.done) {
      const d = Math.hypot(me.x - t.spot.x, me.y - t.spot.y);
      if (d < nd) {
        nd = d;
        nt = t;
      }
    }
  });
  world.nearTask = nt;
  world.nearChain = me.alive && me.chains > 0 && Math.hypot(me.x - CHAIN.x, me.y - CHAIN.y) < 58;
  world.nearCctv = me.alive && Math.hypot(me.x - CCTV_CONSOLE.x, me.y - CCTV_CONSOLE.y) < 52;
  world.nearRadar = me.alive && Math.hypot(me.x - RADAR_CONSOLE.x, me.y - RADAR_CONSOLE.y) < 52;

  world.nearBody = null;
  if (me.alive) {
    for (let i = 0; i < world.bodies.length; i++) {
      if (Math.hypot(world.bodies[i].x - me.x, world.bodies[i].y - me.y) < 88) {
        world.nearBody = world.bodies[i];
        break;
      }
    }
  }

  world.nearVent = null;
  if (me.alive && me.role === 'faker') {
    for (let i = 0; i < VENTS.length; i++) {
      if (Math.hypot(VENTS[i].x - me.x, VENTS[i].y - me.y) < 46) {
        world.nearVent = VENTS[i];
        break;
      }
    }
  }

  world.nearSabFix = null;
  if (me.alive && world.sabotage.active && world.sabotage.active !== 'doors') {
    for (let i = 0; i < SABOTAGE_SPOTS.length; i++) {
      const sb = SABOTAGE_SPOTS[i];
      if (
        sb.type === world.sabotage.active &&
        !world.sabotage.fixedParts[sb.id] &&
        Math.hypot(sb.x - me.x, sb.y - me.y) < 54
      ) {
        world.nearSabFix = sb;
        break;
      }
    }
  }

  // Hold-to-complete tasks (like AC filter, trash chute, tap)
  if (nt && input.useHeld && !world.modal && !isInteractiveMiniTask((nt as PlayerTask).spot.type)) {
    const holdTask = nt as PlayerTask;
    if (world.hold.task !== holdTask) world.hold = { task: holdTask, prog: 0 };
    world.hold.prog += dt * 1000;
    if (Math.random() < dt * 12) {
      const sp = holdTask.spot;
      world.particles.push({
        x: sp.x + rnd(-10, 10),
        y: sp.y + rnd(-8, 8),
        vx: rnd(-24, 24),
        vy: rnd(-35, -8),
        life: 0.35,
        maxLife: 0.35,
        size: rnd(1.5, 3),
        color: sp.type === 'tap' ? '#34d399' : '#cbd5e1',
      });
    }
    if (world.hold.prog >= holdTask.spot.dur) {
      const idx = me.tasks.indexOf(holdTask);
      if (idx >= 0) completeTask(world, me, idx);
      world.hold = { task: null, prog: 0 };
    }
  } else {
    world.hold = { task: null, prog: 0 };
  }

  // Realistic Station Arrival, Braking Sparks, Door Open & Departure Physics
  const stoppedAtStation = world.t < world.stationStopUntil;
  const timeToStation = world.nextStation - world.t;
  const approaching = !stoppedAtStation && timeToStation <= 5.5 && timeToStation > 0;
  const targetSpeed = stoppedAtStation
    ? 0
    : approaching
    ? Math.max(0.06, timeToStation / 5.5)
    : 1;

  world.trainSpeed += (targetSpeed - world.trainSpeed) * Math.min(1, dt * 2.2);
  if (stoppedAtStation && world.trainSpeed < 0.025) world.trainSpeed = 0;

  // Brake sparks under wheels when decelerating strongly
  if (approaching && world.trainSpeed > 0.08 && world.trainSpeed < 0.72 && Math.random() < dt * 14) {
    const sparkX = world.cam.x + rnd(-260, 260);
    world.particles.push({
      x: sparkX,
      y: CH + 14,
      vx: rnd(-120, -40),
      vy: rnd(8, 34),
      life: rnd(0.18, 0.36),
      maxLife: 0.36,
      size: rnd(1.5, 2.8),
      color: '#fbbf24',
    });
  }

  const doorsShouldOpen = stoppedAtStation && world.stationStopUntil - world.t > 0.8;
  const prevOpen = world.stationDoorOpen;
  world.stationDoorOpen += ((doorsShouldOpen ? 1 : 0) - world.stationDoorOpen) * Math.min(1, dt * 4.5);
  if (prevOpen > 0.85 && world.stationDoorOpen <= 0.85) {
    soundEngine.sfx('doorbeep');
  }

  if (!stoppedAtStation && world.t >= world.nextStation) {
    world.stIdx = (world.stIdx + 1) % STATIONS.length;
    world.stationStopUntil = world.t + 4.8;
    world.nextStation += 38;
    soundEngine.sfx('chime');
    soundEngine.sfx('dooropen');
    showToast(world, `স্টেশন: ${STATIONS[world.stIdx]} — দরজা খুলছে`, 3.4);
  }

  // Smooth camera tracking with subtle movement lead
  const tx = me.x + (me.moving ? ix * 38 : 0);
  const ty = CH / 2 + (me.y - CH / 2) * 0.25;
  const k = Math.min(1, dt * 8.5);
  world.cam.x += (tx - world.cam.x) * k;
  world.cam.y += (ty - world.cam.y) * k;
}
