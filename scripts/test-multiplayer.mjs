import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';
const STEP = 944;
const BENCH = 68;
const CH = 360;

const SPOT_COORDS = {
  0: { x: 0 * STEP + 310, y: BENCH + 20 },
  1: { x: 0 * STEP + 640, y: CH - BENCH - 20 },
  2: { x: 1 * STEP + 260, y: 162 },
  3: { x: 1 * STEP + 760, y: CH - BENCH - 22 },
  4: { x: 1 * STEP + 440, y: BENCH + 56 },
  5: { x: 2 * STEP + 190, y: BENCH + 18 },
  6: { x: 2 * STEP + 640, y: CH - BENCH - 18 },
  7: { x: 2 * STEP + 430, y: CH - BENCH - 18 },
  8: { x: 3 * STEP + 190, y: BENCH + 84 },
  9: { x: 3 * STEP + 430, y: CH - BENCH - 20 },
  10: { x: 4 * STEP + 170, y: BENCH + 18 },
  11: { x: 4 * STEP + 670, y: CH - BENCH - 18 },
  12: { x: 4 * STEP + 430, y: BENCH + 18 },
  13: { x: 5 * STEP + 660, y: CH / 2 + 64 },
  14: { x: 5 * STEP + 185, y: CH - BENCH - 18 },
  15: { x: 5 * STEP + 460, y: BENCH + 18 },
  16: { x: 6 * STEP + 655, y: CH / 2 - 64 },
  17: { x: 6 * STEP + 190, y: BENCH + 20 },
};

function connectClient(label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const messages = [];
    const waiters = [];

    const client = {
      label,
      ws,
      id: null,
      token: null,
      role: null,
      tasks: [],
      lastState: null,
      send(obj) {
        ws.send(JSON.stringify(obj));
      },
      waitFor(predicate, timeoutMs = 25000) {
        const idx = messages.findIndex(predicate);
        if (idx >= 0) {
          return Promise.resolve(messages[idx]);
        }
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            rej(new Error(`[${label}] Timed out waiting for message (${timeoutMs}ms)`));
          }, timeoutMs);
          waiters.push({ predicate, res, timer });
        });
      },
      waitForNew(predicate, timeoutMs = 15000) {
        const startIdx = messages.length;
        return new Promise((res, rej) => {
          for (let i = startIdx; i < messages.length; i++) {
            if (predicate(messages[i])) return res(messages[i]);
          }
          const timer = setTimeout(() => {
            rej(new Error(`[${label}] Timed out waiting for new message (${timeoutMs}ms)`));
          }, timeoutMs);
          waiters.push({ predicate, res, timer });
        });
      },
      close() {
        ws.close();
      },
    };

    ws.on('open', () => resolve(client));
    ws.on('error', reject);
    ws.on('message', (buf) => {
      const msg = JSON.parse(buf.toString('utf8'));
      messages.push(msg);
      if (msg.type === 'welcome') {
        client.id = msg.playerId;
        client.token = msg.token;
      } else if (msg.type === 'role') {
        client.role = msg.role;
        client.tasks = msg.tasks || [];
      } else if (msg.type === 'state') {
        client.lastState = msg;
      }

      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(msg)) {
          clearTimeout(waiters[i].timer);
          const w = waiters[i];
          waiters.splice(i, 1);
          w.res(msg);
        }
      }
    });
  });
}

