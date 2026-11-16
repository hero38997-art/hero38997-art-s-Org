import {
  BENCH,
  CCTV_CONSOLE,
  CH,
  CHAIN,
  COACH_NAMES,
  CW,
  HAZARD_ZONES,
  N_COACHES,
  RADAR_CONSOLE,
  SABOTAGE_SPOTS,
  STEP,
  VENTS,
  coachOf,
  getPlayerStatus,
  movePlayer,
  pick,
  rnd,
} from './mapData.ts';
import type { GameWorld, MeetingState, Player, SabotageType, StolenBody } from './types.ts';

export interface BotCallbacks {
  onFinishTask: (p: Player, taskIndex: number) => void;
  onSteal: (killer: Player, victim: Player) => void;
  onStartMeeting: (callerId: number, body: StolenBody | null) => void;
  onTriggerSabotage: (type: Exclude<SabotageType, null>, byBot?: boolean) => void;
  onFixSabotagePart: (spotId: string, byBot?: boolean) => void;
}

function byId(world: GameWorld, id: number): Player | undefined {
  return world.players.find((q) => q.id === id);
}

function segmentIntersectsBox(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  return maxX >= bx && minX <= bx + bw && maxY >= by && minY <= by + bh;
}

function waypoint(p: Player, tx: number, ty: number, doorsLocked: boolean): { x: number; y: number } {
  const cp = coachOf(p.x);
  const ct = coachOf(tx);
  const inGangway = p.x > cp * STEP + CW;
  if (cp === ct && !inGangway) {
    // Dodge Floor Hazard Zones naturally unless destination itself is inside the zone
    for (let i = 0; i < HAZARD_ZONES.length; i++) {
      const hz = HAZARD_ZONES[i];
      if (hz.coach !== cp) continue;
      const targetInside =
        tx >= hz.x - 6 && tx <= hz.x + hz.w + 6 && ty >= hz.y - 6 && ty <= hz.y + hz.h + 6;
      const selfInside = p.x >= hz.x && p.x <= hz.x + hz.w && p.y >= hz.y && p.y <= hz.y + hz.h;
      if (
        !targetInside &&
        !selfInside &&
        segmentIntersectsBox(p.x, p.y, tx, ty, hz.x - 8, hz.y - 6, hz.w + 16, hz.h + 12)
      ) {
        const topDetour = hz.y - 18;
        const botDetour = hz.y + hz.h + 18;
        const canTop = topDetour >= BENCH + 18;
        const canBot = botDetour <= CH - BENCH - 18;
        let detourY = CH / 2;
        if (canTop && canBot) {
          detourY = Math.abs(p.y - topDetour) < Math.abs(p.y - botDetour) ? topDetour : botDetour;
        } else if (canTop) {
          detourY = topDetour;
        } else if (canBot) {
          detourY = botDetour;
        }
        return { x: hz.x + hz.w / 2, y: detourY };
      }
    }
    return { x: tx, y: ty };
  }
  if (doorsLocked && !inGangway) {
    return { x: cp * STEP + CW / 2, y: CH / 2 };
  }
  if (inGangway) {
    return ct > cp
      ? { x: (cp + 1) * STEP + 48, y: CH / 2 }
      : { x: cp * STEP + CW - 48, y: CH / 2 };
  }
  if (ct > cp) {
    const gate = { x: cp * STEP + CW - 38, y: CH / 2 };
    if (p.x < gate.x - 16 || Math.abs(p.y - CH / 2) > 18) return gate;
    return { x: (cp + 1) * STEP + 48, y: CH / 2 };
  }
  const gate = { x: cp * STEP + 38, y: CH / 2 };
  if (p.x > gate.x + 16 || Math.abs(p.y - CH / 2) > 18) return gate;
  return { x: (cp - 1) * STEP + CW - 48, y: CH / 2 };
}

