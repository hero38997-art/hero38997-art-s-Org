import {
  BENCH,
  CAMERAS,
  CCTV_CONSOLE,
  CH,
  CHAIN,
  COACH_NAMES,
  CW,
  DOORS,
  GW,
  HAZARD_ZONES,
  N_COACHES,
  OBSTACLES,
  POLES,
  RADAR_CONSOLE,
  SABOTAGE_SPOTS,
  SEG,
  SPOTS,
  STATIONS,
  STEP,
  VENTS,
  VisionSegment,
  getActiveOccluders,
  getPlayerStatus,
  hash,
  shade,
} from './mapData';
import { GameWorld, Player } from './types';

export function rr(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}

export interface DrawCharOpts {
  s?: number;
  face?: 1 | -1;
  ph?: number;
  idleT?: number;
  moving?: boolean;
  acc: number;
  color: string;
  skin: string;
  pants?: string;
  hair?: string;
  ghost?: boolean;
  alpha?: number;
  scanning?: boolean;
  scanT?: number;
  hasBag?: boolean;
  seed?: number;
  lunge?: number;
  stunned?: boolean;
  slowed?: boolean;
  hasted?: boolean;
}

export function drawChar(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  o: DrawCharOpts
): void {
  const s = o.s || 1;
  const face = o.face || 1;
  const ph = o.ph || 0;
  const idleT = o.idleT ?? ph;
  const mv = !!o.moving;
  const seed = o.seed ?? 1;
  const hasBag = o.hasBag !== undefined ? o.hasBag : !o.ghost;
  const lunge = Math.max(0, Math.min(1, o.lunge || 0));

  // Smooth walk cycle, idle breathing, & subtle squash-and-stretch
  const stride = mv ? Math.sin(ph * 12) : 0;
  const secSway = mv ? Math.sin(ph * 12 - 0.85) * 2.2 : Math.sin(idleT * 2.2 + seed) * 0.5;
  const bounce = mv ? Math.abs(Math.cos(ph * 12)) * 2.6 : Math.sin(idleT * 2.4 + seed) * 0.85;
  const lean = (mv ? 0.085 : 0) + lunge * 0.28;
  const sx = mv ? 1 + Math.sin(ph * 24) * 0.025 : 1;
  const sy = mv ? 1 - Math.sin(ph * 24) * 0.025 : 1;

  // Natural blinking every ~3.8s
  const blinkCycle = (idleT * 0.8 + seed * 1.37) % 3.8;
  const isBlinking = blinkCycle > 3.66;

  const acc = o.acc;
  const col = o.color;
  const dk = shade(col, -36);
  const lt = shade(col, 32);
  const skin = o.skin;
  const skd = shade(skin, -26);
  const pants = o.pants || '#283145';
  const pd = shade(pants, -20);
  const hair = o.hair || '#211815';
  const outline = '#111827';
  const modest = acc === 4 || acc === 6;

  c.save();
  const stunJitter = o.stunned ? Math.sin(idleT * 56 + seed) * 1.9 : 0;
  c.translate(x + face * lunge * 12 + stunJitter, y);
  c.scale(s * sx, s * sy);
  c.globalAlpha = o.alpha == null ? 1 : o.alpha;

  // Ground soft contact shadow or ghost floating aura
  if (!o.ghost) {
    c.fillStyle = 'rgba(0, 0, 0, 0.38)';
    c.beginPath();
    c.ellipse(0, 1.5, mv ? 13.5 : 14.5, 4.8, 0, 0, Math.PI * 2);
    c.fill();

    // Underfoot status aura ring
    if (o.stunned) {
      c.save();
      c.strokeStyle = Math.sin(idleT * 18) > 0 ? '#38bdf8' : '#f5b73d';
      c.lineWidth = 1.8;
      c.setLineDash([4, 3]);
      c.lineDashOffset = -idleT * 24;
      c.beginPath();
      c.ellipse(0, 1.5, 17, 6.2, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    } else if (o.hasted) {
      c.strokeStyle = 'rgba(52, 211, 153, 0.75)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(0, 1.5, 16 + Math.sin(idleT * 8) * 1.2, 5.8, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (o.slowed) {
      c.strokeStyle = 'rgba(245, 183, 61, 0.65)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(0, 1.5, 16.5, 5.8, 0, 0, Math.PI * 2);
      c.stroke();
    }
  } else {
    // Spectral orbiting glow wisps
    for (let w = 0; w < 3; w++) {
      const a = idleT * 2.4 + w * 2.1 + seed;
      const wx = Math.cos(a) * 14;
      const wy = -28 + Math.sin(a * 1.4) * 10;
      c.fillStyle = 'rgba(148, 197, 255, 0.35)';
      c.beginPath();
      c.arc(wx, wy, 3.2 - w * 0.5, 0, Math.PI * 2);
      c.fill();
    }
    c.translate(0, -10 - Math.sin(idleT * 3 + seed) * 3);
  }

  c.scale(face, 1);
  c.rotate(lean);

  const drawLeg = (px: number, ang: number, isFront: boolean) => {
    c.save();
    c.translate(px, -21);
    c.rotate(ang);
    // Leg trouser
    c.fillStyle = isFront ? pants : pd;
    c.strokeStyle = outline;
    c.lineWidth = 1.4;
    rr(c, -4.4, -2, 8.8, 17, 4);
    c.fill();
    c.stroke();

    // Sneaker / shoe
    c.translate(0, 16);
    c.fillStyle = isFront ? '#f8fafc' : '#cbd5e1';
    rr(c, -4.6, -1.5, 11.5, 5.2, 2.5);
    c.fill();
    c.stroke();
    // Shoe accent stripe & sole
    c.fillStyle = isFront ? '#1e293b' : '#0f172a';
    c.fillRect(-4.2, 2.2, 10.6, 1.8);
    c.restore();
  };

  const drawArm = (px: number, ang: number, isFront: boolean) => {
    c.save();
    c.translate(px, -42 - bounce * 0.6);
    c.rotate(ang);
    const sleeveLen = modest ? 16 : 9;
    // Forearm skin
    c.fillStyle = isFront ? skin : skd;
    c.strokeStyle = outline;
    c.lineWidth = 1.3;
    rr(c, -3.2, 0, 6.4, 17, 3.2);
    c.fill();
    c.stroke();
    // Sleeve
    c.fillStyle = isFront ? col : dk;
    rr(c, -3.6, -1.5, 7.2, sleeveLen, 3.4);
    c.fill();
    c.stroke();
    // Hand fist
    c.fillStyle = isFront ? skin : skd;
    c.beginPath();
    c.arc(0, 16.5, 3.1, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
  };

  const legBack = -stride * 0.56;
  const legFront = stride * 0.56;
  const armBack = stride * 0.58 + (mv ? 0 : 0.06) + lunge * 0.5;
  const armFront = -stride * 0.58 + (mv ? 0 : -0.06) - lunge * 1.35;

  // Back arm & back leg
  drawArm(-4.5, armBack, false);
  drawLeg(-2.5, legBack, false);

  // Backpack / Metro Bag (worn on back — secondary vertical lag!)
  if (hasBag) {
    c.save();
    c.translate(-8.5, -36 - bounce * 0.45 + secSway * 0.35);
    c.rotate(secSway * 0.025);
    c.fillStyle = '#334155';
    c.strokeStyle = outline;
    c.lineWidth = 1.4;
    rr(c, -6, -8, 10, 20, 4);
    c.fill();
    c.stroke();
    // Flap & accent strap
    c.fillStyle = '#475569';
    rr(c, -5.5, -7.5, 9, 7, 3);
    c.fill();
    c.fillStyle = col;
    c.fillRect(-5, 2, 8, 2.5);
    c.restore();
  }

  // Front leg
  drawLeg(2.2, legFront, true);

  // Torso (Jacket / Kurta)
  c.save();
  c.translate(0, -bounce * 0.6);
  c.strokeStyle = outline;
  c.lineWidth = 1.5;

  if (acc === 4) {
    // Modest tunic/coat
    c.fillStyle = col;
    rr(c, -9.5, -45, 19, 31, 6.5);
    c.fill();
    c.stroke();
    // Cel highlight
    c.fillStyle = lt;
    c.globalAlpha *= 0.35;
    rr(c, -5, -43, 6, 26, 3);
    c.fill();
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    // Waist belt detail
    c.fillStyle = dk;
    c.fillRect(-8.5, -24, 17, 2.5);
  } else {
    // Stylish modern jacket / hoodie
    c.fillStyle = pants;
    rr(c, -8.5, -26, 17, 7.5, 3);
    c.fill();
    c.stroke();

    c.fillStyle = col;
    rr(c, -9.5, -45, 19, 22, 6.5);
    c.fill();
    c.stroke();

    // Jacket front highlight & zipper line
    c.fillStyle = lt;
    c.globalAlpha *= 0.32;
    rr(c, -6, -43, 7, 17, 3);
    c.fill();
    c.globalAlpha = o.alpha == null ? 1 : o.alpha;

    c.strokeStyle = dk;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(2.5, -44);
    c.lineTo(2.5, -24);
    c.stroke();

    // Collar trim
    c.fillStyle = dk;
    rr(c, -7, -45.5, 14, 4, 2);
    c.fill();
  }

  // Neck
  c.fillStyle = skd;
  c.strokeStyle = outline;
  c.lineWidth = 1.2;
  rr(c, -3, -49, 6, 5.5, 2);
  c.fill();

  // Head
  const hY = -58;
  const hx = 1.2;
  c.save();
  c.translate(hx, hY);

  // Long hair back layer with secondary sway
  if (acc === 3) {
    c.save();
    c.rotate(secSway * 0.035);
    c.fillStyle = hair;
    c.strokeStyle = outline;
    c.lineWidth = 1.4;
    rr(c, -11.5, -10.5, 22, 30, 8);
    c.fill();
    c.stroke();
    c.restore();
  }

  // Hijab outer drape with gentle sway
  if (acc === 4) {
    c.fillStyle = shade(col, 42);
    c.strokeStyle = outline;
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(0, 0.5, 11.8, 12.2, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.save();
    c.rotate(secSway * 0.02);
    rr(c, -11.8, 2, 23.6, 17, 8.5);
    c.fill();
    c.stroke();
    c.restore();
    // Inner face-framing shadow fold
    c.fillStyle = shade(col, -12);
    c.beginPath();
    c.ellipse(0.8, 0.8, 9.2, 9.6, 0, 0, Math.PI * 2);
    c.fill();
  }

  // Ear (when not hijab)
  if (acc !== 4) {
    c.fillStyle = skd;
    c.strokeStyle = outline;
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(-9.2, 1.5, 2.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  // Face / Head shape
  const fw = acc === 4 ? 7.8 : 9.4;
  const fh = acc === 4 ? 8.6 : 9.8;
  c.fillStyle = skin;
  c.strokeStyle = outline;
  c.lineWidth = 1.4;
  c.beginPath();
  c.ellipse(0.5, 0, fw, fh, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();

  // Soft cheek tint
  c.fillStyle = 'rgba(244, 114, 114, 0.22)';
  c.beginPath();
  c.ellipse(-3.5, 3.2, 2.4, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(5.5, 3.2, 2.4, 1.4, 0, 0, Math.PI * 2);
  c.fill();

  // Expressive Eyes (blink + subtle alert pupil glance)
  const eyeY = -0.6;
  const glanceX = mv ? 0.65 : Math.sin(idleT * 1.25 + seed * 2.1) * 0.65;
  const eyePositions = [-2.2, 4.4];
  eyePositions.forEach((ex) => {
    if (isBlinking) {
      c.strokeStyle = '#1f2937';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ex - 2, eyeY);
      c.lineTo(ex + 2, eyeY);
      c.stroke();
    } else {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.ellipse(ex, eyeY, 2.2, 2.8, 0, 0, Math.PI * 2);
      c.fill();
      // Iris & pupil
      c.fillStyle = '#111827';
      c.beginPath();
      c.arc(ex + glanceX, eyeY + 0.1, 1.4, 0, Math.PI * 2);
      c.fill();
      // Crisp eye sparkle
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(ex + glanceX + 0.35, eyeY - 0.8, 0.55, 0, Math.PI * 2);
      c.fill();
    }
    // Eyebrow
    c.strokeStyle = hair;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(ex - 2.2, eyeY - 4);
    c.lineTo(ex + 2.2, eyeY - 4.3);
    c.stroke();
  });

  // Subtle nose & friendly mouth
  c.strokeStyle = shade(skin, -45);
  c.lineWidth = 1.1;
  c.beginPath();
  c.moveTo(1.5, 0.8);
  c.lineTo(2.4, 2.6);
  c.lineTo(1.0, 2.9);
  c.stroke();

  c.strokeStyle = '#7c2d26';
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(1.2, 4.3, 2.2, 0.25, 2.85);
  c.stroke();

  // Hair & Headwear Accessories
  const drawBaseHair = () => {
    c.fillStyle = hair;
    c.strokeStyle = outline;
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(0.3, -1.6, 9.8, Math.PI * 0.94, Math.PI * 2.06);
    c.quadraticCurveTo(5.5, -5, 1, -4.5);
    c.quadraticCurveTo(-4, -4.5, -9.2, -1.2);
    c.closePath();
    c.fill();
    c.stroke();
    // Sideburn
    rr(c, -9.6, -2.5, 2.8, 6.8, 1.2);
    c.fill();
    // Hair specular shine
    c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(0, -2, 7.2, Math.PI * 1.15, Math.PI * 1.75);
    c.stroke();
  };

  if (acc === 0 || acc === 3 || acc === 5 || acc === 7) {
    drawBaseHair();
  }
  if (acc === 3) {
    // Side locks framing face
    c.fillStyle = hair;
    c.strokeStyle = outline;
    c.lineWidth = 1.2;
    rr(c, -10.5, -2, 3.4, 16, 1.5);
    c.fill();
    c.stroke();
  }
  if (acc === 5) {
    // Hair bun
    c.fillStyle = hair;
    c.strokeStyle = outline;
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(-3.5, -12, 4.6, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  if (acc === 1) {
    // Metro / Baseball Cap
    drawBaseHair();
    c.fillStyle = '#1e293b';
    c.strokeStyle = outline;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(0.2, -2, 10.2, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    c.stroke();
    // Visor brim
    c.fillStyle = '#0f172a';
    rr(c, -1, -4.8, 13.5, 3.6, 1.8);
    c.fill();
    c.stroke();
    // Gold badge dot
    c.fillStyle = '#f5b73d';
    c.beginPath();
    c.arc(5, -7, 1.6, 0, Math.PI * 2);
    c.fill();
  }
  if (acc === 2) {
    // Embroidered white Tupi
    drawBaseHair();
    c.fillStyle = '#f8fafc';
    c.strokeStyle = outline;
    c.lineWidth = 1.3;
    c.beginPath();
    c.ellipse(0.2, -6.5, 8.8, 4.8, 0, Math.PI, Math.PI * 2);
    c.lineTo(8.8, -4.5);
    c.quadraticCurveTo(0.2, -3.5, -8.5, -4.5);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = '#cbd5e1';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-6.5, -6);
    c.lineTo(6.8, -6);
    c.stroke();
  }
  if (acc === 6) {
    // Cozy Beanie with pom-pom
    c.fillStyle = '#d97706';
    c.strokeStyle = outline;
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(0.2, -2, 10.3, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#b45309';
    rr(c, -10.2, -5.5, 20.8, 4.4, 2.2);
    c.fill();
    c.stroke();
    c.fillStyle = '#fef3c7';
    c.beginPath();
    c.arc(-0.5, -13.5, 3.4, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }
  if (acc === 7) {
    // Glasses with subtle reflection
    c.strokeStyle = '#0f172a';
    c.lineWidth = 1.4;
    eyePositions.forEach((ex) => {
      c.fillStyle = 'rgba(186, 230, 253, 0.25)';
      rr(c, ex - 3.1, eyeY - 3.2, 6.2, 5.8, 2);
      c.fill();
      c.stroke();
    });
    c.beginPath();
    c.moveTo(0.9, eyeY - 0.5);
    c.lineTo(1.3, eyeY - 0.5);
    c.stroke();
  }

  c.restore(); // end head
  c.restore(); // end torso/bounce

  // Front arm
  drawArm(4.2, armFront, true);

  // Visual Scan Laser Beam!
  if (o.scanning) {
    c.scale(face, 1);
    const scanY = -72 + ((Math.sin((o.scanT || 0) * 5.2) + 1) * 0.5) * 70;
    c.strokeStyle = '#34d399';
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-17, scanY);
    c.lineTo(17, scanY);
    c.stroke();
    c.fillStyle = 'rgba(52, 211, 153, 0.18)';
    c.fillRect(-16, -72, 32, 74);
  }

  // Active status visuals directly on character
  if (!o.ghost && o.stunned) {
    for (let k = 0; k < 2; k++) {
      const ay = -58 + k * 24 + Math.sin(idleT * 14 + k * 2.3) * 4;
      const dir = k === 0 ? 1 : -1;
      c.strokeStyle = k === 0 ? '#38bdf8' : '#f5b73d';
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(-14 * dir, ay - 3);
      c.lineTo(-6 * dir, ay + 2);
      c.lineTo(4 * dir, ay - 3);
      c.lineTo(14 * dir, ay + 2);
      c.stroke();
    }
  } else if (!o.ghost && o.hasted && mv) {
    c.strokeStyle = 'rgba(52, 211, 153, 0.72)';
    c.lineWidth = 1.6;
    [-50, -34, -18].forEach((sy, idx) => {
      const len = 8 + ((idleT * 28 + idx * 5) % 8);
      c.beginPath();
      c.moveTo(-12, sy);
      c.lineTo(-12 - len, sy);
      c.stroke();
    });
  } else if (!o.ghost && o.slowed && mv) {
    c.strokeStyle = 'rgba(245, 183, 61, 0.6)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(0, -6, 12, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }

  c.restore();
}

function rayIntersection(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  seg: VisionSegment
): number | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-7) return null;
  const qpx = seg.x1 - ox;
  const qpy = seg.y1 - oy;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;
  if (t >= 0 && u >= -0.001 && u <= 1.001) return t;
  return null;
}

export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  radius: number,
  occluders: VisionSegment[]
): Array<{ x: number; y: number }> {
  const nearby: VisionSegment[] = [];
  const rPad = radius + 40;
  for (let i = 0; i < occluders.length; i++) {
    const s = occluders[i];
    if (
      Math.max(s.x1, s.x2) < ox - rPad ||
      Math.min(s.x1, s.x2) > ox + rPad ||
      Math.max(s.y1, s.y2) < oy - rPad ||
      Math.min(s.y1, s.y2) > oy + rPad
    ) {
      continue;
    }
    nearby.push(s);
  }

  const angles: number[] = [];
  const baseSteps = 64;
  for (let i = 0; i < baseSteps; i++) {
    angles.push((i / baseSteps) * Math.PI * 2);
  }
  for (let i = 0; i < nearby.length; i++) {
    const s = nearby[i];
    const a1 = Math.atan2(s.y1 - oy, s.x1 - ox);
    const a2 = Math.atan2(s.y2 - oy, s.x2 - ox);
    angles.push(a1 - 0.0006, a1, a1 + 0.0006);
    angles.push(a2 - 0.0006, a2, a2 + 0.0006);
  }
  angles.sort((a, b) => a - b);

  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < angles.length; i++) {
    const ang = angles[i];
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    let minT = radius;
    for (let j = 0; j < nearby.length; j++) {
      const t = rayIntersection(ox, oy, dx, dy, nearby[j]);
      if (t !== null && t < minT) minT = t;
    }
    pts.push({ x: ox + dx * minT, y: oy + dy * minT });
  }
  return pts;
}

export function canSeePoint(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  radius: number,
  occluders: VisionSegment[]
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > radius) return false;
  if (dist < 1) return true;
  const ndx = dx / dist;
  const ndy = dy / dist;
  for (let i = 0; i < occluders.length; i++) {
    const t = rayIntersection(ox, oy, ndx, ndy, occluders[i]);
    if (t !== null && t < dist - 4) return false;
  }
  return true;
}

function drawScenery(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  x0: number,
  x1: number,
  _y0: number,
  y1: number
): void {
  const scroll = world.scroll;
  const drawLayer = (
    par: number,
    color: string,
    base: number,
    minH: number,
    maxH: number,
    seed: number,
    lit: boolean
  ) => {
    const sh = scroll * par;
    const i0 = Math.floor((x0 + sh) / 86) - 1;
    const i1 = Math.ceil((x1 + sh) / 86) + 1;
    for (let i = i0; i <= i1; i++) {
      const x = i * 86 - sh;
      const h = minH + hash(i * seed) * (maxH - minH);
      const w = 64 + hash(i * 3.7 + seed) * 18;
      ctx.fillStyle = color;
      ctx.fillRect(x, base - h, w, h);
      if (!lit) continue;
      ctx.fillStyle = 'rgba(255, 215, 130, 0.42)';
      for (let r = 0; r < h / 14 - 1; r++) {
        for (let c = 0; c < 5; c++) {
          if (hash(i * 37 + r * 7.3 + c * 1.7) > 0.6) {
            ctx.fillRect(x + 7 + c * 11, base - h + 8 + r * 14, 4, 6);
          }
        }
      }
    }
  };

  // Stars
  ctx.fillStyle = 'rgba(220, 235, 255, 0.45)';
  const s0 = Math.floor((x0 + scroll * 0.04) / 140) - 1;
  const s1 = Math.ceil((x1 + scroll * 0.04) / 140) + 1;
  for (let i = s0; i <= s1; i++) {
    const sx = i * 140 - scroll * 0.04 + hash(i * 11.3) * 110;
    const sy = -180 + hash(i * 17.7) * 120;
    ctx.fillRect(sx, sy, 1.8, 1.8);
  }

  drawLayer(0.28, '#13203d', -26, 65, 195, 7, true);
  drawLayer(0.55, '#0c152b', -26, 36, 115, 13, false);

  // Dhaka Metro Elevated Station Platform when slowing or stopped!
  const platformAlpha = Math.max(0, Math.min(1, (0.85 - world.trainSpeed) / 0.65));
  if (platformAlpha > 0.02) {
    ctx.save();
    ctx.globalAlpha = platformAlpha;
    // Platform deck above top doors
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x0, -118, x1 - x0, 98);
    // Bright yellow tactile warning line along platform edge
    ctx.fillStyle = '#eab308';
    ctx.fillRect(x0, -28, x1 - x0, 5);
    // Steel canopy support pillars + illuminated station signs
    for (let px = Math.floor(x0 / 340) * 340; px < x1 + 340; px += 340) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(px - 8, -125, 16, 100);
      // Dhaka Metro station sign board
      ctx.fillStyle = '#0f172a';
      rr(ctx, px + 36, -98, 176, 34, 6);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#10b981';
      ctx.fillRect(px + 38, -96, 10, 30);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 13px "Hind Siliguri", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(STATIONS[world.stIdx], px + 128, -77);
    }
    ctx.restore();
  }

  // Elevated Metro Viaduct concrete deck
  ctx.fillStyle = '#09101f';
  ctx.fillRect(x0, CH + 18, x1 - x0, Math.max(40, y1 - CH));
  ctx.fillStyle = '#252f42';
  ctx.fillRect(x0, CH + 16, x1 - x0, 8);

  const shFast = scroll * 2.2;
  const p0 = Math.floor((x0 + shFast) / 160) - 1;
  const p1 = Math.ceil((x1 + shFast) / 160) + 1;
  for (let i = p0; i <= p1; i++) {
    const px = i * 160 - shFast;
    ctx.fillStyle = '#1b2336';
    ctx.fillRect(px, CH + 24, 18, 90);
    ctx.fillStyle = 'rgba(245, 183, 61, 0.65)';
    ctx.fillRect(px + 2, CH + 38, 12, 3);
  }

  const catSh = scroll * 2.5;
  const c0 = Math.floor((x0 + catSh) / 260) - 1;
  const c1 = Math.ceil((x1 + catSh) / 260) + 1;
  ctx.fillStyle = '#334155';
  for (let i = c0; i <= c1; i++) {
    const cx = i * 260 - catSh;
    ctx.fillRect(cx, -120, 6, 98);
  }
}

// Smooth animated sliding door interpolation
let doorCloseProgress = 0;

function drawCoach(
  ctx: CanvasRenderingContext2D,
  i: number,
  world: GameWorld,
  t: number
): void {
  const x0 = i * STEP;
  const isLadies = i === 5;
  const isDriver = i === 6;
  const isCargo = i === 1;
  const isElec = i === 0;
  const isCanteen = i === 3;
  const lightsOut = world.sabotage.active === 'lights';

  const coachW = isDriver ? CW - 36 : CW;
  ctx.fillStyle = '#9aa8bc';
  rr(ctx, x0 - 12, -20, coachW + 24, CH + 40, isDriver ? 28 : 14);
  ctx.fill();
  ctx.fillStyle = '#647287';
  ctx.fillRect(x0 - 10, -20, coachW + 18, 4);
  ctx.fillRect(x0 - 10, CH + 16, coachW + 18, 4);

  if (isDriver) {
    // Realistic angled panoramic cab windshield looking at night track headlights
    const noseX = x0 + CW - 44;
    ctx.fillStyle = '#091124';
    rr(ctx, noseX, 26, 26, CH - 52, 8);
    ctx.fill();
    // Scrolling rail sleepers & twin headlight cone glow ahead of the train
    ctx.save();
    ctx.beginPath();
    rr(ctx, noseX + 2, 28, 22, CH - 56, 6);
    ctx.clip();
    const g = ctx.createLinearGradient(noseX, 0, noseX + 26, 0);
    g.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
    g.addColorStop(1, 'rgba(253, 224, 71, 0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(noseX, 26, 26, CH - 52);
    // Track tie lines rushing across cab glass
    const tieShift = (world.scroll * 2.8) % 26;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
    for (let ty = 30; ty < CH - 30; ty += 26) {
      ctx.fillRect(noseX + 24 - tieShift, ty, 6, 3);
    }
    ctx.restore();
    // Windshield metallic mullion & specular glass gleam
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    rr(ctx, noseX, 26, 26, CH - 52, 8);
    ctx.stroke();
    ctx.fillRect(noseX, CH / 2 - 2, 26, 4);
  }

  let floorCol = '#343e50';
  if (isLadies) floorCol = '#473654';
  else if (isCargo) floorCol = '#323944';
  else if (isElec) floorCol = '#2b3444';
  else if (isCanteen) floorCol = '#364153';
  else if (isDriver) floorCol = '#2a3342';

  ctx.fillStyle = floorCol;
  ctx.fillRect(x0, 0, coachW, CH);

  // Subtle floor tile grid
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= coachW; gx += 44) {
    ctx.beginPath();
    ctx.moveTo(x0 + gx, BENCH);
    ctx.lineTo(x0 + gx, CH - BENCH);
    ctx.stroke();
  }
  for (let gy = BENCH; gy <= CH - BENCH; gy += 44) {
    ctx.beginPath();
    ctx.moveTo(x0, gy);
    ctx.lineTo(x0 + coachW, gy);
    ctx.stroke();
  }

  // Realistic soft overhead light pools & sweeping viaduct lamp beams
  if (!lightsOut) {
    for (let lx = 150; lx < coachW - 80; lx += 220) {
      const lg = ctx.createRadialGradient(x0 + lx, CH / 2, 10, x0 + lx, CH / 2, 110);
      lg.addColorStop(0, 'rgba(226, 240, 255, 0.095)');
      lg.addColorStop(1, 'rgba(226, 240, 255, 0)');
      ctx.fillStyle = lg;
      ctx.fillRect(x0 + lx - 110, BENCH, 220, CH - BENCH * 2);
    }
    // Sweeping exterior streetlight shaft across coach floor
    if (world.trainSpeed > 0.1) {
      const beamPhase = (world.scroll * 1.4 + i * 180) % 520;
      const bx = x0 + coachW - beamPhase * 2;
      if (bx > x0 - 90 && bx < x0 + coachW + 90) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, BENCH, coachW, CH - BENCH * 2);
        ctx.clip();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.05)';
        ctx.beginPath();
        ctx.moveTo(bx, BENCH);
        ctx.lineTo(bx + 70, BENCH);
        ctx.lineTo(bx + 20, CH - BENCH);
        ctx.lineTo(bx - 50, CH - BENCH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  } else {
    // Emergency amber/red floor guide strips when power is out!
    const pulse = 0.25 + 0.25 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;
    ctx.fillRect(x0 + 24, BENCH + 2, coachW - 48, 2);
    ctx.fillRect(x0 + 24, CH - BENCH - 4, coachW - 48, 2);
  }

  // Center aisle stripe
  ctx.fillStyle = isLadies ? 'rgba(192, 132, 252, 0.06)' : 'rgba(255, 255, 255, 0.035)';
  ctx.fillRect(x0 + 18, CH / 2 - 44, coachW - 36, 88);

  // Floor name watermark
  ctx.fillStyle = 'rgba(255,255,255,0.075)';
  ctx.font = '700 28px "Hind Siliguri", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(COACH_NAMES[i], x0 + coachW / 2, CH / 2 + 10);

  // Environmental Hazard Slow Zones on Coach Floor
  HAZARD_ZONES.forEach((hz) => {
    if (hz.coach !== i) return;
    ctx.save();
    if (hz.kind === 'oil') {
      ctx.fillStyle = 'rgba(15, 14, 20, 0.56)';
      rr(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.fill();
      ctx.fillStyle = 'rgba(217, 119, 6, 0.14)';
      ctx.beginPath();
      ctx.ellipse(hz.x + hz.w * 0.38, hz.y + hz.h * 0.44, hz.w * 0.28, hz.h * 0.22, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.beginPath();
      ctx.ellipse(hz.x + hz.w * 0.65, hz.y + hz.h * 0.58, hz.w * 0.2, hz.h * 0.14, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 183, 61, 0.38)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 5]);
      rr(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245, 183, 61, 0.72)';
      ctx.font = '600 9px "Hind Siliguri", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('কার্গো তেল', hz.x + hz.w / 2, hz.y + hz.h - 8);
    } else {
      ctx.fillStyle = 'rgba(14, 116, 144, 0.18)';
      rr(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.fill();
      // Subtle organic wet puddle sheen inside the zone
      ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.beginPath();
      ctx.ellipse(hz.x + hz.w * 0.46, hz.y + hz.h * 0.46, hz.w * 0.34, hz.h * 0.26, -0.1, 0, Math.PI * 2);
      ctx.fill();
      const rShift = (t * 0.55) % 1;
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.26 * (1 - rShift)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(
        hz.x + hz.w * 0.5,
        hz.y + hz.h * 0.46,
        10 + rShift * (hz.w * 0.3),
        6 + rShift * (hz.h * 0.24),
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.36)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 5]);
      rr(ctx, hz.x, hz.y, hz.w, hz.h, 18);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(125, 211, 252, 0.74)';
      ctx.font = '600 9px "Hind Siliguri", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('পিচ্ছিল মেঝে', hz.x + hz.w / 2, hz.y + hz.h - 8);
    }
    ctx.restore();
  });

  if (i === 2 || i === 3 || i === 4 || i === 5) {
    DOORS.forEach((d) => {
      ctx.fillStyle = 'rgba(245, 183, 61, 0.14)';
      ctx.fillRect(x0 + d[0], BENCH, d[1] - d[0], 32);
      ctx.fillStyle = 'rgba(245, 183, 61, 0.45)';
      ctx.fillRect(x0 + d[0], BENCH, d[1] - d[0], 3);
    });
  }

  ctx.fillStyle = '#1f2737';
  ctx.fillRect(x0, 0, coachW, BENCH);
  ctx.fillRect(x0, CH - BENCH, coachW, BENCH);

  if (i === 2 || i === 3 || i === 4 || i === 5) {
    const seatFill = isLadies ? '#7c3aed' : '#238253';
    const seatBack = isLadies ? '#5b21b6' : '#185e3c';
    const seatHilite = isLadies ? '#a78bfa' : '#34d399';
    SEG.forEach((sg, sgIdx) => {
      if (i === 3 && sg[0] < 350) return;
      if (i === 3 && sg[0] > 550) return;
      const cnt = Math.max(2, Math.round((sg[1] - sg[0]) / 42));
      const w = (sg[1] - sg[0]) / cnt;
      // Under-bench drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x0 + sg[0] + 2, BENCH - 2, sg[1] - sg[0] - 4, 5);
      for (let k = 0; k < cnt; k++) {
        const sx = x0 + sg[0] + w * k + 2;
        const isPriority = (sgIdx === 0 && k === 0) || (sgIdx === SEG.length - 1 && k === cnt - 1);
        ctx.fillStyle = isPriority ? '#d97706' : seatFill;
        rr(ctx, sx, 10, w - 4, BENCH - 15, 5);
        ctx.fill();
        // Cushion front highlight stitch
        ctx.fillStyle = isPriority ? '#fbbf24' : seatHilite;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(sx + 3, BENCH - 10, w - 10, 2.5);
        ctx.globalAlpha = 1;
        // Seat backrest
        ctx.fillStyle = isPriority ? '#92400e' : seatBack;
        rr(ctx, sx, 3, w - 4, 7, 3);
        ctx.fill();
      }
      // Chrome end armrests
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x0 + sg[0] + 1, 10, 2.5, BENCH - 13);
      ctx.fillRect(x0 + sg[1] - 3.5, 10, 2.5, BENCH - 13);
    });

    const bStart = 40;
    const bEnd = CW - 40;
    const bCnt = Math.round((bEnd - bStart) / 42);
    const bw = (bEnd - bStart) / bCnt;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x0 + bStart, CH - BENCH - 3, bEnd - bStart, 5);
    for (let k = 0; k < bCnt; k++) {
      const sx = x0 + bStart + bw * k + 2;
      const isPriority = k <= 1 || k >= bCnt - 2;
      ctx.fillStyle = isPriority ? '#d97706' : seatFill;
      rr(ctx, sx, CH - BENCH + 5, bw - 4, BENCH - 15, 5);
      ctx.fill();
      ctx.fillStyle = isPriority ? '#fbbf24' : seatHilite;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(sx + 3, CH - BENCH + 7, bw - 10, 2.5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = isPriority ? '#92400e' : seatBack;
      rr(ctx, sx, CH - 10, bw - 4, 7, 3);
      ctx.fill();
    }

    DOORS.forEach((d) => {
      const dw = d[1] - d[0];
      const slide = world.stationDoorOpen * (dw * 0.42);
      // Open doorway threshold showing exterior platform
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x0 + d[0] + 1, -16, dw - 2, BENCH + 16);
      if (world.stationDoorOpen > 0.04) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(x0 + d[0] + 6, -16, dw - 12, 18);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(x0 + d[0] + 6, -4, dw - 12, 3);
      }
      // Left sliding door leaf
      const leafW = dw / 2 - 4;
      ctx.fillStyle = '#c9d3df';
      ctx.fillRect(x0 + d[0] + 1 - slide, -16, leafW + 2, BENCH + 16);
      ctx.fillStyle = '#75b1df';
      ctx.fillRect(x0 + d[0] + 5 - slide, -12, leafW - 6, BENCH + 8);
      // Right sliding door leaf
      const rx0 = x0 + (d[0] + d[1]) / 2 + slide;
      ctx.fillStyle = '#c9d3df';
      ctx.fillRect(rx0, -16, leafW + 2, BENCH + 16);
      ctx.fillStyle = '#75b1df';
      ctx.fillRect(rx0 + 3, -12, leafW - 6, BENCH + 8);
      // LED route indicator strip above doorway showing live station progress
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x0 + d[0] + 10, BENCH - 10, dw - 20, 8);
      ctx.fillStyle = '#334155';
      ctx.fillRect(x0 + d[0] + 14, BENCH - 6.5, dw - 28, 1.5);
      for (let st = 0; st < 6; st++) {
        const dotX = x0 + d[0] + 15 + ((dw - 30) / 5) * st;
        const active = st === world.stIdx % 6;
        ctx.fillStyle = active ? (Math.sin(t * 6) > 0 ? '#facc15' : '#38bdf8') : '#4ade80';
        ctx.beginPath();
        ctx.arc(dotX, BENCH - 5.8, active ? 2.2 : 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  ctx.fillStyle = '#1a2c47';
  SEG.forEach((sg) => {
    if (sg[1] - sg[0] > 30) ctx.fillRect(x0 + sg[0] + 8, -14, sg[1] - sg[0] - 16, 11);
  });
  for (let k = 0; k < 10; k++) {
    ctx.fillRect(x0 + 18 + k * ((coachW - 36) / 10) + 4, CH + 3, (coachW - 36) / 10 - 8, 11);
  }

  if (isLadies) {
    const sx = 5 * STEP + 660;
    const sy = CH / 2 + 64;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, sx - 25, sy - 12, 52, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    rr(ctx, sx - 26, sy - 16, 52, 32, 8);
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    rr(ctx, sx - 22, sy - 12, 44, 24, 6);
    ctx.stroke();
    // Pulsing biometric scan ring
    const ring = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(52, 211, 153, ${0.18 + ring * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 14 + ring * 2, 7 + ring, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Detailed & Animated Interior Furniture (OBSTACLES)
  OBSTACLES.forEach((o) => {
    if (Math.floor(o.x / STEP) !== i) return;
    // Ambient floor drop shadow for all solid fixtures
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    rr(ctx, o.x + 2, o.y + 4, o.w, o.h, 6);
    ctx.fill();

    if (o.kind === 'generator') {
      // Industrial Metro Power Generator with spinning fan & pulsing dial
      const vib = lightsOut ? 0 : Math.sin(t * 36) * 0.4;
      ctx.save();
      ctx.translate(0, vib);
      ctx.fillStyle = '#283347';
      rr(ctx, o.x, o.y, o.w, o.h, 7);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spinning cooling turbine fan on left side
      const fx = o.x + 28;
      const fy = o.y + o.h / 2;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(fx, fy, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(lightsOut ? 0.3 : t * 8.5);
      ctx.fillStyle = '#94a3b8';
      for (let b = 0; b < 4; b++) {
        ctx.rotate(Math.PI / 2);
        rr(ctx, -2.5, -14, 5, 13, 2);
        ctx.fill();
      }
      ctx.restore();
      // Protective fan grille ring
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(fx, fy, 17, 0, Math.PI * 2);
      ctx.stroke();

      // Copper coils & voltage ribs
      for (let bx = 54; bx < o.w - 28; bx += 12) {
        ctx.fillStyle = '#d97706';
        rr(ctx, o.x + bx, o.y + 12, 7, o.h - 24, 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(o.x + bx + 1, o.y + 16, 2, o.h - 32);
      }

      // Live voltage analog gauge + status diode
      const gx = o.x + o.w - 15;
      const gy = o.y + 20;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lightsOut ? '#ef4444' : '#38bdf8';
      ctx.lineWidth = 1.5;
      const needleAng = lightsOut ? -2.2 : -0.6 + Math.sin(t * 5) * 0.25;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.cos(needleAng) * 6, gy + Math.sin(needleAng) * 6);
      ctx.stroke();

      ctx.fillStyle = lightsOut ? (Math.sin(t * 10) > 0 ? '#ef4444' : '#7f1d1d') : '#22c55e';
      ctx.beginPath();
      ctx.arc(gx, o.y + o.h - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (o.kind === 'rack') {
      // Multi-bay steel cargo rack with detailed suitcases (handles, straps, wheels)
      ctx.fillStyle = '#334155';
      rr(ctx, o.x, o.y, o.w, o.h, 5);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // Shelf divider bar
      ctx.fillStyle = '#64748b';
      ctx.fillRect(o.x + 2, o.y + o.h / 2 - 1, o.w - 4, 2);

      const bagCols = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7'];
      const slotCount = Math.max(2, Math.floor((o.w - 16) / 36));
      for (let b = 0; b < slotCount; b++) {
        const bx = o.x + 10 + b * ((o.w - 20) / slotCount);
        const bw = 26;
        const bh = o.h - 12;
        const col = bagCols[(b + i * 2) % bagCols.length];
        // Handle
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(bx + 8, o.y + 3, 10, 4);
        // Suitcase shell
        ctx.fillStyle = col;
        rr(ctx, bx, o.y + 6, bw, bh, 3.5);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Luggage strap
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(bx + 1, o.y + 6 + bh * 0.45, bw - 2, 3);
      }
    } else if (o.kind === 'counter') {
      // Realistic Metro Cafe Counter: Espresso Machine + Rising Steam + Glass Singara Display
      ctx.fillStyle = '#5c2d0c';
      rr(ctx, o.x, o.y, o.w, o.h, 6);
      ctx.fill();
      // Polished steel counter top rim
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, o.x + 3, o.y + 3, o.w - 6, 10, 3);
      ctx.fill();

      // Espresso & Tea Brewer Machine
      const ex = o.x + 14;
      const ey = o.y + 15;
      ctx.fillStyle = '#1e293b';
      rr(ctx, ex, ey, 36, 26, 4);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(ex + 4, ey + 4, 28, 7);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ex + 30, ey + 7.5, 2, 0, Math.PI * 2);
      ctx.fill();
      // Ceramic tea cups under nozzles
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(ex + 8, ey + 16, 6, 7);
      ctx.fillRect(ex + 20, ey + 16, 6, 7);
      // Animated rising hot steam wisps!
      for (let st = 0; st < 3; st++) {
        const phase = (t * 0.9 + st * 0.33) % 1;
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - phase) * 0.5})`;
        ctx.beginPath();
        ctx.arc(
          ex + 12 + st * 6 + Math.sin(t * 4 + st) * 2.5,
          ey + 4 - phase * 18,
          2.2 + phase * 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      // Glass Snack Display Case (with golden singaras!)
      const dx = o.x + 62;
      const dy = o.y + 15;
      ctx.fillStyle = 'rgba(125, 211, 252, 0.2)';
      rr(ctx, dx, dy, 54, 26, 4);
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      for (let s = 0; s < 3; s++) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(dx + 12 + s * 14, dy + 8);
        ctx.lineTo(dx + 18 + s * 14, dy + 20);
        ctx.lineTo(dx + 6 + s * 14, dy + 20);
        ctx.closePath();
        ctx.fill();
      }

      // Cash Register Terminal
      ctx.fillStyle = '#0f172a';
      rr(ctx, o.x + 128, o.y + 16, 36, 22, 4);
      ctx.fill();
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(o.x + 132, o.y + 20, 20, 8);

      ctx.fillStyle = '#fef3c7';
      ctx.font = '700 9.5px "Hind Siliguri", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('মেট্রো ক্যাফে', o.x + o.w / 2, o.y + o.h - 4);
    } else if (o.kind === 'console') {
      // Multi-screen Live Telemetry / Radar / Driver Desk Console
      ctx.fillStyle = '#172033';
      rr(ctx, o.x, o.y, o.w, o.h, 7);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();

      const isRadarDesk = o.label?.includes('রাডার');
      const isDriverDeck = o.label?.includes('ড্রাইভার');

      if (isDriverDeck) {
        // Vertical cockpit dashboard with glowing speedometer + throttle lever
        ctx.fillStyle = '#090e1b';
        rr(ctx, o.x + 10, o.y + 12, o.w - 20, o.h - 28, 5);
        ctx.fill();
        // Speed gauge arc
        const gx = o.x + o.w / 2;
        const gy = o.y + 42;
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(gx, gy, 18, Math.PI * 0.85, Math.PI * 2.15);
        ctx.stroke();
        // Live needle matching world.trainSpeed!
        const nAng = Math.PI * 0.85 + world.trainSpeed * Math.PI * 1.1;
        ctx.strokeStyle = '#f5b73d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + Math.cos(nAng) * 14, gy + Math.sin(nAng) * 14);
        ctx.stroke();
        // Throttle Lever slot & handle
        ctx.fillStyle = '#1e293b';
        rr(ctx, gx - 18, o.y + 74, 36, 26, 4);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        rr(ctx, gx - 10, o.y + 82 - world.trainSpeed * 8, 20, 9, 3);
        ctx.fill();
      } else if (isRadarDesk) {
        // Rotating Green Coach Radar Screen + Telemetry LEDs
        ctx.fillStyle = '#090e1b';
        rr(ctx, o.x + 12, o.y + 8, 48, 28, 4);
        ctx.fill();
        const rx = o.x + 36;
        const ry = o.y + 22;
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rx, ry, 10, 0, Math.PI * 2);
        ctx.stroke();
        // Rotating radar sweep line
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(t * 2.8) * 11, ry + Math.sin(t * 2.8) * 11);
        ctx.stroke();

        // Waveform monitor beside radar
        ctx.fillStyle = '#090e1b';
        rr(ctx, o.x + 68, o.y + 8, o.w - 80, 28, 4);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let wx = 0; wx < o.w - 92; wx += 4) {
          const wy = o.y + 22 + Math.sin(t * 6 + wx * 0.25) * 6;
          if (wx === 0) ctx.moveTo(o.x + 74 + wx, wy);
          else ctx.lineTo(o.x + 74 + wx, wy);
        }
        ctx.stroke();
      } else {
        // Multi-camera CCTV Security monitors
        for (let m = 0; m < 2; m++) {
          const mx = o.x + 10 + m * 68;
          ctx.fillStyle = '#090e1b';
          rr(ctx, mx, o.y + 8, 58, 24, 4);
          ctx.fill();
          // Animated scanline wave
          ctx.fillStyle = m === 0 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(74, 222, 128, 0.25)';
          const scan = ((t * 24 + m * 12) % 20);
          ctx.fillRect(mx + 2, o.y + 9 + scan, 54, 3);
          ctx.fillStyle = world.sabotage.active === 'comms' ? '#ef4444' : '#4ade80';
          ctx.beginPath();
          ctx.arc(mx + 50, o.y + 14, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (o.label) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 9px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.label, o.x + o.w / 2, o.y + o.h - 6);
      }
    } else if (o.kind === 'partition') {
      // Metallic frame with frosted tempered glass divider
      ctx.fillStyle = '#475569';
      rr(ctx, o.x, o.y, o.w, o.h, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.fillRect(o.x + 3, o.y + 4, o.w - 6, o.h - 8);
      // Specular diagonal glass streak
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(o.x + 4, o.y + 10);
      ctx.lineTo(o.x + o.w - 4, o.y + 22);
      ctx.stroke();
    }
  });

  ctx.fillStyle = '#728096';
  [x0 - 10, x0 + CW].forEach((wx, idx) => {
    const hasGap = (idx === 0 && i > 0) || (idx === 1 && i < N_COACHES - 1);
    if (hasGap) {
      ctx.fillRect(wx, -20, 10, CH / 2 - 36 + 20);
      ctx.fillRect(wx, CH / 2 + 36, 10, CH / 2 - 36 + 20);
    } else if (!(idx === 1 && isDriver)) {
      ctx.fillRect(wx, -20, 10, CH + 40);
    }
  });

  // Animated Accordion Gangway + smoothly sliding bulkhead door
  if (i < N_COACHES - 1) {
    const gx0 = x0 + CW;
    const flex = Math.sin(t * 5.2 + i) * 1.4 * world.trainSpeed;
    ctx.fillStyle = '#242b38';
    ctx.fillRect(gx0, CH / 2 - 36 + flex * 0.4, GW, 72);
    // Steel footplate threshold
    ctx.fillStyle = '#475569';
    ctx.fillRect(gx0 + 18, CH / 2 - 24, GW - 36, 48);
    ctx.fillStyle = '#4f5a70';
    ctx.fillRect(gx0, CH / 2 - 40 + flex * 0.4, GW, 5);
    ctx.fillRect(gx0, CH / 2 + 35 + flex * 0.4, GW, 5);
    ctx.strokeStyle = '#364054';
    ctx.lineWidth = 2;
    for (let rx = 8; rx < GW; rx += 10) {
      ctx.beginPath();
      ctx.moveTo(gx0 + rx + flex * 0.3, CH / 2 - 40);
      ctx.lineTo(gx0 + rx + flex * 0.3, CH / 2 - 35);
      ctx.moveTo(gx0 + rx - flex * 0.3, CH / 2 + 35);
      ctx.lineTo(gx0 + rx - flex * 0.3, CH / 2 + 40);
      ctx.stroke();
    }
    if (doorCloseProgress > 0.02) {
      const leafH = 36 * doorCloseProgress;
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(gx0 + GW / 2 - 8, CH / 2 - 36, 16, leafH);
      ctx.fillRect(gx0 + GW / 2 - 8, CH / 2 + 36 - leafH, 16, leafH);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(gx0 + GW / 2 - 3, CH / 2 - 36, 6, Math.max(0, leafH - 3));
      ctx.fillRect(gx0 + GW / 2 - 3, CH / 2 + 36 - Math.max(0, leafH - 3), 6, Math.max(0, leafH - 3));
    }
  }

  VENTS.forEach((v) => {
    if (v.coach !== i) return;
    const openAmt = world.ventAnim[v.id] || 0;
    // Deep shaft underneath when vent opens
    ctx.fillStyle = '#090d16';
    rr(ctx, v.x - 16, v.y - 11, 32, 22, 4);
    ctx.fill();
    ctx.save();
    ctx.translate(v.x - openAmt * 11, v.y - openAmt * 6);
    ctx.rotate(-openAmt * 0.32);
    ctx.fillStyle = '#1e293b';
    rr(ctx, -16, -11, 32, 22, 4);
    ctx.fill();
    ctx.strokeStyle = openAmt > 0.05 ? '#f5b73d' : '#64748b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    for (let gx = -10; gx <= 10; gx += 5) {
      ctx.beginPath();
      ctx.moveTo(gx, -7);
      ctx.lineTo(gx, 7);
      ctx.stroke();
    }
    ctx.restore();
  });

  CAMERAS.forEach((cm) => {
    if (cm.coach !== i) return;
    const pan = Math.sin(t * 0.9 + cm.id) * 0.25;
    ctx.save();
    ctx.translate(cm.x, cm.y);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-3, 4, 6, 5);
    ctx.rotate(pan);
    ctx.fillStyle = '#0f172a';
    rr(ctx, -10, -6, 20, 11, 3);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(5, -3, 4, 5);
    if (world.camsInUse && Math.sin(t * 8) > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(-5, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  SPOTS.forEach((sp) => {
    if (sp.coach !== i) return;
    drawTaskProp(ctx, sp, t);
  });

  SABOTAGE_SPOTS.forEach((sb) => {
    if (sb.coach !== i) return;
    const active = world.sabotage.active === sb.type && !world.sabotage.fixedParts[sb.id];
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    rr(ctx, sb.x - 13, sb.y - 9, 28, 22, 4);
    ctx.fill();
    ctx.fillStyle = active ? '#7f1d1d' : '#1e293b';
    rr(ctx, sb.x - 14, sb.y - 12, 28, 22, 4);
    ctx.fill();
    ctx.strokeStyle = active ? '#ef4444' : '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (active && Math.sin(t * 10) > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(sb.x, sb.y - 1, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (i === 2 || i === 4 || i === 5) {
    ctx.strokeStyle = 'rgba(210, 220, 235, 0.35)';
    ctx.lineWidth = 2.5;
    [CH * 0.33, CH * 0.67].forEach((by) => {
      ctx.beginPath();
      ctx.moveTo(x0 + 36, by);
      ctx.lineTo(x0 + CW - 36, by);
      ctx.stroke();
    });
  }
}

function drawTaskProp(ctx: CanvasRenderingContext2D, sp: (typeof SPOTS)[number], t: number): void {
  // Subtle grounding shadow beneath interior props
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(sp.x, sp.y + 4, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  switch (sp.type) {
    case 'wires':
      // 5-wire industrial junction panel with micro spark
      ctx.fillStyle = '#1e293b';
      rr(ctx, sp.x - 15, sp.y - 18, 30, 28, 4);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ['#e5484d', '#3e8ef7', '#f5b73d', '#2fb36a', '#a855f7'].forEach((cl, q) => {
        ctx.fillStyle = cl;
        ctx.fillRect(sp.x - 10 + q * 4.5, sp.y - 13, 3, 16);
      });
      if (Math.sin(t * 14 + sp.id) > 0.88) {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(sp.x + 2, sp.y - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'swipe':
      // Stainless MRT card terminal with animated swipe LED chevron
      ctx.fillStyle = '#cbd5e1';
      rr(ctx, sp.x - 13, BENCH - 2, 26, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(sp.x - 9, BENCH + 3, 18, 3.5);
      ctx.fillStyle = Math.sin(t * 5) > 0 ? '#22c55e' : '#f5b73d';
      ctx.beginPath();
      ctx.arc(sp.x + 7, BENCH + 1, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'tap': {
      // Glowing NFC validator pad
      const py = sp.y < CH / 2 ? BENCH - 1 : CH - BENCH - 10;
      ctx.fillStyle = '#1e293b';
      rr(ctx, sp.x - 11, py, 22, 11, 3);
      ctx.fill();
      ctx.fillStyle = Math.sin(t * 4) > 0 ? '#4ade80' : '#0ea5e9';
      ctx.fillRect(sp.x - 6, py + 3, 12, 4);
      break;
    }
    case 'code':
      ctx.fillStyle = '#0f172a';
      rr(ctx, sp.x - 12, BENCH - 3, 24, 24, 3.5);
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let q = 0; q < 9; q++) {
        ctx.fillStyle = q === (Math.floor(t * 3) % 9) ? '#f5b73d' : '#38bdf8';
        ctx.fillRect(sp.x - 7 + (q % 3) * 5, BENCH + 2 + ((q / 3) | 0) * 5, 3, 3);
      }
      break;
    case 'lights':
      ctx.fillStyle = '#1e293b';
      rr(ctx, sp.x - 20, sp.y - 9, 40, 16, 3.5);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      for (let q = 0; q < 6; q++) {
        ctx.fillStyle = q % 2 ? '#4ade80' : '#f5b73d';
        ctx.fillRect(sp.x - 16 + q * 5.5, sp.y - 5, 3.5, 8);
      }
      break;
    case 'trash':
      // Metallic waste bin with hinged swing flap
      ctx.fillStyle = '#334155';
      rr(ctx, sp.x - 15, sp.y - 12, 30, 22, 4);
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(sp.x - 10, sp.y - 7, 20, 5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(sp.x - 11, sp.y + 3, 22, 3);
      break;
    case 'ac':
      // Twin-fan AC exhaust vent housing with rotating blades!
      ctx.fillStyle = '#475569';
      rr(ctx, sp.x - 24, sp.y - 11, 48, 18, 4);
      ctx.fill();
      [-11, 11].forEach((ox) => {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(sp.x + ox, sp.y - 2, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(sp.x + ox, sp.y - 2);
        ctx.rotate(t * 7 + ox);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 5);
        ctx.stroke();
        ctx.restore();
      });
      break;
    case 'clean':
      // Glossy spilled coffee stain + knocked over disposable cup
      ctx.fillStyle = 'rgba(110, 62, 24, 0.72)';
      ctx.beginPath();
      ctx.ellipse(sp.x - 7, CH - BENCH - 6, 10, 4.5, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sp.x + 8, CH - BENCH - 9, 7, 3.5, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Spilled specular highlight + cup
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(sp.x - 10, CH - BENCH - 7, 6, 1.5);
      ctx.fillStyle = '#f8fafc';
      rr(ctx, sp.x + 12, CH - BENCH - 11, 8, 5, 1.5);
      ctx.fill();
      break;
    case 'wipe': {
      // Frosted foggy window strip + tiny condensation droplets
      const wy = sp.y < CH / 2 ? BENCH - 2 : CH - BENCH - 9;
      ctx.fillStyle = 'rgba(186, 230, 253, 0.36)';
      rr(ctx, sp.x - 24, wy, 48, 10, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(sp.x - 12, wy + 5, 1.3, 0, Math.PI * 2);
      ctx.arc(sp.x + 4, wy + 4, 1.5, 0, Math.PI * 2);
      ctx.arc(sp.x + 15, wy + 6, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'signal':
      // 3x3 animated relay grid terminal
      ctx.fillStyle = '#0f172a';
      rr(ctx, sp.x - 16, sp.y - 10, 32, 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      for (let g = 0; g < 6; g++) {
        ctx.fillStyle = g === (Math.floor(t * 4) % 6) ? '#38bdf8' : '#1e293b';
        ctx.fillRect(sp.x - 11 + (g % 3) * 8, sp.y - 6 + ((g / 3) | 0) * 7, 5, 4);
      }
      break;
    case 'throttle':
      // Rotating brake pressure dial + mechanical wheel
      ctx.fillStyle = '#1e293b';
      rr(ctx, sp.x - 16, sp.y - 10, 32, 20, 5);
      ctx.fill();
      ctx.strokeStyle = '#f5b73d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x + Math.cos(t * 4) * 6, sp.y + Math.sin(t * 4) * 6);
      ctx.stroke();
      break;
    case 'canteen':
      // Beverage dispenser tray + tiny rising steam
      ctx.fillStyle = '#475569';
      rr(ctx, sp.x - 16, sp.y - 9, 32, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#f5b73d';
      rr(ctx, sp.x - 11, sp.y - 5, 10, 10, 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      rr(ctx, sp.x + 2, sp.y - 5, 10, 10, 2);
      ctx.fill();
      break;
    case 'luggage':
      // Digital cargo weigh-scale platform
      ctx.fillStyle = '#1e293b';
      rr(ctx, sp.x - 18, sp.y - 10, 36, 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(sp.x - 12, sp.y - 6, 24, 5);
      break;
    case 'scan':
      // Scanner pad prop glow
      ctx.fillStyle = '#0f172a';
      rr(ctx, sp.x - 16, sp.y - 10, 32, 20, 5);
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
  }
}

function drawChainBox(ctx: CanvasRenderingContext2D, world: GameWorld): void {
  const x = CHAIN.x;
  const y = CHAIN.y;
  ctx.fillStyle = '#334155';
  rr(ctx, x - 22, y - 16, 44, 32, 8);
  ctx.fill();
  ctx.fillStyle = world.me.chains > 0 ? '#dc2626' : '#475569';
  rr(ctx, x - 16, y - 11, 32, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 9px "Hind Siliguri", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('জরুরি', x, y);
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.arc(x, y + 10, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawVectorBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'warn' | 'check'
): void {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'warn') {
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 5);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-0.8, -3, 1.6, 4.5);
    ctx.fillRect(-0.8, 2.5, 1.6, 1.5);
  } else {
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-2.8, 0.2);
    ctx.lineTo(-0.7, 2.4);
    ctx.lineTo(3.2, -2.2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEntities(
  ctx: CanvasRenderingContext2D,
  world: GameWorld,
  t: number,
  occluders: VisionSegment[],
  visionRadius: number,
  applyFog: boolean
): void {
  const me = world.me;
  type Item =
    | { k: 'pole'; y: number; o: { x: number; y: number } }
    | { k: 'body'; y: number; o: GameWorld['bodies'][number] }
    | { k: 'pl'; y: number; o: Player };

  const list: Item[] = [];
  POLES.forEach((p) => list.push({ k: 'pole', y: p.y, o: p }));
  world.bodies.forEach((b) => list.push({ k: 'body', y: b.y, o: b }));
  world.players.forEach((p) => list.push({ k: 'pl', y: p.y, o: p }));
  list.sort((a, b) => a.y - b.y);

  interface PlayerOverlay {
    p2: Player;
    isStunned: boolean;
    isHasted: boolean;
    isSlowed: boolean;
    stunnedLeft: number;
  }
  const overlays: PlayerOverlay[] = [];

  list.forEach((e) => {
    if (e.k === 'pole') {
      const p = e.o;
      const g = ctx.createLinearGradient(p.x - 3, 0, p.x + 3, 0);
      g.addColorStop(0, '#7e899c');
      g.addColorStop(0.5, '#f4f7fb');
      g.addColorStop(1, '#6c788c');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 3, p.y - 44, 6, 44);
      ctx.fillStyle = '#4f5a6e';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 7, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.k === 'body') {
      const b = e.o;
      if (applyFog && me.alive && !canSeePoint(me.x, me.y - 20, b.x, b.y, visionRadius, occluders)) {
        return;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 2, 18, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Scattered dropped papers / boarding pass clue around stolen luggage!
      ctx.save();
      ctx.fillStyle = '#e2e8f0';
      ctx.translate(b.x + 17, b.y + 1);
      ctx.rotate(0.45);
      ctx.fillRect(-5, -3.5, 10, 7);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-3, -1.5, 5, 2);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#cbd5e1';
      ctx.translate(b.x - 18, b.y - 3);
      ctx.rotate(-0.6);
      ctx.fillRect(-4, -3, 8, 6);
      ctx.restore();

      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.4;
      rr(ctx, b.x - 13, b.y - 14, 26, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - 12, b.y - 8, 24, 4);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y - 14, 5, Math.PI, Math.PI * 2);
      ctx.stroke();
      // Pulsing vector alert circle
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(b.x, b.y - 26 - Math.sin(t * 5) * 2.5, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 30 - Math.sin(t * 5) * 2.5, 2, 4.5);
      ctx.fillRect(b.x - 1, b.y - 24 - Math.sin(t * 5) * 2.5, 2, 1.8);
    } else {
      const p2 = e.o;
      if (p2.inVent !== null && !p2.isMe && me.role !== 'faker') return;
      if (!p2.alive && me.alive) return;
      if (
        applyFog &&
        me.alive &&
        !p2.isMe &&
        !canSeePoint(me.x, me.y - 20, p2.x, p2.y - 20, visionRadius, occluders)
      ) {
        return;
      }

      const pst = getPlayerStatus(p2, world);
      const isStunned = pst.stunnedLeft > 0;
      const isHasted = pst.hasteLeft > 0;
      const isSlowed =
        !isStunned &&
        p2.alive &&
        (pst.slowMultiplier < 0.99 || (p2.speedMul !== undefined && p2.speedMul < 0.99 && !isHasted));

      drawChar(ctx, p2.x, p2.y, {
        color: p2.color,
        skin: p2.skin,
        acc: p2.acc,
        pants: p2.pants,
        hair: p2.hair,
        face: p2.face,
        ph: p2.ph,
        idleT: world.t,
        moving: p2.moving,
        ghost: !p2.alive,
        hasBag: p2.alive,
        alpha: p2.inVent !== null ? 0.35 : p2.alive ? 1 : 0.5,
        scanning: p2.scanningUntil > world.t,
        scanT: world.t,
        seed: p2.id + 1,
        lunge: p2.lungeUntil > world.t ? (p2.lungeUntil - world.t) / 0.34 : 0,
        stunned: isStunned,
        slowed: isSlowed,
        hasted: isHasted,
      });

      overlays.push({
        p2,
        isStunned,
        isHasted,
        isSlowed,
        stunnedLeft: pst.stunnedLeft,
      });
    }
  });

  // Pass 2: Render all player nameplates & overhead status badges above all sprites
  // Sort foreground (higher y) first so background players' labels nudge cleanly upward when crowded
  overlays.sort((a, b) => b.p2.y - a.p2.y || a.p2.id - b.p2.id);
  const placedRects: Array<{ l: number; r: number; t: number; b: number }> = [];

  overlays.forEach(({ p2, isStunned, isHasted, isSlowed, stunnedLeft }) => {
    let col = '#f8fafc';
    if (p2.isMe) col = '#f5b73d';
    else if (me.role === 'faker' && p2.role === 'faker') col = '#ff6b66';
    else if (me.known[p2.id] === true) col = '#ff6b66';
    else if (me.known[p2.id] === false) col = '#4ade80';

    ctx.save();
    ctx.font = '600 11.5px "Hind Siliguri", sans-serif';
    const textW = ctx.measureText(p2.name).width;
    const hasBadge = me.known[p2.id] === true || me.known[p2.id] === false;
    const hasStatus = p2.alive && (isStunned || isHasted || isSlowed);

    const padX = 5;
    const boxW = textW + padX * 2;
    const statusW = isStunned ? 50 : 46;
    const stackHalfW = Math.max(boxW / 2 + (hasBadge ? 14 : 0), hasStatus ? statusW / 2 : 0) + 3;

    let nameY = p2.y - 86;
    const stackHeightAboveName = hasStatus ? 34 : 12;
    const stackBottomBelowName = 4;

    // Resolve overlaps against foreground players' label stacks (bounded multi-pass)
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let iter = 0; iter < placedRects.length; iter++) {
        const pr = placedRects[iter];
        const l = p2.x - stackHalfW;
        const r = p2.x + stackHalfW;
        const t = nameY - stackHeightAboveName;
        const b = nameY + stackBottomBelowName;
        if (l < pr.r && r > pr.l && t < pr.b && b > pr.t) {
          const shift = b - pr.t + 4;
          if (p2.y - 86 - (nameY - shift) <= 56) {
            nameY -= shift;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    placedRects.push({
      l: p2.x - stackHalfW,
      r: p2.x + stackHalfW,
      t: nameY - stackHeightAboveName,
      b: nameY + stackBottomBelowName,
    });

    // Subtle dark backing card so closely standing players' names stay legible without colliding
    ctx.fillStyle = 'rgba(6, 11, 22, 0.76)';
    rr(ctx, p2.x - boxW / 2, nameY - 11.5, boxW, 15, 4);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(p2.name, p2.x, nameY);
    ctx.fillStyle = col;
    ctx.fillText(p2.name, p2.x, nameY);

    if (hasBadge) {
      drawVectorBadge(
        ctx,
        p2.x - boxW / 2 - 7,
        nameY - 4,
        me.known[p2.id] === true ? 'warn' : 'check'
      );
    }

    // Crisp overhead status effect tag placed cleanly above Bengali matras
    if (hasStatus) {
      if (isStunned) {
        const bw = 50;
        const bx = p2.x - bw / 2;
        const by = nameY - 33;
        ctx.fillStyle = 'rgba(6, 11, 22, 0.92)';
        rr(ctx, bx, by, bw, 15, 3);
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(bx + 8, by + 3);
        ctx.lineTo(bx + 5, by + 8);
        ctx.lineTo(bx + 8, by + 8);
        ctx.lineTo(bx + 6, by + 12);
        ctx.lineTo(bx + 11, by + 7);
        ctx.lineTo(bx + 8, by + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e0f2fe';
        ctx.font = '700 9.5px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('স্তব্ধ', bx + 15, by + 11);
        const pct = Math.max(0.05, Math.min(1, stunnedLeft / 3));
        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.fillRect(bx + 2, by + 12.5, bw - 4, 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(bx + 2, by + 12.5, (bw - 4) * pct, 2);
      } else if (isHasted) {
        const bw = 46;
        const bx = p2.x - bw / 2;
        const by = nameY - 32;
        ctx.fillStyle = 'rgba(6, 11, 22, 0.9)';
        rr(ctx, bx, by, bw, 14, 3);
        ctx.fill();
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx + 6, by + 4.5);
        ctx.lineTo(bx + 9, by + 7);
        ctx.lineTo(bx + 6, by + 9.5);
        ctx.moveTo(bx + 10, by + 4.5);
        ctx.lineTo(bx + 13, by + 7);
        ctx.lineTo(bx + 10, by + 9.5);
        ctx.stroke();
        ctx.fillStyle = '#a7f3d0';
        ctx.font = '700 9.5px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('দ্রুত', bx + 17, by + 10.5);
      } else if (isSlowed) {
        const bw = 46;
        const bx = p2.x - bw / 2;
        const by = nameY - 32;
        ctx.fillStyle = 'rgba(6, 11, 22, 0.9)';
        rr(ctx, bx, by, bw, 14, 3);
        ctx.fill();
        ctx.strokeStyle = '#f5b73d';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.strokeStyle = '#f5b73d';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(bx + 6, by + 5);
        ctx.lineTo(bx + 9.5, by + 8.5);
        ctx.lineTo(bx + 13, by + 5);
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.font = '700 9.5px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('ধীর', bx + 17, by + 10.5);
      }
    }
    ctx.restore();
  });
}

let lightCanvas: HTMLCanvasElement | null = null;
let lightCtx: CanvasRenderingContext2D | null = null;

export function viewScale(W: number, H: number): number {
  return Math.max(0.65, Math.min(1.65, Math.min(W / 660, (H * 0.78) / CH)));
}

export function renderWorld(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  world: GameWorld
): void {
  const me = world.me;
  const t = world.t;
  const doorsLocked = world.sabotage.doorLockedUntil > t;
  const lightsOut = world.sabotage.active === 'lights';
  const brakesAlarm = world.sabotage.active === 'brakes';

  // Smoothly interpolate sliding bulkhead door animation
  const targetDoor = doorsLocked ? 1 : 0;
  doorCloseProgress += (targetDoor - doorCloseProgress) * 0.16;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0, '#091124');
  skyGrad.addColorStop(1, '#040710');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Realistic metro car suspension micro-sway scaled by train speed
  const swayScale = 0.12 + 0.88 * world.trainSpeed;
  const railSwayY = (Math.sin(t * 7.6) * 0.85 + Math.sin(t * 15.2) * 0.35) * swayScale;

  const sc = viewScale(W, H);
  const shakeX = world.cam.shake > 0 ? (Math.random() - 0.5) * world.cam.shake * 10 : 0;
  const shakeY = world.cam.shake > 0 ? (Math.random() - 0.5) * world.cam.shake * 10 : 0;
  const ox = W / 2 - world.cam.x * sc + shakeX;
  const oy = H / 2 - world.cam.y * sc + shakeY + railSwayY;

  ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * ox, dpr * oy);

  const vx0 = world.cam.x - W / sc / 2 - 80;
  const vx1 = world.cam.x + W / sc / 2 + 80;
  const vy0 = world.cam.y - H / sc / 2 - 40;
  const vy1 = world.cam.y + H / sc / 2 + 40;

  drawScenery(ctx, world, vx0, vx1, vy0, vy1);

  for (let i = 0; i < N_COACHES; i++) {
    const x0 = i * STEP;
    if (x0 + CW + GW >= vx0 && x0 <= vx1) {
      drawCoach(ctx, i, world, t);
    }
  }

  // Directional angled shoeprints (suspect prints have faint crimson trace)
  world.footprints.forEach((fp) => {
    ctx.save();
    ctx.translate(fp.x, fp.y);
    ctx.rotate(fp.angle || 0);
    ctx.fillStyle = fp.suspect
      ? `rgba(239, 68, 68, ${fp.alpha * 0.34})`
      : `rgba(200, 220, 255, ${fp.alpha * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 2.5, 1.4, 0, 0, Math.PI * 2);
    ctx.ellipse(2.2, 0, 3.2, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Expanding shockwaves on steals / emergency alarm
  world.shockwaves.forEach((sw) => {
    ctx.save();
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = Math.max(0, sw.alpha);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(sw.x, sw.y, sw.r, sw.r * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  drawChainBox(ctx, world);

  [
    { pos: CCTV_CONSOLE, col: '#38bdf8' },
    { pos: RADAR_CONSOLE, col: '#4ade80' },
  ].forEach((c) => {
    ctx.strokeStyle = c.col;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
    ctx.beginPath();
    ctx.ellipse(c.pos.x, c.pos.y, 18, 9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  me.tasks.forEach((tk) => {
    if (tk.done) return;
    const s = tk.spot;
    const pu = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.strokeStyle = `rgba(245, 183, 61, ${0.5 + pu * 0.45})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 18 + pu * 3, 9 + pu * 1.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Crisp bobbing vector beacon diamond instead of plain text
    const by = s.y - 24 - pu * 4;
    ctx.save();
    ctx.translate(s.x, by);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = s.hard ? '#ef4444' : '#f5b73d';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeStyle = '#090e1b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.restore();
  });

  if (world.sabotage.active && world.sabotage.active !== 'doors') {
    SABOTAGE_SPOTS.forEach((sb) => {
      if (sb.type !== world.sabotage.active || world.sabotage.fixedParts[sb.id]) return;
      const pu = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.55 + pu * 0.45})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(sb.x, sb.y, 22 + pu * 4, 11 + pu * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  const occluders = getActiveOccluders(doorsLocked);
  const visionRadius = !me.alive
    ? 600
    : me.role === 'faker'
    ? lightsOut
      ? 430
      : 470
    : lightsOut
    ? 145
    : 390;

  drawEntities(ctx, world, t, occluders, visionRadius, true);

  world.particles.forEach((pt) => {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Swinging overhead Metro Hand Straps responding to train speed & braking inertia!
  for (const j of [2, 4, 5]) {
    const cx0 = j * STEP;
    if (cx0 + CW < vx0 || cx0 > vx1) continue;
    [CH * 0.33, CH * 0.67].forEach((by) => {
      for (let rx = 50; rx < CW - 30; rx += 42) {
        const swing =
          Math.sin(t * 2.9 + rx * 0.04) * (0.08 + 0.2 * world.trainSpeed) -
          (1 - world.trainSpeed) * 0.14;
        ctx.save();
        ctx.translate(cx0 + rx, by);
        ctx.rotate(swing);
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.48)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 8.5, 4.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // Vector seat arrow indicator (no emoji)
  const sm = me.seat;
  const seatLabelY = sm.side ? CH - BENCH - 3 : BENCH - 5;
  ctx.fillStyle = '#f5b73d';
  ctx.font = '700 10px "Hind Siliguri", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('আমার সিট', sm.x, seatLabelY);

  if (world.hold.task) {
    const mySt = getPlayerStatus(me, world);
    const hasTagAbove = mySt.hasteLeft > 0 || mySt.slowMultiplier < 0.99 || mySt.stunnedLeft > 0;
    const arcY = hasTagAbove ? me.y - 134 : me.y - 108;
    const pr = Math.min(1, world.hold.prog / world.hold.task.spot.dur);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(me.x, arcY, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#43c07a';
    ctx.beginPath();
    ctx.arc(me.x, arcY, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr);
    ctx.stroke();
  }

  // Dynamic 2D Raycasted Fog of War
  if (me.alive) {
    const pw = Math.max(1, Math.round(W));
    const ph = Math.max(1, Math.round(H));
    if (!lightCanvas) {
      lightCanvas = document.createElement('canvas');
      lightCtx = lightCanvas.getContext('2d');
    }
    if (lightCanvas && lightCtx) {
      if (lightCanvas.width !== pw || lightCanvas.height !== ph) {
        lightCanvas.width = pw;
        lightCanvas.height = ph;
      }
      const lc = lightCtx;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, pw, ph);
      lc.fillStyle = lightsOut ? 'rgba(4, 7, 15, 0.91)' : 'rgba(5, 9, 18, 0.56)';
      lc.fillRect(0, 0, pw, ph);

      const poly = computeVisibilityPolygon(me.x, me.y - 20, visionRadius, occluders);
      if (poly.length > 2) {
        lc.save();
        lc.setTransform(sc, 0, 0, sc, ox, oy);
        lc.globalCompositeOperation = 'destination-out';
        const rg = lc.createRadialGradient(
          me.x,
          me.y - 20,
          visionRadius * 0.25,
          me.x,
          me.y - 20,
          visionRadius
        );
        rg.addColorStop(0, 'rgba(0,0,0,1)');
        rg.addColorStop(0.75, 'rgba(0,0,0,0.88)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = rg;
        lc.beginPath();
        lc.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) {
          lc.lineTo(poly[i].x, poly[i].y);
        }
        lc.closePath();
        lc.fill();
        lc.restore();
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(lightCanvas, 0, 0, W, H);
    }
  } else {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = 'rgba(30, 48, 92, 0.16)';
    ctx.fillRect(0, 0, W, H);
  }

  if (me.alive && me.stunnedUntil > t) {
    const pulse = 0.16 + 0.12 * Math.abs(Math.sin(t * 14));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.28, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(56, 189, 248, 0)');
    vg.addColorStop(1, `rgba(56, 189, 248, ${pulse})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  if (brakesAlarm) {
    const pulse = Math.max(0, Math.sin(t * 7)) * 0.22;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(220, 38, 38, ${pulse})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (world.hitFlash > 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(239, 68, 68, ${world.hitFlash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function renderCameraFeed(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  world: GameWorld,
  camIdx: number
): void {
  const cam = CAMERAS[camIdx];
  if (!cam) return;
  ctx.save();
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, w, h);

  const sc = Math.min(w / 540, h / 320);
  ctx.translate(w / 2 - cam.viewX * sc, h / 2 - cam.viewY * sc);
  ctx.scale(sc, sc);

  drawCoach(ctx, cam.coach, world, world.t);
  const occ = getActiveOccluders(world.sabotage.doorLockedUntil > world.t);
  drawEntities(ctx, world, world.t, occ, 900, false);

  ctx.restore();

  ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }
  ctx.fillStyle = '#ef4444';
  if (Math.sin(world.t * 5) > 0) {
    ctx.beginPath();
    ctx.arc(16, 16, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 12px "Hind Siliguri", sans-serif';
  ctx.fillText(`REC · ${cam.name}`, 28, 20);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px "JetBrains Mono", monospace';
  ctx.fillText(STATIONS[world.stIdx], 12, h - 10);
}
