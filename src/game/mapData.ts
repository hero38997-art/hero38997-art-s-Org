import type {
  CameraNode,
  GameWorld,
  HazardZone,
  ObstacleRect,
  Player,
  PlayerStatusSummary,
  SabotageSpot,
  Seat,
  TaskSpot,
  VentNode,
} from './types.ts';

export const CW = 860;
export const CH = 360;
export const GW = 84;
export const N_COACHES = 7;
export const STEP = CW + GW; // 944
export const TW = N_COACHES * CW + (N_COACHES - 1) * GW; // 6524
export const BENCH = 44;

export const COLORS = [
  '#e5484d',
  '#3e8ef7',
  '#2fb36a',
  '#f5b73d',
  '#9b6dff',
  '#ff8a3d',
  '#1fb5b0',
  '#ff6fae',
  '#e6eef8',
  '#64748b',
];

export const SKINS = ['#f1c9a5', '#e0ac7e', '#c68642', '#8d5a33'];

export const ACCN = [
  'ছোট চুল',
  'ক্যাপ',
  'টুপি',
  'লম্বা চুল',
  'হিজাব',
  'খোঁপা',
  'বিনি',
  'চশমা',
];

export const PANTS = ['#262e42', '#333640', '#3f506d', '#4d3b2e'];
export const HAIRS = ['#221814', '#161618', '#36251b', '#473123'];

export const BOT_NAMES = [
  'রাহিম',
  'সুমি',
  'তানভীর',
  'নাদিয়া',
  'রাফি',
  'মিম',
  'শাওন',
  'ফারিয়া',
  'আরিফ',
  'তিশা',
  'জুবায়ের',
  'তাসনিম',
];

export const COACH_NAMES = [
  'ইলেকট্রিক্যাল ও গার্ড',
  'কার্গো ও লাগেজ',
  'কোচ ৪ (সাধারণ)',
  'ক্যান্টিন ও সিকিউরিটি',
  'কোচ ২ (সাধারণ)',
  'কোচ ১ (মহিলা)',
  'চালকের কেবিন',
];

export const COACH_SHORT = [
  'ইলেকট্রিক্যাল',
  'কার্গো কোচ',
  'কোচ ৪',
  'ক্যান্টিন ও সিকিউরিটি',
  'কোচ ২',
  'কোচ ১ (মহিলা)',
  'চালকের কেবিন',
];

export const STATIONS = [
  'উত্তরা উত্তর',
  'উত্তরা সেন্টার',
  'উত্তরা দক্ষিণ',
  'পল্লবী',
  'মিরপুর ১১',
  'মিরপুর ১০',
  'কাজীপাড়া',
  'শেওড়াপাড়া',
  'আগারগাঁও',
  'বিজয় সরণি',
  'ফার্মগেট',
  'কারওয়ান বাজার',
  'শাহবাগ',
  'ঢাকা বিশ্ববিদ্যালয়',
  'বাংলাদেশ সচিবালয়',
  'মতিঝিল',
];

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

export const DISCUSS_TIME = 28;
export const VOTE_TIME = 25;
export const RESULT_TIME = 5;

export const SEG: Array<[number, number]> = [
  [20, 145],
  [225, 325],
  [405, 505],
  [585, 685],
  [765, 845],
];

export const DOORS: Array<[number, number]> = [
  [145, 225],
  [325, 405],
  [505, 585],
  [685, 765],
];