function steer(p: Player, tx: number, ty: number, dt: number, speed: number, doorsLocked: boolean): number {
  const wp = waypoint(p, tx, ty, doorsLocked);
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 6) {
    let vx = (dx / d) * speed;
    let vy = (dy / d) * speed;
    const ai = p.ai;
    if (ai.nudge > 0) {
      ai.nudge -= dt;
      vx += ai.nx * speed * 0.9;
      vy += ai.ny * speed * 0.9;
    }
    const ox = p.x;
    const oy = p.y;
    movePlayer(p, vx * dt, vy * dt, doorsLocked);
    if (Math.abs(vx) > 8) p.face = vx > 0 ? 1 : -1;
    p.moving = true;
    p.ph += dt;
    if (Math.hypot(p.x - ox, p.y - oy) < speed * dt * 0.22) {
      ai.stuck += dt;
      if (ai.stuck > 0.35) {
        ai.stuck = 0;
        ai.nudge = 0.65;
        const a = Math.random() * Math.PI * 2;
        ai.nx = Math.cos(a);
        ai.ny = Math.sin(a);
      }
    } else {
      ai.stuck = 0;
    }
  }
  return Math.hypot(tx - p.x, ty - p.y);
}

function witnessesNear(world: GameWorld, killer: Player, victim: Player, range = 235): number {
  let n = 0;
  for (let i = 0; i < world.players.length; i++) {
    const q = world.players[i];
    if (
      q.alive &&
      q !== killer &&
      q !== victim &&
      q.inVent === null &&
      q.role !== 'faker' &&
      Math.hypot(q.x - victim.x, q.y - victim.y) < range
    ) {
      n++;
    }
  }
  return n;
}

function updateBotMemory(p: Player, world: GameWorld): void {
  const ai = p.ai;
  if (!ai.sightings) ai.sightings = {};
  if (!ai.clearedIds) ai.clearedIds = [];
  if (!ai.lastScanSeen) ai.lastScanSeen = {};
  if (ai.tempo === undefined) ai.tempo = rnd(0.95, 1.06);

  const myCoach = coachOf(p.x);
  const sightRadius = world.sabotage.active === 'lights' && p.role !== 'faker' ? 145 : 265;

  for (let i = 0; i < world.players.length; i++) {
    const q = world.players[i];
    if (q === p || !q.alive) continue;
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (q.inVent === null && dist <= sightRadius && Math.abs(coachOf(q.x) - myCoach) <= 0) {
      ai.sightings[q.id] = { coach: coachOf(q.x), t: world.t };
      if (p.role !== 'faker') {
        // Witnessed biometric scan -> clear this player cleanly!
        if (q.scanningUntil > world.t && !ai.lastScanSeen[q.id]) {
          ai.lastScanSeen[q.id] = true;
          if (!ai.clearedIds.includes(q.id)) ai.clearedIds.push(q.id);
          p.known[q.id] = false;
          p.susp[q.id] = 0;
        }
        // Caught mid-steal lunge!
        if (q.lungeUntil > world.t && (p.susp[q.id] || 0) < 4) {
          p.susp[q.id] = Math.max(p.susp[q.id] || 0, 4);
        }
      }
    } else if (p.role !== 'faker' && q.inVent !== null && dist <= 165 && q.role === 'faker') {
      // Saw someone flicker near a vent
      const v = VENTS[q.inVent];
      if (v && (world.ventAnim[v.id] || 0) > 0.35 && Math.random() < 0.08) {
        p.susp[q.id] = (p.susp[q.id] || 0) + 2;
      }
    }
  }
}