async function steerTo(client, targetX, targetY, stopDist = 48, timeoutMs = 30000) {
  const startMoveAt = Date.now();
  let seq = 1;
  let lastX = 0;
  let lastY = 0;
  let stuckTicks = 0;
  while (Date.now() - startMoveAt < timeoutMs) {
    const st = client.lastState;
    const me = st?.players?.find((p) => p.id === client.id);
    if (me) {
      if (Math.hypot(me.x - lastX, me.y - lastY) < 1.5) stuckTicks++;
      else stuckTicks = 0;
      lastX = me.x;
      lastY = me.y;

      const dx = targetX - me.x;
      const dy = targetY - me.y;
      if (Math.hypot(dx, dy) < stopDist) {
        client.send({ type: 'input', dx: 0, dy: 0, seq: seq++ });
        return me;
      }
      const sameCoach = Math.floor(me.x / STEP) === Math.floor(targetX / STEP);
      let vx = dx;
      let vy = sameCoach ? dy : 180 - me.y;
      if (!sameCoach && Math.abs(180 - me.y) > 14) {
        vx = 0;
      }
      if (stuckTicks > 3) {
        vx = dx >= 0 ? 1 : -1;
        vy = stuckTicks % 2 === 0 ? 1 : -1;
      }
      const mag = Math.hypot(vx, vy) || 1;
      client.send({ type: 'input', dx: vx / mag, dy: vy / mag, seq: seq++ });
    }
    await new Promise((r) => setTimeout(r, 70));
  }
  throw new Error(`[${client.label}] Failed to steer to (${targetX}, ${targetY}) within ${timeoutMs}ms`);
}