export function bn(n: number | string): string {
  return String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

export function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export function pick<T>(arr: readonly T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function hash(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

export function coachOf(x: number): number {
  return Math.max(0, Math.min(N_COACHES - 1, Math.floor(x / STEP)));
}

// Seats across passenger coaches (Coaches 2, 4, 5 have full passenger benches)
export const SEATS: Seat[] = (() => {
  const list: Seat[] = [];
  for (const c of [2, 3, 4, 5]) {
    for (const side of [0, 1] as const) {
      let idx = 0;
      const segments = side === 1 ? [[40, CW - 40] as [number, number]] : SEG;
      segments.forEach((sg) => {
        const count = Math.max(2, Math.round((sg[1] - sg[0]) / 42));
        const w = (sg[1] - sg[0]) / count;
        for (let k = 0; k < count; k++) {
          idx++;
          list.push({
            coach: c,
            side,
            idx,
            x: c * STEP + sg[0] + w * (k + 0.5),
            x0: c * STEP + sg[0] + w * k,
            w,
          });
        }
      });
    }
  }
  return list;
})();

export function seatLabel(s: Seat): string {
  return `${COACH_SHORT[s.coach]} · সিট ${s.side ? 'খ' : 'ক'}-${bn(s.idx)}`;
}

// Vertical stanchion grab poles
export const POLES: Array<{ x: number; y: number }> = (() => {
  const poles: Array<{ x: number; y: number }> = [];
  for (const c of [2, 4, 5]) {
    for (const px of [245, 430, 615]) {
      for (const dy of [-68, 68]) {
        poles.push({ x: c * STEP + px, y: CH / 2 + dy });
      }
    }
  }
  return poles;
})();

// Internal realistic furniture / partitions that collide and cast shadows
export const OBSTACLES: ObstacleRect[] = [
  // Coach 0: Electrical & Guard
  { x: 0 * STEP + 56, y: BENCH + 12, w: 124, h: 66, kind: 'generator', blocksVision: true, label: 'জেনারেটর' },
  { x: 0 * STEP + 540, y: BENCH, w: 22, h: 86, kind: 'partition', blocksVision: true },
  { x: 0 * STEP + 540, y: CH - BENCH - 86, w: 22, h: 86, kind: 'partition', blocksVision: true },

  // Coach 1: Cargo & Luggage
  { x: 1 * STEP + 175, y: 108, w: 165, h: 36, kind: 'rack', blocksVision: true, label: 'লাগেজ র‍্যাক ক' },
  { x: 1 * STEP + 505, y: 216, w: 165, h: 36, kind: 'rack', blocksVision: true, label: 'লাগেজ র‍্যাক খ' },
  { x: 1 * STEP + 365, y: BENCH + 8, w: 96, h: 32, kind: 'rack', blocksVision: false },

  // Coach 2: Passenger Coach 4 partitions
  { x: 2 * STEP + 360, y: BENCH, w: 16, h: 68, kind: 'partition', blocksVision: true },
  { x: 2 * STEP + 500, y: CH - BENCH - 68, w: 16, h: 68, kind: 'partition', blocksVision: true },

  // Coach 3: Canteen & Security
  { x: 3 * STEP + 100, y: BENCH + 14, w: 185, h: 50, kind: 'counter', blocksVision: true, label: 'ক্যান্টিন' },
  { x: 3 * STEP + 560, y: BENCH + 14, w: 155, h: 48, kind: 'console', blocksVision: true, label: 'সিকিউরিটি' },

  // Coach 4: Passenger Coach 2 partitions
  { x: 4 * STEP + 310, y: CH - BENCH - 68, w: 16, h: 68, kind: 'partition', blocksVision: true },
  { x: 4 * STEP + 540, y: BENCH, w: 16, h: 68, kind: 'partition', blocksVision: true },

  // Coach 5: Ladies Coach divider
  { x: 5 * STEP + 290, y: BENCH, w: 16, h: 72, kind: 'partition', blocksVision: true },

  // Coach 6: Driver Cockpit
  { x: 6 * STEP + 310, y: BENCH + 16, w: 135, h: 52, kind: 'console', blocksVision: false, label: 'কোচ রাডার' },
  { x: 6 * STEP + 695, y: 112, w: 85, h: 136, kind: 'console', blocksVision: true, label: 'ড্রাইভার ডেক' },
];

// Emergency Chain in Canteen/Security central plaza
export const CHAIN = { x: 3 * STEP + CW / 2, y: CH / 2 };

// Interactive Security & Radar Consoles
export const CCTV_CONSOLE = { x: 3 * STEP + 635, y: BENCH + 84 };
export const RADAR_CONSOLE = { x: 6 * STEP + 378, y: BENCH + 88 };

// 6 Interconnected Vents for Thieves
export const VENTS: VentNode[] = [
  { id: 0, coach: 0, x: 0 * STEP + 665, y: BENCH + 24, links: [1, 5] },
  { id: 1, coach: 1, x: 1 * STEP + 115, y: CH - BENCH - 24, links: [0, 2] },
  { id: 2, coach: 2, x: 2 * STEP + 430, y: BENCH + 24, links: [1, 3] },
  { id: 3, coach: 3, x: 3 * STEP + 775, y: CH - BENCH - 24, links: [2, 4] },
  { id: 4, coach: 5, x: 5 * STEP + 150, y: BENCH + 24, links: [3, 5] },
  { id: 5, coach: 6, x: 6 * STEP + 210, y: CH - BENCH - 24, links: [4, 0] },
];

// 4 Live CCTV Cameras watching key areas
export const CAMERAS: CameraNode[] = [
  { id: 0, coach: 0, name: 'ক্যাম ১ · ইলেকট্রিক্যাল', x: 0 * STEP + 460, y: BENCH + 8, viewX: 0 * STEP + 450, viewY: CH / 2 },
  { id: 1, coach: 1, name: 'ক্যাম ২ · কার্গো', x: 1 * STEP + 420, y: BENCH + 8, viewX: 1 * STEP + 420, viewY: CH / 2 },
  { id: 2, coach: 2, name: 'ক্যাম ৩ · কোচ ৪', x: 2 * STEP + 430, y: BENCH + 8, viewX: 2 * STEP + 430, viewY: CH / 2 },
  { id: 3, coach: 5, name: 'ক্যাম ৪ · কোচ ১ (মহিলা)', x: 5 * STEP + 560, y: BENCH + 8, viewX: 5 * STEP + 560, viewY: CH / 2 },
];

// Sabotage Fix Consoles
export const SABOTAGE_SPOTS: SabotageSpot[] = [
  { id: 'lights', type: 'lights', coach: 0, label: 'মেইন লাইট ব্রেকার ঠিক করো', x: 0 * STEP + 740, y: BENCH + 22 },
  { id: 'comms', type: 'comms', coach: 3, label: 'কমিউনিকেশন রাউটার রিসেট করো', x: 3 * STEP + 745, y: BENCH + 28 },
  { id: 'brake_rear', type: 'brakes', coach: 0, label: 'রিয়ার ব্রেক ভালভ রিসেট করো', x: 0 * STEP + 100, y: CH - BENCH - 22 },
  { id: 'brake_front', type: 'brakes', coach: 6, label: 'ফ্রন্ট ব্রেক ভালভ রিসেট করো', x: 6 * STEP + 640, y: CH / 2 },
];

// Strategic Environmental Hazard Zones (slow movement areas visible on floor)
export const HAZARD_ZONES: HazardZone[] = [
  {
    id: 'cargo_slick',
    coach: 1,
    label: 'কার্গো তেল জোন',
    kind: 'oil',
    x: 1 * STEP + 348,
    y: 148,
    w: 152,
    h: 116,
    multiplier: 0.65,
  },
  {
    id: 'canteen_spill',
    coach: 3,
    label: 'পিচ্ছিল ক্যান্টিন মেঝে',
    kind: 'wet',
    x: 3 * STEP + 132,
    y: 174,
    w: 132,
    h: 78,
    multiplier: 0.72,
  },
];

export function getHazardAt(x: number, y: number): HazardZone | null {
  for (let i = 0; i < HAZARD_ZONES.length; i++) {
    const z = HAZARD_ZONES[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      return z;
    }
  }
  return null;
}

export function getPlayerStatus(
  p: Pick<Player, 'x' | 'y' | 'alive' | 'inVent' | 'role' | 'stunnedUntil' | 'hasteUntil'>,
  world: Pick<GameWorld, 't' | 'sabotage'>
): PlayerStatusSummary {
  const stunnedLeft = p.alive ? Math.max(0, (p.stunnedUntil || 0) - world.t) : 0;
  const hasteLeft = p.alive ? Math.max(0, (p.hasteUntil || 0) - world.t) : 0;
  const visionReduced = p.alive && p.role !== 'faker' && world.sabotage.active === 'lights';

  let slowMultiplier = 1;
  let slowReason: string | null = null;

  if (p.alive && p.inVent === null) {
    const hz = getHazardAt(p.x, p.y);
    if (hz) {
      slowMultiplier = hz.multiplier;
      slowReason = hz.label;
    }
    if (world.sabotage.active === 'brakes' && 0.72 < slowMultiplier) {
      slowMultiplier = 0.72;
      slowReason = 'ব্রেক ঝাঁকুনি';
    } else if (world.sabotage.active === 'brakes' && !slowReason) {
      slowMultiplier = 0.72;
      slowReason = 'ব্রেক ঝাঁকুনি';
    }
  }

  const hasteMul = hasteLeft > 0 ? 1.22 : 1;
  const speedMultiplier = stunnedLeft > 0 ? 0 : slowMultiplier * hasteMul;

  return {
    stunnedLeft,
    hasteLeft,
    slowMultiplier,
    slowReason,
    visionReduced,
    speedMultiplier,
  };
}

export function clampOutOfGangway(p: { x: number; y: number }): boolean {
  const coachIdx = Math.floor(p.x / STEP);
  const offset = p.x - coachIdx * STEP;
  if (coachIdx >= 0 && coachIdx < N_COACHES - 1 && offset > CW - 6) {
    p.x = offset < CW + GW / 2 ? coachIdx * STEP + CW - 16 : (coachIdx + 1) * STEP + 16;
    p.y = CH / 2;
    return true;
  }
  return false;
}

export const SPOTS: TaskSpot[] = [
  // Coach 0: Electrical & Guard
  { id: 0, coach: 0, type: 'wires', label: '৫-তারের সার্কিট জোড়া দাও', x: 0 * STEP + 310, y: BENCH + 20, dur: 5200, hard: true },
  { id: 1, coach: 0, type: 'lights', label: 'পাওয়ার সুইচ ব্যালেন্স করো', x: 0 * STEP + 640, y: CH - BENCH - 20, dur: 4500, hard: true },

  // Coach 1: Cargo & Luggage
  { id: 2, coach: 1, type: 'luggage', label: 'কার্গো ওজন ব্যালেন্স করো', x: 1 * STEP + 260, y: 162, dur: 5500, hard: true },
  { id: 3, coach: 1, type: 'trash', label: 'বর্জ্য চুট খালি করো', x: 1 * STEP + 760, y: CH - BENCH - 22, dur: 2400, visual: true },
  { id: 4, coach: 1, type: 'ac', label: 'এসি ডাক্ট পরিষ্কার করো', x: 1 * STEP + 440, y: BENCH + 56, dur: 2600 },

  // Coach 2: Coach 4
  { id: 5, coach: 2, type: 'swipe', label: 'এমআরটি কার্ড সোয়াইপ করো', x: 2 * STEP + 190, y: BENCH + 18, dur: 3500 },
  { id: 6, coach: 2, type: 'wipe', label: 'মেট্রো জানালা পরিষ্কার করো', x: 2 * STEP + 640, y: CH - BENCH - 18, dur: 3800 },
  { id: 7, coach: 2, type: 'tap', label: 'স্মার্ট কার্ড ট্যাপ করো', x: 2 * STEP + 430, y: CH - BENCH - 18, dur: 2000 },

  // Coach 3: Canteen & Security
  { id: 8, coach: 3, type: 'canteen', label: 'ক্যান্টিন অর্ডার সম্পন্ন করো', x: 3 * STEP + 190, y: BENCH + 84, dur: 3800 },
  { id: 9, coach: 3, type: 'signal', label: 'মেমোরি সিগন্যাল ম্যাট্রিক্স', x: 3 * STEP + 430, y: CH - BENCH - 20, dur: 6000, hard: true },

  // Coach 4: Coach 2
  { id: 10, coach: 4, type: 'code', label: 'রোটেটিং সিকিউরিটি পিন দাও', x: 4 * STEP + 170, y: BENCH + 18, dur: 4500, hard: true },
  { id: 11, coach: 4, type: 'clean', label: 'সিটের ময়লা পরিষ্কার করো', x: 4 * STEP + 670, y: CH - BENCH - 18, dur: 3500 },
  { id: 12, coach: 4, type: 'wires', label: 'দরজার ৫-তারের সার্কিট জোড়া', x: 4 * STEP + 430, y: BENCH + 18, dur: 5200, hard: true },

  // Coach 5: Ladies Coach (Visual Med/Ticket Scan!)
  { id: 13, coach: 5, type: 'scan', label: 'টিকেট ও হেলথ স্ক্যান করো', x: 5 * STEP + 660, y: CH / 2 + 64, dur: 4000, visual: true },
  { id: 14, coach: 5, type: 'tap', label: 'প্রায়োরিটি গেট ট্যাপ করো', x: 5 * STEP + 185, y: CH - BENCH - 18, dur: 2000 },
  { id: 15, coach: 5, type: 'wipe', label: 'মহিলা কোচের জানালা মুছো', x: 5 * STEP + 460, y: BENCH + 18, dur: 3800 },

  // Coach 6: Driver Cockpit
  { id: 16, coach: 6, type: 'throttle', label: '৩-রিং ব্রেক প্রেশার সিঙ্ক করো', x: 6 * STEP + 655, y: CH / 2 - 64, dur: 5500, hard: true },
  { id: 17, coach: 6, type: 'signal', label: 'রুট রিঅ্যাক্টর প্যাটার্ন মেলাও', x: 6 * STEP + 190, y: BENCH + 20, dur: 6000, hard: true },
];

export function isFloor(px: number, py: number, doorsLocked: boolean): boolean {
  for (let i = 0; i < N_COACHES; i++) {
    const x0 = i * STEP;
    const maxX = i === N_COACHES - 1 ? x0 + CW - 44 : x0 + CW;
    if (px >= x0 + 6 && px <= maxX - 6 && py >= BENCH + 2 && py <= CH - BENCH - 2) {
      return true;
    }
    if (!doorsLocked && i < N_COACHES - 1) {
      if (px >= x0 + CW - 8 && px <= x0 + STEP + 8 && py >= CH / 2 - 34 && py <= CH / 2 + 34) {
        return true;
      }
    }
  }
  return false;
}

export function canWalk(x: number, y: number, doorsLocked: boolean): boolean {
  const r = 10;
  for (let a = 0; a < 8; a++) {
    const px = x + Math.cos(a * 0.785398) * r;
    const py = y + Math.sin(a * 0.785398) * r * 0.72;
    if (!isFloor(px, py, doorsLocked)) return false;
  }
  for (let i = 0; i < POLES.length; i++) {
    const dx = x - POLES[i].x;
    const dy = y - POLES[i].y;
    if (dx * dx + dy * dy < 210) return false;
  }
  for (let i = 0; i < OBSTACLES.length; i++) {
    const o = OBSTACLES[i];
    if (x + 10 > o.x && x - 10 < o.x + o.w && y + 7 > o.y && y - 7 < o.y + o.h) {
      return false;
    }
  }
  return true;
}

export function movePlayer(p: { x: number; y: number }, dx: number, dy: number, doorsLocked: boolean): void {
  if (canWalk(p.x + dx, p.y, doorsLocked)) p.x += dx;
  if (canWalk(p.x, p.y + dy, doorsLocked)) p.y += dy;
}

// Segments that block 2D line-of-sight lighting
export interface VisionSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const STATIC_OCCLUDERS: VisionSegment[] = (() => {
  const segs: VisionSegment[] = [];
  // Coach bulkheads (top and bottom halves leaving gangway open)
  for (let i = 0; i < N_COACHES; i++) {
    const x0 = i * STEP;
    const x1 = x0 + CW;
    // Left wall of coach i
    if (i > 0) {
      segs.push({ x1: x0, y1: 0, x2: x0, y2: CH / 2 - 36 });
      segs.push({ x1: x0, y1: CH / 2 + 36, x2: x0, y2: CH });
    } else {
      segs.push({ x1: x0, y1: 0, x2: x0, y2: CH });
    }
    // Right wall of coach i
    if (i < N_COACHES - 1) {
      segs.push({ x1: x1, y1: 0, x2: x1, y2: CH / 2 - 36 });
      segs.push({ x1: x1, y1: CH / 2 + 36, x2: x1, y2: CH });
    } else {
      segs.push({ x1: x1, y1: 0, x2: x1, y2: CH });
    }
    // Outer top/bottom walls
    segs.push({ x1: x0, y1: BENCH, x2: x1, y2: BENCH });
    segs.push({ x1: x0, y1: CH - BENCH, x2: x1, y2: CH - BENCH });
  }
  // Vision-blocking obstacles
  OBSTACLES.forEach((o) => {
    if (!o.blocksVision) return;
    segs.push({ x1: o.x, y1: o.y, x2: o.x + o.w, y2: o.y });
    segs.push({ x1: o.x + o.w, y1: o.y, x2: o.x + o.w, y2: o.y + o.h });
    segs.push({ x1: o.x + o.w, y1: o.y + o.h, x2: o.x, y2: o.y + o.h });
    segs.push({ x1: o.x, y1: o.y + o.h, x2: o.x, y2: o.y });
  });
  return segs;
})();

export function getActiveOccluders(doorsLocked: boolean): VisionSegment[] {
  if (!doorsLocked) return STATIC_OCCLUDERS;
  const segs = STATIC_OCCLUDERS.slice();
  for (let i = 0; i < N_COACHES - 1; i++) {
    const gx = i * STEP + CW + GW / 2;
    segs.push({ x1: gx, y1: CH / 2 - 38, x2: gx, y2: CH / 2 + 38 });
  }
  return segs;
}