function pickIsolatedVictim(p: Player, world: GameWorld): Player | null {
  const prey = world.players.filter((q) => q.alive && q.role !== 'faker' && q.inVent === null);
  if (!prey.length) return null;

  let best: Player | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < prey.length; i++) {
    const v = prey[i];
    const wCount = witnessesNear(world, p, v, 240);
    if (wCount > 0) continue; // Only pick genuinely isolated targets
    const vc = coachOf(v.x);
    const sameCoachCount = world.players.filter(
      (o) => o.alive && o !== p && o !== v && coachOf(o.x) === vc
    ).length;
    const dist = Math.hypot(v.x - p.x, v.y - p.y);
    let score = 400 - dist * 0.08 - sameCoachCount * 120;
    if (v.role === 'inspector') score += 65; // Priority threat removal
    if (!v.isMe) score += 10;
    score += rnd(-35, 35);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

function pickBotGoal(p: Player, world: GameWorld): void {
  const ai = p.ai;

  // Non-fakers rush Emergency Chain if they caught a Faker red-handed or confirmed via ticket check!
  if (p.alive && p.role !== 'faker' && p.chains > 0 && world.bodies.length === 0) {
    const confirmedFaker = world.players.find(
      (q) => q.alive && q !== p && (p.known[q.id] === true || (p.susp[q.id] || 0) >= 4)
    );
    if (confirmedFaker) {
      ai.goal = { kind: 'alarm', x: CHAIN.x, y: CHAIN.y };
      return;
    }
  }

  // Non-fakers prioritize fixing active critical sabotages
  if (
    p.alive &&
    p.role !== 'faker' &&
    world.sabotage.active &&
    world.sabotage.active !== 'doors' &&
    Math.random() < 0.84
  ) {
    const candidates = SABOTAGE_SPOTS.filter(
      (s) => s.type === world.sabotage.active && !world.sabotage.fixedParts[s.id]
    );
    if (candidates.length) {
      // Pick closest unfixed sabotage spot
      const sorted = candidates
        .slice()
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const sp = sorted[0];
      ai.goal = { kind: 'fix', sabSpot: sp, x: sp.x, y: sp.y };
      return;
    }
  }

  // Faker hunts isolated passengers smartly
  if (p.role === 'faker' && p.alive && p.coolSteal <= 3 && ai.huntCd <= 0 && Math.random() < 0.72) {
    const victim = pickIsolatedVictim(p, world);
    if (victim) {
      ai.goal = { kind: 'hunt', pid: victim.id, exp: world.t + 10 };
      ai.huntCd = 11;
      return;
    }
  }

  // Occasionally inspect CCTV or Coach Radar (like observant human crewmates, or fakers faking info)
  if (
    p.alive &&
    (ai.watchCd || 0) <= 0 &&
    world.sabotage.active !== 'comms' &&
    Math.random() < 0.22
  ) {
    const consolePos = Math.random() < 0.62 ? CCTV_CONSOLE : RADAR_CONSOLE;
    ai.watchCd = rnd(18, 30);
    ai.goal = { kind: 'watch', x: consolePos.x, y: consolePos.y };
    return;
  }

  const undone = p.tasks.filter((t) => !t.done);
  if (undone.length && Math.random() < 0.88) {
    // Crew often picks nearer or random undone tasks
    const sorted = undone
      .slice()
      .sort((a, b) => Math.hypot(a.spot.x - p.x, a.spot.y - p.y) - Math.hypot(b.spot.x - p.x, b.spot.y - p.y));
    const task = Math.random() < 0.55 ? sorted[0] : pick(undone);
    ai.goal = { kind: 'task', task, x: task.spot.x, y: task.spot.y };
  } else {
    const c = (Math.random() * N_COACHES) | 0;
    ai.goal = {
      kind: 'wander',
      x: c * STEP + rnd(85, CW - 85),
      y: rnd(BENCH + 28, CH - BENCH - 28),
    };
  }
}

export function updateBot(
  p: Player,
  dt: number,
  world: GameWorld,
  cb: BotCallbacks
): void {
  const ai = p.ai;
  const doorsLocked = world.sabotage.doorLockedUntil > world.t;
  const st = getPlayerStatus(p, world);
  p.speedMul = st.speedMultiplier;
  p.slowReason = st.slowReason;
  p.moving = false;
  ai.huntCd -= dt;
  ai.chkCd -= dt;
  if (ai.watchCd && ai.watchCd > 0) ai.watchCd -= dt;

  updateBotMemory(p, world);

  if (st.stunnedLeft > 0) {
    return;
  }

  // Handle Bot hiding inside a vent cleanly (only Faker bots vent)
  if (p.inVent !== null) {
    ai.ventStay = (ai.ventStay || 0) - dt;
    if (ai.ventStay <= 0) {
      const curVent = VENTS[p.inVent];
      const coastClear = !world.players.some(
        (q) =>
          q.alive &&
          q.role !== 'faker' &&
          q.inVent === null &&
          Math.hypot(q.x - p.x, q.y - p.y) < 185
      );
      if (coastClear) {
        if (curVent) world.ventAnim[curVent.id] = 1;
        p.inVent = null;
        const escapeCoach = Math.max(0, Math.min(N_COACHES - 1, coachOf(p.x) + (Math.random() < 0.5 ? 1 : -1)));
        ai.goal = {
          kind: 'wander',
          x: escapeCoach * STEP + rnd(95, CW - 95),
          y: rnd(BENCH + 30, CH - BENCH - 30),
        };
      } else if (curVent) {
        // Hop to another linked vent if someone is camping nearby!
        const nextId = pick(curVent.links);
        const nextV = VENTS[nextId];
        if (nextV) {
          p.inVent = nextV.id;
          p.x = nextV.x;
          p.y = nextV.y;
          world.ventAnim[nextV.id] = 1;
          ai.ventStay = rnd(0.8, 1.5);
        }
      }
    }
    return;
  }

  // Strategic Bot Faker Sabotage Triggers
  if (p.alive && p.role === 'faker' && !world.sabotage.active && world.sabotage.cooldown <= 0) {
    const myCoach = coachOf(p.x);
    const nonFakersInCoach = world.players.filter(
      (q) => q.alive && q.role !== 'faker' && coachOf(q.x) === myCoach
    );
    if (
      nonFakersInCoach.length === 1 &&
      p.coolSteal <= 3 &&
      !doorsLocked &&
      Math.random() < dt * 0.45
    ) {
      // Ambush trap! Lock bulkhead doors to isolate a single passenger
      cb.onTriggerSabotage('doors', true);
    } else if (Math.random() < dt * 0.06) {
      const choice: Array<Exclude<SabotageType, null>> =
        world.t > 45 ? ['lights', 'brakes', 'comms', 'doors'] : ['lights', 'comms', 'doors'];
      cb.onTriggerSabotage(pick(choice), true);
    }
  }

  if (ai.wait > 0) {
    ai.wait -= dt;
    if (ai.wait <= 0 && ai.goal) {
      if (ai.goal.kind === 'task' && ai.goal.task) {
        const idx = p.tasks.indexOf(ai.goal.task);
        if (idx >= 0) cb.onFinishTask(p, idx);
      } else if (ai.goal.kind === 'fix' && ai.goal.sabSpot) {
        cb.onFixSabotagePart(ai.goal.sabSpot.id, true);
      }
      ai.goal = null;
    }
    return;
  }

  // Report nearby stolen bag + evaluate recent suspects in that coach
  if (p.alive) {
    let nearBody: StolenBody | null = null;
    for (let i = 0; i < world.bodies.length; i++) {
      if (Math.hypot(world.bodies[i].x - p.x, world.bodies[i].y - p.y) < 110) {
        nearBody = world.bodies[i];
        break;
      }
    }
    if (nearBody) {
      if (p.role !== 'faker' && ai.sightings) {
        const bodyCoach = coachOf(nearBody.x);
        for (const sidStr in ai.sightings) {
          const sid = Number(sidStr);
          const s = ai.sightings[sid];
          if (
            s.coach === bodyCoach &&
            world.t - s.t < 15 &&
            !(ai.clearedIds || []).includes(sid)
          ) {
            p.susp[sid] = Math.max(p.susp[sid] || 0, 2);
          }
        }
      }
      if (!ai.reportT) {
        ai.reportT = world.t + rnd(0.55, 1.5);
        // Fakers usually flee instead of self-reporting, unless pretending innocent (~16%)
        ai.rep = p.role !== 'faker' || Math.random() < 0.16;
      }
      if (ai.rep && world.t >= ai.reportT) {
        cb.onStartMeeting(p.id, nearBody);
        return;
      }
    } else {
      ai.reportT = 0;
    }
  }

  // Smart Inspector bot ticket checks (prioritize un-checked suspects)
  if (p.alive && p.role === 'inspector' && ai.chkCd <= 0 && p.uses > 0) {
    let best: Player | null = null;
    let bestRank = -Infinity;
    world.players.forEach((q) => {
      if (q === p || !q.alive || q.inVent !== null || p.known[q.id] !== undefined) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < 66) {
        const rank = (p.susp[q.id] || 0) * 50 - d;
        if (rank > bestRank) {
          bestRank = rank;
          best = q;
        }
      }
    });
    if (best) {
      const target = best as Player;
      p.known[target.id] = target.role === 'faker';
      p.uses--;
      ai.chkCd = 15;
    }
  }

  if (!ai.goal) pickBotGoal(p, world);
  const g = ai.goal;
  if (!g) return;

  const tempo = ai.tempo || 1;
  const walkSpeed = 122 * tempo * st.speedMultiplier;
  const chaseSpeed = 136 * tempo * st.speedMultiplier;

  if (g.kind === 'hunt' && g.pid !== undefined) {
    const v = byId(world, g.pid);
    if (!v || !v.alive || v.inVent !== null || world.t > (g.exp || 0) || !p.alive) {
      ai.goal = null;
      return;
    }
    const dist = steer(p, v.x, v.y, dt, chaseSpeed, doorsLocked);
    if (dist < 42 && p.coolSteal <= 0 && witnessesNear(world, p, v, 210) === 0) {
      cb.onSteal(p, v);
      ai.huntCd = 10;
      // Post-kill escape: Vent if safe & close, otherwise flee to a distant coach!
      const nearbyVent = VENTS.find((vn) => Math.hypot(vn.x - p.x, vn.y - p.y) < 175);
      const anyWatcher = world.players.some(
        (q) =>
          q.alive &&
          q.role !== 'faker' &&
          q !== v &&
          Math.hypot(q.x - (nearbyVent?.x || p.x), q.y - (nearbyVent?.y || p.y)) < 225
      );
      if (nearbyVent && !anyWatcher) {
        ai.goal = { kind: 'vent', ventId: nearbyVent.id, x: nearbyVent.x, y: nearbyVent.y };
      } else {
        const farCoach = coachOf(p.x) >= 3 ? (Math.random() * 2) | 0 : 4 + ((Math.random() * 3) | 0);
        ai.goal = {
          kind: 'flee',
          x: farCoach * STEP + rnd(100, CW - 100),
          y: rnd(BENCH + 28, CH - BENCH - 28),
        };
      }
    }
    return;
  }

  if (g.kind === 'vent' && g.ventId !== undefined && g.x !== undefined && g.y !== undefined) {
    const dist = steer(p, g.x, g.y, dt, chaseSpeed, doorsLocked);
    if (dist < 22) {
      const vn = VENTS[g.ventId];
      if (vn) {
        world.ventAnim[vn.id] = 1;
        const destId = pick(vn.links);
        const destV = VENTS[destId] || vn;
        p.inVent = destV.id;
        p.x = destV.x;
        p.y = destV.y;
        world.ventAnim[destV.id] = 1;
        ai.ventStay = rnd(0.9, 1.6);
        ai.goal = null;
      }
    }
    return;
  }

  if (g.kind === 'alarm' && g.x !== undefined && g.y !== undefined) {
    const dist = steer(p, g.x, g.y, dt, chaseSpeed, doorsLocked);
    if (dist < 42) {
      if (p.chains > 0 && world.bodies.length === 0) {
        p.chains--;
        ai.goal = null;
        cb.onStartMeeting(p.id, null);
      } else {
        ai.goal = null;
      }
    }
    return;
  }

  if (g.x !== undefined && g.y !== undefined) {
    const moveSp = g.kind === 'flee' ? chaseSpeed : walkSpeed;
    const d2 = steer(p, g.x, g.y, dt, moveSp, doorsLocked);
    if (d2 < 24) {
      if (g.kind === 'task' && g.task) {
        if (g.task.spot.type === 'scan' && p.role !== 'faker') {
          p.scanningUntil = world.t + 3.5;
        }
        ai.wait = Math.max(2.0, g.task.spot.dur / 1000 + rnd(0.15, 0.7));
      } else if (g.kind === 'fix') {
        ai.wait = rnd(1.4, 2.2);
      } else if (g.kind === 'watch') {
        ai.wait = rnd(2.2, 3.6);
      } else if (g.kind === 'flee') {
        ai.wait = rnd(0.5, 1.3);
        ai.goal = null;
      } else {
        ai.wait = rnd(0.5, 1.6);
        ai.goal = null;
      }
    }
  }
}