async function main() {
  console.log(`Connecting 5 simulated clients to ${WS_URL}...`);
  const clients = await Promise.all([
    connectClient('P1'),
    connectClient('P2'),
    connectClient('P3'),
    connectClient('P4'),
    connectClient('P5-KickTarget'),
  ]);

  let active = [];
  try {
    // 1. P1 creates a Private Team Room with Team Name
    clients[0].send({
      type: 'create_private',
      name: 'রাহিম',
      teamName: 'টিম ঢাকা এক্স',
      color: 0,
      acc: 1,
      skin: 0,
      fillBots: false,
      maxPlayers: 5,
    });
    await clients[0].waitFor((m) => m.type === 'welcome');
    const roomMsg = await clients[0].waitFor((m) => m.type === 'room' && m.teamName === 'টিম ঢাকা এক্স');
    const code = roomMsg.code;
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      throw new Error(`Invalid room code format: ${code}`);
    }
    console.log(`[1] Private Team Room created: "${roomMsg.teamName}" (${code})`);

    // 2. Join P2, P3, P4, P5
    const names = ['সুমি', 'তানভীর', 'নাদিয়া', 'রানা'];
    for (let i = 1; i < 5; i++) {
      clients[i].send({
        type: 'join_private',
        code,
        name: names[i - 1],
        color: i,
        acc: i,
        skin: 1,
      });
      await clients[i].waitFor((m) => m.type === 'welcome');
    }
    await clients[0].waitFor((m) => m.type === 'room' && m.players.length === 5);

    // 3. Test Lobby Reconnection (disconnect P2 while in lobby and rejoin via token)
    const p2Token = clients[1].token;
    const p2Id = clients[1].id;
    clients[1].close();
    await new Promise((r) => setTimeout(r, 250));
    await clients[0].waitFor(
      (m) => m.type === 'room' && m.players.some((p) => p.id === p2Id && p.connected === false)
    );
    clients[1] = await connectClient('P2-LobbyRejoined');
    clients[1].send({ type: 'rejoin', token: p2Token });
    await clients[1].waitFor((m) => m.type === 'welcome' && m.playerId === p2Id);
    await clients[1].waitFor(
      (m) => m.type === 'room' && m.code === code && m.players.some((p) => p.id === p2Id && p.connected === true)
    );
    console.log('[2] Lobby Reconnection verified for P2.');

    // 4. Test Team Management: toggle_ready, lobby_chat, update_room, kick P5, transfer_host
    clients[1].send({ type: 'toggle_ready' });
    await clients[0].waitFor(
      (m) => m.type === 'room' && m.players.find((p) => p.id === p2Id)?.ready === true
    );
    clients[1].send({ type: 'lobby_chat', text: 'সবাই প্রস্তুত?' });
    await clients[0].waitFor((m) => m.type === 'lobby_chat' && m.entry?.text === 'সবাই প্রস্তুত?');
    clients[0].send({ type: 'kick', targetId: clients[4].id });
    await clients[4].waitFor((m) => m.type === 'kicked');
    clients[4].close();
    clients[0].send({ type: 'update_room', teamName: 'মেট্রো স্কোয়াড', maxPlayers: 4, fillBots: false });
    await clients[1].waitFor(
      (m) => m.type === 'room' && m.teamName === 'মেট্রো স্কোয়াড' && m.maxPlayers === 4
    );
    clients[0].send({ type: 'transfer_host', targetId: p2Id });
    await clients[1].waitFor((m) => m.type === 'room' && m.hostId === p2Id);
    // Transfer host back to P1
    clients[1].send({ type: 'transfer_host', targetId: clients[0].id });
    await clients[0].waitFor((m) => m.type === 'room' && m.hostId === clients[0].id);
    console.log('[3] Team Management (Ready, Chat, Settings, Kick, Transfer Host) verified.');

    active = clients.slice(0, 4);

    // 5. Host starts match -> verify strict role assignment & secrecy
    active[0].send({ type: 'start' });
    await Promise.all(active.map((c) => c.waitFor((m) => m.type === 'role')));

    const roles = active.map((c) => c.role);
    const fakerCount = roles.filter((r) => r === 'faker').length;
    const inspCount = roles.filter((r) => r === 'inspector').length;
    if (fakerCount !== 1 || inspCount !== 1) {
      throw new Error(`Unexpected role distribution: ${JSON.stringify(roles)}`);
    }
    console.log(`[4] Roles assigned securely: ${roles.join(', ')}`);

    // 6. Verify 20Hz state snapshots omit roles/others' tasks & include self.tasksDone
    const state1 = await active[0].waitFor((m) => m.type === 'state');
    for (const sp of state1.players) {
      if ('role' in sp || 'tasks' in sp || 'known' in sp) {
        throw new Error('SECURITY LEAK: state snapshot contained secret fields!');
      }
    }
    if (!Array.isArray(state1.self?.tasksDone) || state1.self.tasksDone.some(Boolean)) {
      throw new Error(`Invalid initial tasksDone: ${JSON.stringify(state1.self?.tasksDone)}`);
    }
    console.log('[5] State snapshot privacy & tasksDone array verified.');

    // 7. Test Task Sync: Out-of-range task_complete MUST reject & stay incomplete; In-range MUST ack & update doneTasks!
    const caller = active.find((c) => c.role !== 'faker') || active[0];
    const stNow = await caller.waitFor((m) => m.type === 'state');
    const mePos = stNow.players.find((p) => p.id === caller.id);
    const sortedTasks = caller.tasks
      .map((tk, idx) => ({
        idx,
        spotId: tk.spotId,
        dist: Math.hypot(SPOT_COORDS[tk.spotId].x - mePos.x, SPOT_COORDS[tk.spotId].y - mePos.y),
      }))
      .sort((a, b) => b.dist - a.dist);

    const farTask = sortedTasks[0];
    const farRejPromise = caller.waitForNew((m) => m.type === 'private' && m.kind === 'task_reject');
    caller.send({ type: 'task_complete', taskIndex: farTask.idx });
    const rej = await farRejPromise;
    if (rej.taskIndex !== farTask.idx) {
      throw new Error(`Expected task_reject for ${farTask.idx}, got ${JSON.stringify(rej)}`);
    }
    const postRejState = await caller.waitForNew((m) => m.type === 'state');
    if (postRejState.self.tasksDone[farTask.idx] !== false) {
      throw new Error('Rejected task unexpectedly marked done in server snapshot!');
    }

    const nearTask = sortedTasks[sortedTasks.length - 1];
    const nearPos = SPOT_COORDS[nearTask.spotId];
    console.log(`[6] Steering ${caller.label} to task #${nearTask.idx} (spot ${nearTask.spotId})...`);
    await steerTo(caller, nearPos.x, nearPos.y, 55, 25000);
    const ackPromise = caller.waitForNew((m) => m.type === 'private' && m.kind === 'task_ack');
    caller.send({ type: 'task_complete', taskIndex: nearTask.idx });
    const ack = await ackPromise;
    if (ack.taskIndex !== nearTask.idx) {
      throw new Error(`Expected task_ack for ${nearTask.idx}, got ${JSON.stringify(ack)}`);
    }
    const postAckState = await caller.waitForNew((m) => m.type === 'state');
    if (postAckState.self.tasksDone[nearTask.idx] !== true || postAckState.doneTasks < 1) {
      throw new Error(`Task ack state mismatch: ${JSON.stringify(postAckState.self.tasksDone)}, done=${postAckState.doneTasks}`);
    }
    console.log('[6b] Task Synchronization verified (out-of-range task_reject + in-range task_ack + doneTasks increment).');

    // 8. Test Active-Match Reconnection on P4
    const p4Token = active[3].token;
    active[3].close();
    await new Promise((r) => setTimeout(r, 250));
    active[3] = await connectClient('P4-MatchRejoined');
    active[3].send({ type: 'rejoin', token: p4Token });
    await active[3].waitFor((m) => m.type === 'welcome');
    await active[3].waitFor((m) => m.type === 'role');
    console.log('[7] Active-match Rejoin token recovery verified for P4.');

    // 9. Steer caller to Emergency Chain (CHAIN = { x: 3262, y: 180 }) and trigger meeting
    const CHAIN_X = 3 * 944 + 430;
    const CHAIN_Y = 180;
    await steerTo(caller, CHAIN_X, CHAIN_Y, 48, 25000);
    const meetingWaiters = active.map((c) => c.waitFor((m) => m.type === 'meeting', 10000));
    caller.send({ type: 'alarm' });
    await Promise.all(meetingWaiters);
    console.log('[8] Emergency Meeting started across all 4 clients.');

    // 10. Test sanitized chat + suspect button
    caller.send({ type: 'chat', text: '<b>টেস্ট</b> কে কোথায় ছিলে?' });
    const chatMsg = await active[1].waitFor((m) => m.type === 'chat' && !m.sys);
    if (chatMsg.text.includes('<b>')) {
      throw new Error(`XSS/HTML escape failed: ${chatMsg.text}`);
    }
    const fakerClient = active.find((c) => c.role === 'faker');
    caller.send({ type: 'suspect', targetId: fakerClient.id });
    await active[2].waitFor((m) => m.type === 'chat' && m.text.includes('সন্দেহ'));
    console.log('[9] Sanitized chat & suspect button broadcast verified.');

    // 11. Wait for voting phase then vote out Faker
    await active[0].waitFor(
      (m) => m.type === 'chat' && m.sys && m.text.includes('ভোট শুরু'),
      18000
    );
    for (const c of active) {
      c.send({ type: 'vote', targetId: fakerClient.id });
    }
    const verdict = await active[0].waitFor((m) => m.type === 'verdict', 8000);
    if (verdict.ejectedId !== fakerClient.id || verdict.wasFaker !== true) {
      throw new Error(`Unexpected verdict: ${JSON.stringify(verdict)}`);
    }

    const endMsg = await active[0].waitFor((m) => m.type === 'end', 8000);
    if (endMsg.winner !== 'passengers' || !Array.isArray(endMsg.roles) || endMsg.roles.length !== 4) {
      throw new Error(`Unexpected end payload: ${JSON.stringify(endMsg)}`);
    }
    console.log(`[10] Match ended cleanly! Winner: ${endMsg.winner}`);

    // 12. Test Post-Match Team Rematch (return_lobby) keeps all teammates together!
    const returnMsgWaiters = active.map((c) => c.waitForNew((m) => m.type === 'return_lobby', 8000));
    const returnRoomWaiters = active.map((c) =>
      c.waitForNew((m) => m.type === 'room' && m.phase === 'lobby' && m.code === code && m.players.length === 4, 8000)
    );
    active[0].send({ type: 'return_lobby' });
    await Promise.all([...returnMsgWaiters, ...returnRoomWaiters]);
    console.log('[11] Post-match Team Rematch (return_lobby) verified across all 4 clients!');
    console.log('ALL MULTIPLAYER CHECKS PASSED.');
  } finally {
    const all = new Set([...clients, ...active]);
    all.forEach((c) => {
      try {
        c.ws.terminate();
      } catch {
        // ignore
      }
    });
  }
}

main().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