export function generateBotLines(p: Player, world: GameWorld, m: MeetingState): string[] {
  const out: string[] = [];
  const al = world.players.filter((q) => q.alive && q.id !== p.id);
  const sightings = p.ai.sightings || {};
  const clearedIds = p.ai.clearedIds || [];

  // Find someone recently seen in the same coach to vouch or reference organically
  let nearbyBuddy: { name: string; coach: number } | null = null;
  for (let i = 0; i < al.length; i++) {
    const q = al[i];
    const sg = sightings[q.id];
    if (sg && world.t - sg.t < 20) {
      nearbyBuddy = { name: q.name, coach: sg.coach };
      break;
    }
  }

  if (p.role !== 'faker') {
    let kf: number | null = null;
    let kc: number | null = null;
    for (const k in p.known) {
      const kid = Number(k);
      if (p.known[kid] === true && byId(world, kid)?.alive) kf = kid;
      else if (p.known[kid] === false && byId(world, kid)?.alive) kc = kid;
    }

    let top: number | null = null;
    let ts = 0;
    for (const s in p.susp) {
      const sid = Number(s);
      if (byId(world, sid)?.alive && !clearedIds.includes(sid) && p.susp[sid] > ts) {
        ts = p.susp[sid];
        top = sid;
      }
    }

    const kfP = kf !== null ? byId(world, kf) : undefined;
    const kcP = kc !== null ? byId(world, kc) : undefined;
    const topP = top !== null ? byId(world, top) : undefined;

    if (m.callerId === p.id) {
      if (m.body) {
        const bc = COACH_NAMES[coachOf(m.body.x)];
        out.push(
          pick([
            `${bc}-এ ব্যাগটা পড়ে থাকতে দেখে রিপোর্ট করলাম! ওদিকে কে কে ছিলে?`,
            `${bc}-এ ${m.body.name}-এর ব্যাগ পড়ে ছিল! আশেপাশে কেউ কাউকে বের হতে দেখেছো?`,
          ])
        );
      } else if (kfP?.alive) {
        out.push(`জরুরি ডেকেছি কারণ আমি ${kfP.name}-এর টিকেট চেক করেছি—ওর টিকেট ভুয়া!`);
      } else if (topP?.alive) {
        out.push(`সবাই সাবধান! ${topP.name}-এর আচরণ একদম স্বাভাবিক মনে হয়নি।`);
      }
    }

    if (kfP?.alive && m.callerId !== p.id) {
      out.push(
        pick([
          `শোনো সবাই, আমি টিকেট চেক করে নিশ্চিত হয়েছি—${kfP.name}-এর টিকেট ভুয়া! ওকে ভোট দাও।`,
          `আমি পরিদর্শক, ${kfP.name} ধরা পড়েছে! ওর টিকেট নকল।`,
        ])
      );
    } else if (topP?.alive && ts >= 2) {
      const sg = sightings[topP.id];
      if (sg && m.body && sg.coach === coachOf(m.body.x)) {
        out.push(`ঘটনার একটু আগেই ${topP.name}-কে ${COACH_NAMES[sg.coach]}-এ দেখেছিলাম, ওকে সন্দেহ হচ্ছে!`);
      } else {
        out.push(
          pick([
            `${topP.name}-কে দেখে বেশ সন্দেহ হচ্ছে, ও তাড়াহুড়ো করে সরে যাচ্ছিল!`,
            `সত্যি বলতে ${topP.name}-এর গতিবিধি আমার একদম সুবিধার মনে হচ্ছে না।`,
          ])
        );
      }
    } else {
      const myCoachName = COACH_NAMES[p.lastCoach];
      if (nearbyBuddy) {
        out.push(
          pick([
            `আমি ${myCoachName}-এ কাজ করছিলাম, ${nearbyBuddy.name}-কে ${COACH_NAMES[nearbyBuddy.coach]}-এ দেখেছি।`,
            `${myCoachName}-এ ছিলাম—একটু আগে ${nearbyBuddy.name}-ও আশেপাশেই ছিল।`,
          ])
        );
      } else {
        out.push(
          pick([
            `আমি ${myCoachName}-এ টাস্ক করছিলাম, ওদিকে অস্বাভাবিক কিছু চোখে পড়েনি।`,
            `${myCoachName}-এ নিজের কাজ শেষ করছিলাম। কেউ কোনো সূত্র পেয়েছো?`,
          ])
        );
      }
    }

    if (kcP?.alive && p.role === 'inspector' && Math.random() < 0.7) {
      out.push(`${kcP.name}-এর টিকেট চেক করেছি, ও নির্দোষ।`);
    } else if (clearedIds.length && Math.random() < 0.65) {
      const cP = byId(world, clearedIds[0]);
      if (cP?.alive) {
        out.push(`${cP.name} লেডিস কোচে স্ক্যান করেছে, ওকে নিয়ে সন্দেহ করার দরকার নেই।`);
      }
    }
  } else {
    // Clever Faker Alibi & Misdirection
    const inn = al.filter((q) => q.role !== 'faker');
    const myCoachName = COACH_NAMES[p.lastCoach];
    if (nearbyBuddy) {
      out.push(
        pick([
          `আমি ${myCoachName}-এ কাজ করছিলাম, ${nearbyBuddy.name} আমাকে দেখেছে!`,
          `${myCoachName}-এ ছিলাম ভাই, একটু আগে ${nearbyBuddy.name}-কেও দেখলাম।`,
        ])
      );
    } else {
      out.push(
        pick([
          `আমি ${myCoachName}-এ টাস্ক করছিলাম, এদিকে সব স্বাভাবিক ছিল।`,
          `আমার কাজ প্রায় শেষের দিকে, ${myCoachName}-এ ছিলাম তখন।`,
        ])
      );
    }

    if (inn.length && Math.random() < 0.72) {
      const scapegoat = pick(inn);
      out.push(
        pick([
          `${scapegoat.name} বারবার কোচ বদলাচ্ছে, ওর দিকে একটু নজর রাখা উচিত।`,
          `জানি না ঠিকমতো, তবে ${scapegoat.name}-কে বেশ অস্থির মনে হলো।`,
          `কেউ কি ${scapegoat.name}-কে ঘটনাস্থলের দিকে যেতে দেখেছো?`,
        ])
      );
    }
  }

  if (Math.random() < 0.35 && out.length < 2) {
    out.push(
      pick([
        'প্রমাণ ছাড়া ভুল মানুষকে নামালে চোর জিতে যাবে, ভেবেচিন্তে ভোট দাও।',
        'কেউ সিসিটিভি বা কোচ রাডারে কিছু দেখে থাকলে দ্রুত বলো।',
        'হাতে শক্ত প্রমাণ না থাকলে স্কিপ করাই নিরাপদ হতে পারে।',
      ])
    );
  }
  return out;
}

export function generateReactiveBotReplies(
  speakerId: number,
  text: string,
  world: GameWorld,
  m: MeetingState,
  elapsedSec: number
): void {
  const speaker = byId(world, speakerId);
  if (!speaker || !speaker.alive) return;

  const isBotPlayer = (q: Player): boolean => {
    const maybeBot = (q as Player & { isBot?: boolean }).isBot;
    return maybeBot !== undefined ? maybeBot : !q.isMe;
  };

  // Don't flood chat if too many reactions are already queued
  const pendingCount = m.sched.filter((s) => !s.done).length;
  if (pendingCount >= 6) return;

  const al = world.players.filter((q) => q.alive && isBotPlayer(q) && q.id !== speakerId);
  const mentionedBots = al.filter((q) => text.includes(q.name));

  // 1) Accused bot defends themselves naturally!
  if (mentionedBots.length) {
    const target = mentionedBots[0];
    const alreadyScheduled = m.sched.some((s) => !s.done && s.pid === target.id && s.at - elapsedSec < 5);
    if (!alreadyScheduled) {
      let defense = '';
      if (target.role === 'faker') {
        defense = pick([
          `${speaker.name}, অযথা আমাকে ফাঁসিও না! আমি ${COACH_NAMES[target.lastCoach]}-এ ছিলাম।`,
          `আরে না! আমি কাজ করছিলাম—উল্টো ${speaker.name} এত তাড়াহুড়ো করছে কেন?`,
          `ভুল বুঝছো ${speaker.name}, আমার টিকেট একদম ঠিক আছে!`,
        ]);
      } else {
        const sg = target.ai.sightings || {};
        const buddy = world.players.find(
          (b) => b.alive && b !== target && sg[b.id] && world.t - sg[b.id].t < 24
        );
        defense = buddy
          ? `আরে আমি তো ${COACH_NAMES[target.lastCoach]}-এ ছিলাম, ${buddy.name}-ও দেখেছে! ভুল সন্দেহ করো না।`
          : pick([
              `একদমই না ${speaker.name}! আমি ${COACH_NAMES[target.lastCoach]}-এ কাজ করছিলাম।`,
              `প্রমাণ ছাড়া আমাকে ভোট দিলে পরে পস্তাবে, আমি সাধারণ যাত্রী!`,
            ]);
      }
      m.sched.push({
        at: elapsedSec + rnd(1.5, 3.3),
        pid: target.id,
        text: defense,
        done: false,
      });
    }

    // If an innocent bystander saw the accused doing a Scan, defend them!
    const defender = al.find(
      (q) =>
        q.id !== target.id &&
        q.role !== 'faker' &&
        (q.known[target.id] === false || (q.ai.clearedIds || []).includes(target.id))
    );
    if (defender && Math.random() < 0.85) {
      m.sched.push({
        at: elapsedSec + rnd(2.4, 4.4),
        pid: defender.id,
        text: `থামো সবাই, ${target.name} নির্দোষ! আমি ওকে নিজে পরিষ্কার দেখেছি।`,
        done: false,
      });
    }
    return;
  }

  // 2) If someone asks a question ("কোথায়", "কে", "দেখছো", "?") -> 1 observant bot answers
  if (
    text.includes('কোথায়') ||
    text.includes('কই') ||
    text.includes('দেখছো') ||
    text.includes('সন্দেহ') ||
    text.includes('?')
  ) {
    const responder = al.length ? pick(al) : undefined;
    if (responder) {
      const already = m.sched.some((s) => !s.done && s.pid === responder.id);
      if (!already) {
        m.sched.push({
          at: elapsedSec + rnd(1.6, 3.6),
          pid: responder.id,
          text: `আমি ${COACH_NAMES[responder.lastCoach]}-এর দিকেই ছিলাম, আপাতত পরিষ্কার প্রমাণ নেই।`,
          done: false,
        });
      }
    }
  }
}

export function botVoteDecision(p: Player, world: GameWorld, m: MeetingState): number {
  const al = world.players.filter((q) => q.alive && q.id !== p.id);
  const clearedIds = p.ai.clearedIds || [];

  const mostMentioned = (list: Player[]) => {
    let best: number | null = null;
    let b = 0;
    list.forEach((q) => {
      const c = m.mention[q.id] || 0;
      if (c > b) {
        b = c;
        best = q.id;
      }
    });
    return { best, count: b };
  };

  if (p.role === 'faker') {
    const inn = al.filter((q) => q.role !== 'faker');
    const mt = mostMentioned(inn);
    if (mt.best !== null && mt.count >= 1 && Math.random() < 0.78) return mt.best;
    // Skip if nobody has heat, or vote one quiet innocent if late-game
    if (al.length <= 3 && inn.length) return pick(inn).id;
    return Math.random() < 0.35 || !inn.length ? -1 : pick(inn).id;
  }

  // Hard inspector proof always wins!
  for (const k in p.known) {
    const kid = Number(k);
    if (p.known[kid] === true && byId(world, kid)?.alive) return kid;
  }

  // Score suspects using witness/sighting suspicion + meeting mentions (respecting cleared alibis)
  let best = -1;
  let bestScore = 0;
  al.forEach((q) => {
    const isCleared = p.known[q.id] === false || clearedIds.includes(q.id);
    if (isCleared) return;
    const suspScore = (p.susp[q.id] || 0) * 2;
    const mentionScore = (m.mention[q.id] || 0) * 0.9;
    const total = suspScore + mentionScore;
    if (total > bestScore) {
      bestScore = total;
      best = q.id;
    }
  });

  if (best >= 0 && bestScore >= 2.6) return best;

  const mt2 = mostMentioned(al.filter((q) => p.known[q.id] !== false && !clearedIds.includes(q.id)));
  if (mt2.best !== null && mt2.count >= 2 && Math.random() < 0.68) return mt2.best;

  // Smart crewmates skip instead of blindly ejecting innocents when evidence is weak!
  return Math.random() < 0.78 || !al.length ? -1 : pick(al).id;
}
