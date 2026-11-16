import crypto from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  botVoteDecision,
  generateBotLines,
  generateReactiveBotReplies,
  updateBot,
} from '../game/botAI.ts';
import {
  BENCH,
  BOT_NAMES,
  CH,
  CHAIN,
  COACH_NAMES,
  COLORS,
  HAIRS,
  PANTS,
  SABOTAGE_SPOTS,
  SEATS,
  SKINS,
  SPOTS,
  STATIONS,
  VENTS,
  bn,
  clampOutOfGangway,
  coachOf,
  getPlayerStatus,
  movePlayer,
  pick,
  rnd,
  shuffle,
} from '../game/mapData.ts';
import type {
  GamePhase,
  GameWorld,
  LobbyChatEntry,
  MeetingState,
  Player,
  PlayerTask,
  Role,
  SabotageType,
  StolenBody,
} from '../game/types.ts';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes I, O, 0, 1
const TICK_MS = 50; // 20 ticks/sec
const MATCH_DURATION = 150; // 150s match timer (pauses during meetings)
const MEETING_DISCUSS_TIME = 12;
const MEETING_VOTE_TIME = 16; // 12 + 16 = 28s total meeting
const MEETING_RESULT_TIME = 4.5;
const PUBLIC_WAIT_MAX_SEC = 20;
const PUBLIC_COUNTDOWN_SEC = 3;
const RECONNECT_GRACE_MS = 30000;
const LOBBY_RECONNECT_GRACE_MS = 20000;
const MAX_PAYLOAD_BYTES = 4096;

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeName(raw: unknown, fallback = 'যাত্রী'): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 12) : '';
  const clean = escapeHtml(s);
  return clean || fallback;
}

function sanitizeTeamName(raw: unknown, fallback = 'টিম মেট্রো'): string {
  const s = typeof raw === 'string' ? raw.trim().slice(0, 18) : '';
  const clean = escapeHtml(s);
  return clean || fallback;
}

function sanitizeChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return escapeHtml(raw.trim().slice(0, 80));
}

function clampInt(val: unknown, min: number, max: number, def: number): number {
  const n = typeof val === 'number' ? Math.floor(val) : Number.parseInt(String(val), 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

interface ServerPlayer extends Player {
  token: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  disconnectedAt: number | null;
  inputDx: number;
  inputDy: number;
  lastSeq: number;
  colorIdx: number;
  skinIdx: number;
  lastChatAt: number;
}

interface ServerRoom {
  code: string;
  isPublic: boolean;
  teamName: string;
  hostId: number;
  maxPlayers: number;
  fillBots: boolean;
  phase: GamePhase;
  createdAt: number;
  firstHumanAt: number;
  countdown: number | null; // seconds left before auto-start in public room
  world: GameWorld | null;
  players: ServerPlayer[];
  lobbyChat: LobbyChatEntry[];
  nextPid: number;
  matchTimer: number;
  verdictTimer: number;
  pendingEject: ServerPlayer | null;
  meetingEndsAt: number;
  chatSeq: number;
}

interface ClientConn {
  ws: WebSocket;
  roomCode: string | null;
  playerId: number | null;
  token: string;
  msgWindowStart: number;
  msgCount: number;
}

export class MultiplayerServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, ServerRoom>();
  private conns = new Map<WebSocket, ClientConn>();
  private tokenIndex = new Map<string, { roomCode: string; playerId: number }>();
  private socketsByToken = new Map<string, ClientConn>();
  private tickTimer: NodeJS.Timeout | null = null;

  constructor(httpServer: HttpServer) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
    });

    httpServer.on('upgrade', (req, socket, head) => {
      try {
        const pathname = new URL(req.url || '/', 'http://localhost').pathname;
        if (pathname !== '/ws') {
          socket.destroy();
          return;
        }
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit('connection', ws, req);
        });
      } catch {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws) => this.handleConnection(ws));
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  public getStats() {
    let humans = 0;
    this.rooms.forEach((r) => {
      humans += r.players.filter((p) => !p.isBot && p.connected).length;
    });
    return {
      rooms: this.rooms.size,
      humans,
    };
  }

  public close() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.wss.close();
  }

  private generateCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += ROOM_CODE_CHARS[(Math.random() * ROOM_CODE_CHARS.length) | 0];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${((Math.random() * 899) | 0) + 100}`;
  }

  private send(ws: WebSocket | undefined | null, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // ignore closed socket
    }
  }

  private sendToPlayer(room: ServerRoom, playerId: number, payload: unknown): void {
    const p = room.players.find((x) => x.id === playerId);
    if (!p || p.isBot || !p.connected) return;
    const conn = this.socketsByToken.get(p.token);
    if (conn) this.send(conn.ws, payload);
  }

  private broadcastRoom(room: ServerRoom, payload: unknown): void {
    const raw = JSON.stringify(payload);
    for (const p of room.players) {
      if (p.isBot || !p.connected) continue;
      const conn = this.socketsByToken.get(p.token);
      if (conn && conn.ws.readyState === WebSocket.OPEN) {
        try {
          conn.ws.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }

  private handleConnection(ws: WebSocket): void {
    const conn: ClientConn = {
      ws,
      roomCode: null,
      playerId: null,
      token: crypto.randomBytes(12).toString('hex'),
      msgWindowStart: Date.now(),
      msgCount: 0,
    };
    this.conns.set(ws, conn);

    ws.on('message', (data) => {
      const now = Date.now();
      if (now - conn.msgWindowStart > 1000) {
        conn.msgWindowStart = now;
        conn.msgCount = 0;
      }
      conn.msgCount++;
      if (conn.msgCount > 45) {
        this.send(ws, { type: 'error', msg: 'অনেক দ্রুত মেসেজ পাঠানো হচ্ছে, একটু থামো।' });
        return;
      }

      const raw = typeof data === 'string' ? data : data.toString('utf8');
      if (raw.length > MAX_PAYLOAD_BYTES) {
        this.send(ws, { type: 'error', msg: 'বার্তার আকার অতিরিক্ত বড়।' });
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.send(ws, { type: 'error', msg: 'ভুল ডেটা ফরম্যাট।' });
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;
      this.handleMessage(conn, msg);
    });

    ws.on('close', () => this.handleDisconnect(conn));
    ws.on('error', () => this.handleDisconnect(conn));
  }

  private handleDisconnect(conn: ClientConn): void {
    this.conns.delete(conn.ws);
    if (!conn.roomCode || conn.playerId === null) return;
    const room = this.rooms.get(conn.roomCode);
    if (!room) return;
    const p = room.players.find((x) => x.id === conn.playerId);
    if (!p) return;

    const currentSock = this.socketsByToken.get(p.token);
    if (currentSock && currentSock.ws === conn.ws) {
      this.socketsByToken.delete(p.token);
    }

    p.connected = false;
    p.disconnectedAt = Date.now();
    p.inputDx = 0;
    p.inputDy = 0;

    // Keep lobby reconnect grace window instead of deleting immediately on transient drop
    this.transferHostIfNeeded(room);
    this.emitRoomState(room);
  }

  private pushLobbyChat(
    room: ServerRoom,
    entry: { fromId?: number; from?: string; color?: string; text: string; sys?: boolean }
  ): void {
    const item: LobbyChatEntry = {
      id: ++room.chatSeq,
      fromId: entry.fromId,
      name: entry.from,
      color: entry.color,
      text: entry.text,
      sys: entry.sys,
    };
    room.lobbyChat.push(item);
    if (room.lobbyChat.length > 30) {
      room.lobbyChat.splice(0, room.lobbyChat.length - 30);
    }
    this.broadcastRoom(room, { type: 'lobby_chat', entry: item });
  }

  private removePlayerFromRoom(room: ServerRoom, playerId: number): void {
    const idx = room.players.findIndex((x) => x.id === playerId);
    if (idx < 0) return;
    const [removed] = room.players.splice(idx, 1);
    this.tokenIndex.delete(removed.token);
    this.socketsByToken.delete(removed.token);

    const anyHuman = room.players.some((p) => !p.isBot);
    if (!anyHuman) {
      this.rooms.delete(room.code);
      return;
    }

    this.transferHostIfNeeded(room);
    if (!room.isPublic && room.phase === 'lobby' && !removed.isBot) {
      this.pushLobbyChat(room, { sys: true, text: `${removed.name} টিম রুম ছেড়েছে।` });
    }
    if (room.isPublic && room.players.filter((p) => !p.isBot).length < 4 && room.countdown !== null) {
      // Reset short countdown if someone left before enough humans, unless 20s timeout already elapsed
      if ((Date.now() - room.firstHumanAt) / 1000 < PUBLIC_WAIT_MAX_SEC) {
        room.countdown = null;
      }
    }
    this.emitRoomState(room);
  }

  private transferHostIfNeeded(room: ServerRoom): void {
    const currentHost = room.players.find((p) => p.id === room.hostId && !p.isBot && p.connected);
    if (currentHost) return;
    const nextHuman =
      room.players.find((p) => !p.isBot && p.connected) || room.players.find((p) => !p.isBot);
    if (nextHuman) {
      room.hostId = nextHuman.id;
    }
  }

  private createPlayerEntity(
    room: ServerRoom,
    name: string,
    colorIdx: number,
    acc: number,
    skinIdx: number,
    isBot: boolean
  ): ServerPlayer {
    const id = room.nextPid++;
    const usedCols = new Set(room.players.map((p) => p.colorIdx));
    let finalCol = colorIdx;
    if (usedCols.has(finalCol)) {
      const alt = COLORS.findIndex((_, i) => !usedCols.has(i));
      if (alt >= 0) finalCol = alt;
    }
    const token = crypto.randomBytes(12).toString('hex');
    return {
      id,
      name,
      color: COLORS[finalCol] || COLORS[0],
      acc: clampInt(acc, 0, 7, 0),
      skin: SKINS[skinIdx] || SKINS[1],
      pants: pick(PANTS),
      hair: pick(HAIRS),
      isMe: false,
      role: 'passenger',
      alive: true,
      x: 3 * 944 + 430,
      y: CH / 2,
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
      seat: SEATS[id % SEATS.length],
      tasks: [],
      coolSteal: 10,
      coolCheck: 0,
      uses: 3,
      known: {},
      susp: {},
      lastCoach: 3,
      chains: 1,
      ai: {
        goal: null,
        wait: 0,
        huntCd: rnd(6, 14),
        stuck: 0,
        nudge: 0,
        nx: 0,
        ny: 0,
        chkCd: rnd(6, 12),
        reportT: 0,
        rep: false,
      },
      token,
      isBot,
      connected: !isBot,
      ready: isBot,
      disconnectedAt: null,
      inputDx: 0,
      inputDy: 0,
      lastSeq: 0,
      colorIdx: finalCol,
      skinIdx,
      lastChatAt: 0,
    };
  }

  private leaveCurrentRoom(conn: ClientConn): void {
    if (!conn.roomCode || conn.playerId === null) return;
    const room = this.rooms.get(conn.roomCode);
    const pid = conn.playerId;
    conn.roomCode = null;
    conn.playerId = null;
    if (!room) return;

    if (room.phase === 'lobby') {
      this.removePlayerFromRoom(room, pid);
    } else {
      const p = room.players.find((x) => x.id === pid);
      if (p) {
        p.connected = false;
        p.isBot = true; // Hand over immediately when explicitly leaving active match
        this.tokenIndex.delete(p.token);
        this.socketsByToken.delete(p.token);
        this.transferHostIfNeeded(room);
        const anyHuman = room.players.some((x) => !x.isBot);
        if (!anyHuman) {
          this.rooms.delete(room.code);
          return;
        }
        this.emitRoomState(room);
      }
    }
  }

  private handleMessage(conn: ClientConn, msg: Record<string, unknown>): void {
    const t = msg.type as string;

    if (t === 'rejoin') {
      const token = typeof msg.token === 'string' ? msg.token : '';
      const entry = this.tokenIndex.get(token);
      if (!entry) {
        this.send(conn.ws, { type: 'error', msg: 'সেশন শেষ হয়ে গেছে, নতুন রুমে যোগ দাও।' });
        return;
      }
      const room = this.rooms.get(entry.roomCode);
      if (!room) {
        this.tokenIndex.delete(token);
        this.send(conn.ws, { type: 'error', msg: 'রুমটি আর নেই।' });
        return;
      }
      const p = room.players.find((x) => x.id === entry.playerId);
      if (!p) {
        this.tokenIndex.delete(token);
        this.send(conn.ws, { type: 'error', msg: 'প্লেয়ার পাওয়া যায়নি।' });
        return;
      }
      const graceMs = room.phase === 'lobby' ? LOBBY_RECONNECT_GRACE_MS : RECONNECT_GRACE_MS;
      if (p.disconnectedAt && Date.now() - p.disconnectedAt > graceMs) {
        if (room.phase === 'lobby') {
          this.removePlayerFromRoom(room, p.id);
        } else {
          this.tokenIndex.delete(token);
        }
        this.send(conn.ws, { type: 'error', msg: 'পুনঃসংযোগের সময় শেষ হয়ে গেছে, আবার যোগ দাও।' });
        return;
      }
      p.isBot = false;
      p.connected = true;
      p.disconnectedAt = null;
      conn.roomCode = room.code;
      conn.playerId = p.id;
      conn.token = p.token;
      this.socketsByToken.set(p.token, conn);

      this.send(conn.ws, { type: 'welcome', playerId: p.id, token: p.token });
      this.emitRoomState(room);
      if (room.world && room.phase !== 'lobby') {
        this.sendRoleToPlayer(room, p, true);
        if (room.phase === 'meeting' && room.world.m) {
          const m = room.world.m;
          this.sendToPlayer(room, p.id, {
            type: 'meeting',
            reason: m.body ? 'body' : 'alarm',
            callerId: m.callerId,
            callerName: room.players.find((x) => x.id === m.callerId)?.name || '',
            body: m.body,
            endsAt: room.meetingEndsAt,
            discussTime: MEETING_DISCUSS_TIME,
            voteTime: MEETING_VOTE_TIME,
            totalTime: MEETING_DISCUSS_TIME + MEETING_VOTE_TIME,
            stage: m.stage,
            stageTimeLeft: Math.max(0, Math.ceil(m.t)),
            votedIds: Object.keys(m.votes).map((k) => Number(k)),
            chatLog: m.chatLog,
          });
        } else if (room.phase === 'end') {
          this.sendToPlayer(room, p.id, {
            type: 'end',
            winner: room.world.endWinner || 'fakers',
            reason: room.world.endReason || '',
            roles: room.players.map((q) => ({
              id: q.id,
              name: q.name,
              color: q.color,
              role: q.role,
              alive: q.alive,
            })),
          });
        }
      }
      return;
    }

    if (t === 'quickplay') {
      this.leaveCurrentRoom(conn);
      const name = sanitizeName(msg.name, `যাত্রী ${bn(((Math.random() * 90) | 0) + 10)}`);
      const color = clampInt(msg.color, 0, COLORS.length - 1, 1);
      const acc = clampInt(msg.acc, 0, 7, 0);
      const skin = clampInt(msg.skin, 0, SKINS.length - 1, 1);

      let room: ServerRoom | undefined;
      for (const r of this.rooms.values()) {
        if (r.isPublic && r.phase === 'lobby' && r.players.length < r.maxPlayers) {
          room = r;
          break;
        }
      }
      if (!room) {
        const code = this.generateCode();
        room = {
          code,
          isPublic: true,
          teamName: 'পাবলিক ম্যাচ',
          hostId: 0,
          maxPlayers: 7,
          fillBots: true,
          phase: 'lobby',
          createdAt: Date.now(),
          firstHumanAt: Date.now(),
          countdown: null,
          world: null,
          players: [],
          lobbyChat: [],
          nextPid: 1,
          matchTimer: MATCH_DURATION,
          verdictTimer: 0,
          pendingEject: null,
          meetingEndsAt: 0,
          chatSeq: 0,
        };
        this.rooms.set(code, room);
      }

      const p = this.createPlayerEntity(room, name, color, acc, skin, false);
      room.players.push(p);
      if (!room.hostId) room.hostId = p.id;
      conn.roomCode = room.code;
      conn.playerId = p.id;
      conn.token = p.token;
      this.tokenIndex.set(p.token, { roomCode: room.code, playerId: p.id });
      this.socketsByToken.set(p.token, conn);

      this.send(conn.ws, { type: 'welcome', playerId: p.id, token: p.token });
      if (room.players.filter((x) => !x.isBot).length >= 4 && room.countdown === null) {
        room.countdown = PUBLIC_COUNTDOWN_SEC;
      }
      this.emitRoomState(room);
      return;
    }

    if (t === 'create_private') {
      this.leaveCurrentRoom(conn);
      const name = sanitizeName(msg.name, 'হোস্ট');
      const teamName = sanitizeTeamName(msg.teamName, `${name}-এর টিম`);
      const color = clampInt(msg.color, 0, COLORS.length - 1, 1);
      const acc = clampInt(msg.acc, 0, 7, 0);
      const skin = clampInt(msg.skin, 0, SKINS.length - 1, 1);
      const maxPlayers = clampInt(msg.maxPlayers, 4, 7, 6);
      const fillBots = Boolean(msg.fillBots);
      const code = this.generateCode();

      const room: ServerRoom = {
        code,
        isPublic: false,
        teamName,
        hostId: 0,
        maxPlayers,
        fillBots,
        phase: 'lobby',
        createdAt: Date.now(),
        firstHumanAt: Date.now(),
        countdown: null,
        world: null,
        players: [],
        lobbyChat: [],
        nextPid: 1,
        matchTimer: MATCH_DURATION,
        verdictTimer: 0,
        pendingEject: null,
        meetingEndsAt: 0,
        chatSeq: 0,
      };
      const p = this.createPlayerEntity(room, name, color, acc, skin, false);
      p.ready = true;
      room.hostId = p.id;
      room.players.push(p);
      this.rooms.set(code, room);

      conn.roomCode = code;
      conn.playerId = p.id;
      conn.token = p.token;
      this.tokenIndex.set(p.token, { roomCode: code, playerId: p.id });
      this.socketsByToken.set(p.token, conn);

      this.pushLobbyChat(room, { sys: true, text: `${teamName} তৈরি হয়েছে।` });
      this.send(conn.ws, { type: 'welcome', playerId: p.id, token: p.token });
      this.emitRoomState(room);
      return;
    }

    if (t === 'join_private') {
      this.leaveCurrentRoom(conn);
      const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
      const room = this.rooms.get(code);
      if (!room || room.isPublic) {
        this.send(conn.ws, { type: 'error', msg: 'রুম কোডটি সঠিক নয় বা রুম পাওয়া যায়নি।' });
        return;
      }
      if (room.phase !== 'lobby') {
        this.send(conn.ws, { type: 'error', msg: 'এই রুমে খেলা ইতিমধ্যেই শুরু হয়ে গেছে।' });
        return;
      }
      if (room.players.length >= room.maxPlayers) {
        this.send(conn.ws, { type: 'error', msg: 'রুমটি সম্পূর্ণ ভরে গেছে।' });
        return;
      }
      const name = sanitizeName(msg.name, `যাত্রী ${bn(room.nextPid)}`);
      const color = clampInt(msg.color, 0, COLORS.length - 1, 1);
      const acc = clampInt(msg.acc, 0, 7, 0);
      const skin = clampInt(msg.skin, 0, SKINS.length - 1, 1);

      const p = this.createPlayerEntity(room, name, color, acc, skin, false);
      room.players.push(p);
      conn.roomCode = room.code;
      conn.playerId = p.id;
      conn.token = p.token;
      this.tokenIndex.set(p.token, { roomCode: room.code, playerId: p.id });
      this.socketsByToken.set(p.token, conn);

      this.send(conn.ws, { type: 'welcome', playerId: p.id, token: p.token });
      this.pushLobbyChat(room, { sys: true, text: `${p.name} টিমে যোগ দিয়েছে।` });
      this.emitRoomState(room);
      return;
    }

    if (t === 'leave') {
      this.leaveCurrentRoom(conn);
      return;
    }

    if (!conn.roomCode || conn.playerId === null) {
      this.send(conn.ws, { type: 'error', msg: 'তুমি কোনো রুমে নেই।' });
      return;
    }
    const room = this.rooms.get(conn.roomCode);
    if (!room) return;
    const me = room.players.find((x) => x.id === conn.playerId);
    if (!me) return;

    if (t === 'toggle_ready') {
      if (room.phase !== 'lobby') return;
      me.ready = typeof msg.ready === 'boolean' ? msg.ready : !me.ready;
      this.emitRoomState(room);
      return;
    }

    if (t === 'kick') {
      if (room.phase !== 'lobby' || room.isPublic) return;
      if (room.hostId !== me.id) {
        this.send(conn.ws, { type: 'error', msg: 'শুধু টিম লিডার কাউকে সরাতে পারবে।' });
        return;
      }
      const targetId = clampInt(msg.targetId, 0, 99999, -1);
      if (targetId === me.id) return;
      const target = room.players.find((x) => x.id === targetId && !x.isBot);
      if (!target) return;
      const targetSock = this.socketsByToken.get(target.token);
      if (targetSock) {
        targetSock.roomCode = null;
        targetSock.playerId = null;
        this.send(targetSock.ws, {
          type: 'kicked',
          msg: 'টিম লিডার তোমাকে রুম থেকে সরিয়ে দিয়েছে।',
        });
      }
      this.removePlayerFromRoom(room, target.id);
      return;
    }

    if (t === 'transfer_host') {
      if (room.phase !== 'lobby' || room.isPublic) return;
      if (room.hostId !== me.id) return;
      const targetId = clampInt(msg.targetId, 0, 99999, -1);
      const target = room.players.find((x) => x.id === targetId && !x.isBot && x.connected);
      if (!target || target.id === room.hostId) return;
      room.hostId = target.id;
      target.ready = true;
      this.pushLobbyChat(room, { sys: true, text: `${target.name} এখন টিম লিডার (হোস্ট)।` });
      this.emitRoomState(room);
      return;
    }

    if (t === 'update_room') {
      if (room.phase !== 'lobby' || room.isPublic) return;
      if (room.hostId !== me.id) {
        this.send(conn.ws, { type: 'error', msg: 'শুধু টিম লিডার রুম সেটিংস বদলাতে পারবে।' });
        return;
      }
      if (typeof msg.teamName === 'string') {
        room.teamName = sanitizeTeamName(msg.teamName, room.teamName);
      }
      if (typeof msg.fillBots === 'boolean') {
        room.fillBots = msg.fillBots;
      }
      if (msg.maxPlayers !== undefined) {
        const minLimit = Math.max(4, room.players.length);
        room.maxPlayers = clampInt(msg.maxPlayers, minLimit, 7, room.maxPlayers);
      }
      this.emitRoomState(room);
      return;
    }

    if (t === 'lobby_chat') {
      if (room.phase !== 'lobby') return;
      const now = Date.now();
      if (now - me.lastChatAt < 400) return;
      const clean = sanitizeChat(msg.text);
      if (!clean) return;
      me.lastChatAt = now;
      this.pushLobbyChat(room, { fromId: me.id, from: me.name, color: me.color, text: clean });
      return;
    }

    if (t === 'return_lobby') {
      if (room.phase !== 'end' || room.isPublic) return;
      if (room.hostId !== me.id) {
        this.send(conn.ws, { type: 'error', msg: 'শুধু টিম লিডার সবাইকে টিম লবিতে ফেরাতে পারবে।' });
        return;
      }
      room.phase = 'lobby';
      room.world = null;
      room.countdown = null;
      room.pendingEject = null;
      room.verdictTimer = 0;
      room.matchTimer = MATCH_DURATION;
      // Remove bots from the finished match, keep human squad members together
      room.players = room.players.filter((p) => !p.isBot && (p.connected || (p.disconnectedAt && Date.now() - p.disconnectedAt < RECONNECT_GRACE_MS)));
      room.players.forEach((p) => {
        p.alive = true;
        p.tasks = [];
        p.inVent = null;
        p.stunnedUntil = 0;
        p.hasteUntil = 0;
        p.slowReason = null;
        p.speedMul = 1;
        p.known = {};
        p.susp = {};
        p.inputDx = 0;
        p.inputDy = 0;
        p.ready = p.id === room.hostId;
      });
      this.transferHostIfNeeded(room);
      this.pushLobbyChat(room, { sys: true, text: 'ম্যাচ শেষ — সবাই আবার টিম লবিতে ফিরে এসেছে!' });
      this.broadcastRoom(room, { type: 'return_lobby' });
      this.emitRoomState(room);
      return;
    }

    if (t === 'start') {
      if (room.phase !== 'lobby') return;
      if (room.hostId !== me.id) {
        this.send(conn.ws, { type: 'error', msg: 'শুধু হোস্ট খেলা শুরু করতে পারবে।' });
        return;
      }
      const needed = room.fillBots ? room.maxPlayers : Math.max(4, room.players.length);
      if (room.players.length < 4 && !room.fillBots) {
        this.send(conn.ws, { type: 'error', msg: 'কমপক্ষে ৪ জন প্লেয়ার বা বট ফিল চালু থাকতে হবে।' });
        return;
      }
      this.startMatch(room, Math.max(4, Math.min(7, needed)));
      return;
    }

    if (t === 'input') {
      if (room.phase !== 'play' || !room.world) return;
      const dx = typeof msg.dx === 'number' && Number.isFinite(msg.dx) ? msg.dx : 0;
      const dy = typeof msg.dy === 'number' && Number.isFinite(msg.dy) ? msg.dy : 0;
      const seq = typeof msg.seq === 'number' && Number.isFinite(msg.seq) ? msg.seq : me.lastSeq;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        me.inputDx = dx / mag;
        me.inputDy = dy / mag;
      } else {
        me.inputDx = dx;
        me.inputDy = dy;
      }
      me.lastSeq = seq;
      return;
    }

    if (t === 'action') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.inVent !== null) return;
      const w = room.world;
      if (me.stunnedUntil > w.t) return;
      if (me.role === 'faker') {
        if (me.coolSteal > 0) return;
        const victim = this.nearestPlayer(room, me, 62, (q) => q.role !== 'faker');
        if (victim) this.executeSteal(room, me, victim);
      } else if (me.role === 'inspector') {
        if (me.coolCheck > 0 || me.uses <= 0) return;
        const target = this.nearestPlayer(room, me, 68);
        if (target) {
          const isFaker = target.role === 'faker';
          me.known[target.id] = isFaker;
          me.coolCheck = 18;
          me.uses--;
          this.sendToPlayer(room, me.id, {
            type: 'private',
            kind: 'check',
            targetId: target.id,
            targetName: target.name,
            isFaker,
            usesLeft: me.uses,
          });
        }
      }
      return;
    }

    if (t === 'alarm') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.inVent !== null) return;
      if (me.stunnedUntil > room.world.t) return;
      if (me.chains <= 0) return;
      if (Math.hypot(me.x - CHAIN.x, me.y - CHAIN.y) > 70) return;
      me.chains--;
      this.startMeeting(room, me.id, null);
      return;
    }

    if (t === 'report') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.inVent !== null) return;
      if (me.stunnedUntil > room.world.t) return;
      const body = room.world.bodies.find((b) => Math.hypot(b.x - me.x, b.y - me.y) <= 95);
      if (!body) return;
      this.startMeeting(room, me.id, body);
      return;
    }

    if (t === 'vent') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.role !== 'faker') return;
      const w = room.world;
      if (me.stunnedUntil > w.t) return;
      if (me.inVent !== null) {
        const vid = me.inVent;
        me.inVent = null;
        w.ventAnim[vid] = 1;
        this.notifyVentWitnesses(room, me);
        return;
      }
      const near = VENTS.find((v) => Math.hypot(v.x - me.x, v.y - me.y) <= 52);
      if (near) {
        me.inVent = near.id;
        me.x = near.x;
        me.y = near.y;
        w.ventAnim[near.id] = 1;
      }
      return;
    }

    if (t === 'cycle_vent') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.role !== 'faker') return;
      if (me.inVent === null) return;
      const cur = VENTS[me.inVent];
      if (!cur) return;
      const dir = msg.dir === -1 ? -1 : 1;
      const nextId = dir === 1 ? cur.links[1] : cur.links[0];
      const nextV = VENTS[nextId];
      if (!nextV) return;
      me.inVent = nextV.id;
      me.x = nextV.x;
      me.y = nextV.y;
      room.world.ventAnim[nextV.id] = 1;
      return;
    }

    if (t === 'task_complete') {
      if (room.phase !== 'play' || !room.world) return;
      const idx = clampInt(msg.taskIndex, 0, me.tasks.length - 1, -1);
      if (idx < 0) return;
      const task = me.tasks[idx];
      if (!task || task.done) return;
      if (me.alive && me.stunnedUntil > room.world.t) {
        this.sendToPlayer(room, me.id, {
          type: 'private',
          kind: 'task_reject',
          taskIndex: idx,
          reason: 'শক লাগা অবস্থায় কাজ শেষ করা যাবে না!',
        });
        return;
      }
      if (me.alive && Math.hypot(me.x - task.spot.x, me.y - task.spot.y) > 95) {
        this.sendToPlayer(room, me.id, {
          type: 'private',
          kind: 'task_reject',
          taskIndex: idx,
          reason: 'কাজের জায়গা থেকে দূরে সরে গেছো — কাছে গিয়ে আবার করো!',
        });
        return;
      }
      this.completeTask(room, me, idx);
      return;
    }

    if (t === 'scan_start') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.role === 'faker') return;
      if (me.tasks.some((tk) => !tk.done && tk.spot.type === 'scan' && Math.hypot(me.x - tk.spot.x, me.y - tk.spot.y) <= 95)) {
        me.scanningUntil = room.world.t + 3.5;
      }
      return;
    }

    if (t === 'sabotage') {
      if (room.phase !== 'play' || !room.world || !me.alive || me.role !== 'faker') return;
      const st = msg.sabType;
      if (st !== 'lights' && st !== 'doors' && st !== 'brakes' && st !== 'comms') return;
      this.triggerSabotage(room, st);
      return;
    }

    if (t === 'fix_sabotage') {
      if (room.phase !== 'play' || !room.world || !me.alive) return;
      if (me.stunnedUntil > room.world.t) return;
      const spotId = typeof msg.spotId === 'string' ? msg.spotId : '';
      const spot = SABOTAGE_SPOTS.find((s) => s.id === spotId);
      if (!spot || Math.hypot(me.x - spot.x, me.y - spot.y) > 90) return;
      this.fixSabotagePart(room, spotId, me);
      return;
    }

    if (t === 'chat') {
      if (room.phase !== 'meeting' || !room.world?.m || !me.alive) return;
      const m = room.world.m;
      if (m.stage !== 'discuss' && m.stage !== 'vote') return;
      const now = Date.now();
      if (now - me.lastChatAt < 600) return;
      const clean = sanitizeChat(msg.text);
      if (!clean) return;
      me.lastChatAt = now;
      this.pushMeetingChat(room, { fromId: me.id, from: me.name, color: me.color, text: clean });
      room.players.forEach((q) => {
        if (q !== me && clean.includes(q.name)) {
          m.mention[q.id] = (m.mention[q.id] || 0) + 1;
        }
      });
      const elapsedSec =
        m.stage === 'discuss'
          ? MEETING_DISCUSS_TIME - m.t
          : MEETING_DISCUSS_TIME + (MEETING_VOTE_TIME - m.t);
      generateReactiveBotReplies(me.id, clean, room.world, m, elapsedSec);
      return;
    }

    if (t === 'suspect') {
      if (room.phase !== 'meeting' || !room.world?.m || !me.alive) return;
      const m = room.world.m;
      if (m.stage !== 'discuss' && m.stage !== 'vote') return;
      const targetId = clampInt(msg.targetId, 0, 99999, -1);
      const target = room.players.find((x) => x.id === targetId && x.alive && x.id !== me.id);
      if (!target) return;
      const now = Date.now();
      if (now - me.lastChatAt < 900) return;
      me.lastChatAt = now;
      m.mention[target.id] = (m.mention[target.id] || 0) + 1;
      const suspectText = `${target.name}-কে আমার সন্দেহ হচ্ছে!`;
      this.pushMeetingChat(room, {
        fromId: me.id,
        from: me.name,
        color: me.color,
        text: suspectText,
      });
      const elapsedSec =
        m.stage === 'discuss'
          ? MEETING_DISCUSS_TIME - m.t
          : MEETING_DISCUSS_TIME + (MEETING_VOTE_TIME - m.t);
      generateReactiveBotReplies(me.id, suspectText, room.world, m, elapsedSec);
      return;
    }

    if (t === 'vote') {
      if (room.phase !== 'meeting' || !room.world?.m || !me.alive) return;
      const m = room.world.m;
      if (m.stage !== 'vote') return;
      if (m.votes[me.id] !== undefined) return;
      const targetId = msg.targetId === null || msg.targetId === -1 ? -1 : clampInt(msg.targetId, 0, 99999, -1);
      if (targetId >= 0) {
        const target = room.players.find((x) => x.id === targetId && x.alive);
        if (!target) return;
      }
      this.castVote(room, me.id, targetId);
    }
  }

  private emitRoomState(room: ServerRoom): void {
    this.broadcastRoom(room, {
      type: 'room',
      code: room.code,
      isPublic: room.isPublic,
      teamName: room.teamName,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      fillBots: room.fillBots,
      countdown: room.countdown !== null ? Math.ceil(room.countdown) : null,
      phase: room.phase,
      lobbyChat: room.lobbyChat.slice(-25),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        acc: p.acc,
        skin: p.skin,
        isBot: p.isBot,
        connected: p.connected,
        ready: p.ready,
      })),
    });
  }

  private pickPlayerTasks(): PlayerTask[] {
    const used: Record<string, boolean> = {};
    const out: PlayerTask[] = [];
    shuffle(SPOTS).forEach((s) => {
      if (out.length < 5 && !used[s.type]) {
        used[s.type] = true;
        out.push({ spot: s, done: false });
      }
    });
    return out;
  }

  private startMatch(room: ServerRoom, targetCount: number): void {
    if (room.phase !== 'lobby') return;
    room.countdown = null;

    // Fill bots up to targetCount
    const usedNames = new Set(room.players.map((p) => p.name));
    const availBotNames = shuffle(BOT_NAMES.filter((n) => !usedNames.has(n)));
    const usedCols = new Set(room.players.map((p) => p.colorIdx));
    const availCols = shuffle(COLORS.map((_, i) => i).filter((c) => !usedCols.has(c)));

    let bIdx = 0;
    while (room.players.length < targetCount) {
      const bName = availBotNames[bIdx] || `যাত্রী ${bn(room.nextPid)}`;
      const bCol = availCols[bIdx] ?? (room.nextPid % COLORS.length);
      const bot = this.createPlayerEntity(
        room,
        bName,
        bCol,
        (Math.random() * 8) | 0,
        (Math.random() * SKINS.length) | 0,
        true
      );
      room.players.push(bot);
      bIdx++;
    }

    // Assign exactly 1 faker, 1 inspector, rest passengers (per multiplayer rules)
    const shuffled = shuffle(room.players);
    shuffled.forEach((p, idx) => {
      p.role = idx === 0 ? 'faker' : idx === 1 ? 'inspector' : 'passenger';
      p.alive = true;
      p.inVent = null;
      p.stunnedUntil = 0;
      p.hasteUntil = 0;
      p.slowReason = null;
      p.speedMul = 1;
      p.coolSteal = 10;
      p.coolCheck = 0;
      p.uses = 3;
      p.chains = 1;
      p.known = {};
      p.susp = {};
      p.inputDx = 0;
      p.inputDy = 0;
    });

    const seats = shuffle(SEATS).slice(0, room.players.length);
    let totalTasks = 0;
    room.players.forEach((p, i) => {
      p.seat = seats[i] || SEATS[i % SEATS.length];
      p.x = p.seat.x;
      p.y = p.seat.side ? CH - BENCH - 14 : BENCH + 14;
      p.tasks = this.pickPlayerTasks();
      if (p.role !== 'faker') totalTasks += p.tasks.length;
    });

    room.phase = 'play';
    room.matchTimer = MATCH_DURATION;
    room.pendingEject = null;
    room.verdictTimer = 0;

    const world: GameWorld = {
      phase: 'play',
      players: room.players,
      me: room.players[0],
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
      cam: { x: 3 * 944 + 430, y: CH / 2, shake: 0 },
      hitFlash: 0,
      modal: null,
      nextStation: 26,
      stIdx: (Math.random() * STATIONS.length) | 0,
      fakers: 1,
      endReason: '',
      endWinner: null,
      toastText: '',
      toastUntil: 0,
      isOnline: true,
      matchTimer: MATCH_DURATION,
    };

    room.world = world;
    this.emitRoomState(room);
    room.players.forEach((p) => {
      if (!p.isBot) this.sendRoleToPlayer(room, p);
    });
  }

  private sendRoleToPlayer(room: ServerRoom, p: ServerPlayer, isRejoin = false): void {
    const allies =
      p.role === 'faker' ? room.players.filter((q) => q.role === 'faker' && q.id !== p.id).map((q) => q.id) : [];
    const seatIdx = Math.max(0, SEATS.indexOf(p.seat));
    const base: Record<string, unknown> = {
      type: 'role',
      role: p.role,
      allies,
      tasks: p.tasks.map((t) => ({ spotId: t.spot.id, done: t.done })),
      seatIdx,
      matchTimer: room.matchTimer,
      stIdx: room.world?.stIdx ?? 0,
    };
    if (isRejoin && room.world) {
      base.rejoin = true;
      base.phase = room.phase;
      base.t = room.world.t;
      base.totalTasks = room.world.totalTasks;
      base.doneTasks = room.world.doneTasks;
      base.bodies = room.world.bodies;
      base.sabotage = room.world.sabotage;
      base.playersState = room.players.map((q) => ({
        id: q.id,
        alive: q.alive,
        x: q.x,
        y: q.y,
      }));
    }
    this.sendToPlayer(room, p.id, base);
  }

  private nearestPlayer(
    room: ServerRoom,
    me: ServerPlayer,
    range: number,
    pred?: (q: ServerPlayer) => boolean
  ): ServerPlayer | null {
    let best: ServerPlayer | null = null;
    let bd = range;
    for (const q of room.players) {
      if (q.id === me.id || !q.alive || q.inVent !== null) continue;
      if (pred && !pred(q)) continue;
      const d = Math.hypot(q.x - me.x, q.y - me.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  private executeSteal(room: ServerRoom, killer: ServerPlayer, victim: ServerPlayer): void {
    const w = room.world;
    if (!w || !victim.alive || !killer.alive) return;
    victim.alive = false;
    victim.inVent = null;
    victim.inputDx = 0;
    victim.inputDy = 0;
    const body: StolenBody = {
      id: w.bodies.length + 1,
      x: victim.x,
      y: victim.y,
      pid: victim.id,
      color: victim.color,
      name: victim.name,
      createdAt: w.t,
    };
    w.bodies.push(body);
    killer.coolSteal = 14; // 14s kill/steal cooldown
    killer.lungeUntil = w.t + 0.34;
    killer.face = victim.x >= killer.x ? 1 : -1;

    // Server-side witness detection + private alert ONLY to nearby witnesses
    for (const q of room.players) {
      if (!q.alive || q.id === killer.id || q.id === victim.id || q.role === 'faker') continue;
      const d = Math.hypot(q.x - victim.x, q.y - victim.y);
      if (d <= 185) {
        if (q.isBot) {
          if (Math.random() < 0.78) q.susp[killer.id] = (q.susp[killer.id] || 0) + 2;
        } else {
          this.sendToPlayer(room, q.id, {
            type: 'private',
            kind: 'witness',
            killerId: killer.id,
            killerName: killer.name,
            killerColor: killer.color,
            victimId: victim.id,
            victimName: victim.name,
            x: victim.x,
            y: victim.y,
          });
        }
      }
    }

    this.sendToPlayer(room, victim.id, {
      type: 'private',
      kind: 'toast',
      text: 'তোমার ব্যাগ ছিনতাই হয়েছে! এখন ভূত হয়ে বাকি কাজ শেষ করো',
    });
    this.sendToPlayer(room, killer.id, {
      type: 'private',
      kind: 'toast',
      text: `${victim.name}-এর ব্যাগ চুরি করেছো! দ্রুত সরে পড়ো`,
    });

    this.checkWin(room);
  }

  private notifyVentWitnesses(room: ServerRoom, faker: ServerPlayer): void {
    for (const q of room.players) {
      if (!q.alive || q.id === faker.id || q.role === 'faker') continue;
      if (Math.hypot(q.x - faker.x, q.y - faker.y) <= 180) {
        if (q.isBot) {
          q.susp[faker.id] = (q.susp[faker.id] || 0) + 3;
        } else {
          this.sendToPlayer(room, q.id, {
            type: 'private',
            kind: 'witness',
            killerId: faker.id,
            killerName: faker.name,
            killerColor: faker.color,
            victimId: null,
            victimName: null,
            x: faker.x,
            y: faker.y,
          });
        }
      }
    }
  }

  private completeTask(room: ServerRoom, p: ServerPlayer, taskIndex: number): void {
    const w = room.world;
    if (!w) return;
    const t = p.tasks[taskIndex];
    if (!t || t.done) return;
    t.done = true;
    if (p.role !== 'faker') w.doneTasks++;
    if (t.spot.type === 'scan' && p.role !== 'faker') {
      p.scanningUntil = w.t + 3.5;
    }
    if (t.spot.hard && p.alive) {
      p.hasteUntil = Math.max(p.hasteUntil || 0, w.t + 4.5);
    }
    this.sendToPlayer(room, p.id, {
      type: 'private',
      kind: 'task_ack',
      taskIndex,
      spotId: t.spot.id,
    });
    this.sendToPlayer(room, p.id, {
      type: 'private',
      kind: 'toast',
      text: p.role === 'faker'
        ? 'কাজের ভান শেষ হয়েছে'
        : t.spot.hard
        ? 'কঠিন কাজ সম্পন্ন! ৪.৫ সেকেন্ড দ্রুতগতি সক্রিয়'
        : 'কাজ সফলভাবে শেষ হয়েছে',
    });
    this.checkWin(room);
  }

  private triggerSabotage(room: ServerRoom, type: Exclude<SabotageType, null>): void {
    const w = room.world;
    if (!w || w.sabotage.active || w.sabotage.cooldown > 0 || room.phase !== 'play') return;
    w.sabotage.cooldown = 30;
    if (type === 'doors') {
      w.sabotage.doorLockedUntil = w.t + 12;
      w.sabotage.active = null;
      for (const p of room.players) {
        if (p.alive && p.inVent === null && clampOutOfGangway(p)) {
          p.stunnedUntil = Math.max(p.stunnedUntil || 0, w.t + 2.2);
          p.inputDx = 0;
          p.inputDy = 0;
        }
      }
      this.broadcastRoom(room, {
        type: 'private',
        kind: 'toast',
        text: 'সব কোচের দরজা ১২ সেকেন্ডের জন্য লক হয়েছে!',
      });
      return;
    }
    w.sabotage.active = type;
    w.sabotage.fixedParts = {};
    w.sabotage.timer = type === 'brakes' ? 45 : 0;
    if (type === 'lights') {
      for (const p of room.players) {
        if (p.alive && p.inVent === null && coachOf(p.x) === 0) {
          p.stunnedUntil = Math.max(p.stunnedUntil || 0, w.t + 3.0);
          p.inputDx = 0;
          p.inputDy = 0;
        }
      }
    } else if (type === 'brakes') {
      for (const p of room.players) {
        if (p.alive && p.inVent === null && coachOf(p.x) === 6) {
          p.stunnedUntil = Math.max(p.stunnedUntil || 0, w.t + 2.6);
          p.inputDx = 0;
          p.inputDy = 0;
        }
      }
    }
    const msgMap = {
      brakes: 'জরুরি ব্রেক ফেইল! ঝাঁকুনিতে সবার গতি কমেছে — ৪৫ সেকেন্ডে ভালভ রিসেট করো!',
      lights: 'মেট্রোর লাইট বন্ধ ও ভোল্টেজ শক! ইলেকট্রিক্যালে গিয়ে ব্রেকার ঠিক করো',
      comms: 'যোগাযোগ ও রাডার বিচ্ছিন্ন! সিকিউরিটি রুমে রাউটার রিসেট করো',
    };
    this.broadcastRoom(room, { type: 'private', kind: 'toast', text: msgMap[type] });
  }

  private fixSabotagePart(room: ServerRoom, spotId: string, fixer?: ServerPlayer): void {
    const w = room.world;
    if (!w || !w.sabotage.active) return;
    const sab = w.sabotage;
    if (sab.active === 'lights' && spotId === 'lights') {
      sab.active = null;
      sab.fixedParts = {};
      if (fixer?.alive) fixer.hasteUntil = Math.max(fixer.hasteUntil || 0, w.t + 4.0);
      this.broadcastRoom(room, { type: 'private', kind: 'toast', text: 'লাইট আবার চালু হয়েছে!' });
    } else if (sab.active === 'comms' && spotId === 'comms') {
      sab.active = null;
      sab.fixedParts = {};
      if (fixer?.alive) fixer.hasteUntil = Math.max(fixer.hasteUntil || 0, w.t + 4.0);
      this.broadcastRoom(room, { type: 'private', kind: 'toast', text: 'যোগাযোগ ব্যবস্থা সচল হয়েছে!' });
    } else if (sab.active === 'brakes' && (spotId === 'brake_rear' || spotId === 'brake_front')) {
      sab.fixedParts[spotId] = true;
      if (sab.fixedParts.brake_rear && sab.fixedParts.brake_front) {
        sab.active = null;
        sab.timer = 0;
        sab.fixedParts = {};
        if (fixer?.alive) fixer.hasteUntil = Math.max(fixer.hasteUntil || 0, w.t + 4.0);
        this.broadcastRoom(room, { type: 'private', kind: 'toast', text: 'জরুরি ব্রেক নিয়ন্ত্রণ ফিরে এসেছে!' });
      }
    }
  }

  private pushMeetingChat(
    room: ServerRoom,
    entry: { fromId?: number; from?: string; color?: string; text: string; sys?: boolean }
  ): void {
    const m = room.world?.m;
    if (!m) return;
    const id = ++room.chatSeq;
    m.chatLog.push({ id, name: entry.from, color: entry.color, text: entry.text, sys: entry.sys });
    this.broadcastRoom(room, {
      type: 'chat',
      id,
      fromId: entry.fromId,
      from: entry.from,
      color: entry.color,
      text: entry.text,
      sys: entry.sys,
    });
  }

  private startMeeting(room: ServerRoom, callerId: number, body: StolenBody | null): void {
    const w = room.world;
    if (!w || room.phase !== 'play') return;
    room.phase = 'meeting';
    w.phase = 'meeting';
    w.sabotage.doorLockedUntil = 0;
    if (w.sabotage.active === 'brakes') {
      w.sabotage.active = null;
      w.sabotage.timer = 0;
      w.sabotage.fixedParts = {};
    }
    room.players.forEach((p) => {
      p.inVent = null;
      p.stunnedUntil = 0;
      p.hasteUntil = 0;
      p.inputDx = 0;
      p.inputDy = 0;
    });

    const caller = room.players.find((x) => x.id === callerId);
    const callerName = caller?.name || 'যাত্রী';
    const m: MeetingState = {
      stage: 'discuss',
      t: MEETING_DISCUSS_TIME,
      callerId,
      body,
      votes: {},
      sched: [],
      botAt: {},
      mention: {},
      out: null,
      ejectProgress: 0,
      chatLog: [],
    };
    w.m = m;
    room.meetingEndsAt = Date.now() + (MEETING_DISCUSS_TIME + MEETING_VOTE_TIME) * 1000;

    let sysText = `${callerName} জরুরি চেইন টেনেছে! সবাই মিলে আলোচনা করো।`;
    if (body) {
      const victim = room.players.find((x) => x.id === body.pid);
      sysText = `${callerName} একটি ফেলে রাখা ব্যাগ রিপোর্ট করেছে (${COACH_NAMES[coachOf(body.x)]})। শিকার: ${victim?.name || body.name}।`;
    }
    const id = ++room.chatSeq;
    m.chatLog.push({ id, sys: true, text: sysText });

    // Schedule server bot chats (caller speaks first naturally)
    room.players.forEach((p) => {
      if (p.alive && p.isBot) {
        const baseAt = p.id === callerId ? rnd(0.8, 1.8) : rnd(1.8, MEETING_DISCUSS_TIME - 4);
        generateBotLines(p, w, m).forEach((tx, idx) => {
          m.sched.push({
            at: baseAt + idx * 3.5,
            pid: p.id,
            text: tx,
            done: false,
          });
        });
        m.botAt[p.id] = rnd(2, MEETING_VOTE_TIME - 5);
      }
    });

    this.broadcastRoom(room, {
      type: 'meeting',
      reason: body ? 'body' : 'alarm',
      callerId,
      callerName,
      body,
      endsAt: room.meetingEndsAt,
      discussTime: MEETING_DISCUSS_TIME,
      voteTime: MEETING_VOTE_TIME,
      totalTime: MEETING_DISCUSS_TIME + MEETING_VOTE_TIME,
      stage: m.stage,
      chatLog: m.chatLog,
    });
  }

  private castVote(room: ServerRoom, pid: number, targetId: number): void {
    const w = room.world;
    const m = w?.m;
    if (!w || !m || m.stage !== 'vote') return;
    if (m.votes[pid] !== undefined) return;
    const p = room.players.find((x) => x.id === pid);
    if (!p || !p.alive) return;
    m.votes[pid] = targetId;

    const votedIds = Object.keys(m.votes).map((k) => Number(k));
    this.broadcastRoom(room, { type: 'votes', votedIds });

    const allVoted = room.players.every((q) => !q.alive || m.votes[q.id] !== undefined);
    if (allVoted) this.resolveVotes(room);
  }

  private resolveVotes(room: ServerRoom): void {
    const w = room.world;
    const m = w?.m;
    if (!w || !m || m.stage === 'result' || m.stage === 'eject') return;

    room.players.forEach((p) => {
      if (p.alive && m.votes[p.id] === undefined) m.votes[p.id] = -1;
    });

    const counts: Record<number, number> = {};
    let skipCount = 0;
    Object.values(m.votes).forEach((t) => {
      if (t < 0) skipCount++;
      else counts[t] = (counts[t] || 0) + 1;
    });

    const rows = room.players
      .filter((p) => p.alive)
      .map((p) => ({ p, c: counts[p.id] || 0 }))
      .sort((a, b) => b.c - a.c);
    const max = rows.length ? rows[0].c : 0;
    const tops = rows.filter((r) => r.c === max);
    // Skip majority or tie -> no one ejected
    const ejected = max > 0 && max > skipCount && tops.length === 1 ? (tops[0].p as ServerPlayer) : null;

    m.out = ejected;
    m.stage = 'result';
    m.t = MEETING_RESULT_TIME;
    room.pendingEject = ejected;
    room.verdictTimer = MEETING_RESULT_TIME;

    this.broadcastRoom(room, {
      type: 'verdict',
      ejectedId: ejected ? ejected.id : null,
      ejectedName: ejected ? ejected.name : null,
      wasFaker: ejected ? ejected.role === 'faker' : null,
      ejectedRole: ejected ? ejected.role : null,
      skipCount,
      counts,
    });
  }

  private resumeFromMeeting(room: ServerRoom): void {
    const w = room.world;
    if (!w || !w.m) return;
    const ejected = room.pendingEject;
    room.pendingEject = null;
    if (ejected) {
      ejected.alive = false;
      this.checkWin(room);
      if (room.phase === 'end') return;
    }

    w.bodies = [];
    w.m = null;
    room.phase = 'play';
    w.phase = 'play';
    room.players.forEach((p) => {
      p.x = p.seat.x;
      p.y = p.seat.side ? CH - BENCH - 14 : BENCH + 14;
      p.inVent = null;
      p.ai.goal = null;
      p.ai.wait = 0;
      p.ai.reportT = 0;
      p.ai.sightings = {};
      p.coolSteal = Math.max(p.coolSteal, 10);
    });
    this.broadcastRoom(room, {
      type: 'private',
      kind: 'toast',
      text: ejected
        ? `${ejected.name} নিরীহ যাত্রী ছিল — ট্রেন আবার যাত্রা শুরু করলো…`
        : 'কেউ নামেনি — ট্রেন আবার যাত্রা শুরু করলো…',
    });
    this.checkWin(room);
  }

  private checkWin(room: ServerRoom): void {
    const w = room.world;
    if (!w || room.phase === 'end') return;
    const alive = room.players.filter((p) => p.alive);
    const fakers = alive.filter((p) => p.role === 'faker').length;
    const others = alive.length - fakers;

    if (fakers === 0) {
      this.finishGame(room, 'passengers', 'সব চোর ধরা পড়েছে ও ট্রেন থেকে নামানো হয়েছে!');
      return;
    }
    if (alive.length <= 2 || fakers >= others) {
      this.finishGame(room, 'fakers', 'জীবিত যাত্রী মাত্র ২ জন বাকি থাকায় চোর জিতেছে!');
      return;
    }
    if (w.doneTasks >= w.totalTasks && w.totalTasks > 0) {
      this.finishGame(room, 'passengers', 'যাত্রীরা মিলে মেট্রোর সব কাজ সম্পন্ন করেছে!');
    }
  }

  private finishGame(room: ServerRoom, winner: 'passengers' | 'fakers', reason: string): void {
    if (room.phase === 'end') return;
    room.phase = 'end';
    if (room.world) {
      room.world.phase = 'end';
      room.world.endWinner = winner;
      room.world.endReason = reason;
    }
    this.broadcastRoom(room, {
      type: 'end',
      winner,
      reason,
      roles: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        role: p.role,
        alive: p.alive,
      })),
    });
  }

  private tick(): void {
    const dt = TICK_MS / 1000;
    const now = Date.now();

    for (const room of [...this.rooms.values()]) {
      // Remove disconnected humans from lobby after LOBBY_RECONNECT_GRACE_MS
      if (room.phase === 'lobby') {
        for (const p of [...room.players]) {
          if (!p.isBot && !p.connected && p.disconnectedAt && now - p.disconnectedAt >= LOBBY_RECONNECT_GRACE_MS) {
            this.removePlayerFromRoom(room, p.id);
          }
        }
        if (!this.rooms.has(room.code)) continue;
      } else {
        // Check 30s reconnect timeout for disconnected humans in active/ended matches
        for (const p of room.players) {
          if (!p.isBot && !p.connected && p.disconnectedAt && now - p.disconnectedAt >= RECONNECT_GRACE_MS) {
            p.isBot = true;
            this.tokenIndex.delete(p.token);
            this.emitRoomState(room);
          }
        }
        const anyActiveOrGrace = room.players.some(
          (p) => !p.isBot && (p.connected || (p.disconnectedAt && now - p.disconnectedAt < RECONNECT_GRACE_MS))
        );
        if (!anyActiveOrGrace) {
          this.rooms.delete(room.code);
          continue;
        }
      }

      // Public matchmaking: 4 humans OR 20s after first human -> countdown & fill bots
      if (room.phase === 'lobby' && room.isPublic) {
        const humans = room.players.filter((p) => !p.isBot).length;
        const elapsed = (now - room.firstHumanAt) / 1000;
        if (room.countdown === null && (humans >= 4 || (humans >= 1 && elapsed >= PUBLIC_WAIT_MAX_SEC))) {
          room.countdown = PUBLIC_COUNTDOWN_SEC;
          this.emitRoomState(room);
        }
        if (room.countdown !== null) {
          const prevCeil = Math.ceil(room.countdown);
          room.countdown -= dt;
          const nextCeil = Math.ceil(room.countdown);
          if (room.countdown <= 0) {
            const target = Math.max(4, Math.min(7, Math.max(room.players.length, 6)));
            this.startMatch(room, target);
            continue;
          } else if (nextCeil !== prevCeil) {
            this.emitRoomState(room);
          }
        }
        continue;
      }

      const w = room.world;
      if (!w) continue;

      if (room.phase === 'meeting' && w.m) {
        const m = w.m;
        m.t -= dt;
        if (m.stage === 'discuss' || m.stage === 'vote') {
          const el =
            m.stage === 'discuss'
              ? MEETING_DISCUSS_TIME - m.t
              : MEETING_DISCUSS_TIME + (MEETING_VOTE_TIME - m.t);
          for (const s of m.sched) {
            if (!s.done && el >= s.at) {
              s.done = true;
              const bp = room.players.find((x) => x.id === s.pid);
              if (bp && bp.alive) {
                this.pushMeetingChat(room, { fromId: bp.id, from: bp.name, color: bp.color, text: s.text });
                room.players.forEach((q) => {
                  if (q !== bp && s.text.includes(q.name)) {
                    m.mention[q.id] = (m.mention[q.id] || 0) + 1;
                  }
                });
              }
            }
          }
        }
        if (m.stage === 'discuss') {
          if (m.t <= 0) {
            m.stage = 'vote';
            m.t = MEETING_VOTE_TIME;
            this.broadcastRoom(room, {
              type: 'meeting_stage',
              stage: 'vote',
              t: MEETING_VOTE_TIME,
            });
            this.pushMeetingChat(room, { sys: true, text: 'ভোট শুরু হয়েছে! সন্দেহজনক যাত্রীকে বেছে নাও।' });
          }
        } else if (m.stage === 'vote') {
          const ev = MEETING_VOTE_TIME - m.t;
          for (const p of room.players) {
            if (p.alive && p.isBot && m.votes[p.id] === undefined && ev >= (m.botAt[p.id] || 8)) {
              const choice = botVoteDecision(p, w, m);
              this.castVote(room, p.id, choice);
              if (room.phase !== 'meeting' || m.stage !== 'vote') break;
            }
          }
          if (m.stage === 'vote' && m.t <= 0) {
            this.resolveVotes(room);
          }
        } else if (m.stage === 'result') {
          room.verdictTimer -= dt;
          if (room.verdictTimer <= 0) {
            this.resumeFromMeeting(room);
          }
        }
        continue;
      }

      if (room.phase !== 'play') continue;

      // Active play tick (20Hz)
      w.t += dt;
      room.matchTimer = Math.max(0, room.matchTimer - dt);
      w.matchTimer = room.matchTimer;
      if (room.matchTimer <= 0) {
        this.finishGame(room, 'fakers', '১৫০ সেকেন্ড শেষ! ট্রেন গন্তব্যে পৌঁছানোর আগেই চোর পালিয়েছে!');
        continue;
      }

      w.sabotage.cooldown = Math.max(0, w.sabotage.cooldown - dt);
      if (w.sabotage.active === 'brakes') {
        w.sabotage.timer -= dt;
        if (w.sabotage.timer <= 0) {
          this.finishGame(room, 'fakers', 'জরুরি ব্রেক রিসেট না হওয়ায় মেট্রোর নিয়ন্ত্রণ নষ্ট হয়েছে!');
          continue;
        }
      }

      for (const vid in w.ventAnim) {
        w.ventAnim[vid] = Math.max(0, w.ventAnim[vid] - dt * 2.4);
      }

      const doorsLocked = w.sabotage.doorLockedUntil > w.t;

      // Update humans + server bots
      for (const p of room.players) {
        p.coolSteal = Math.max(0, p.coolSteal - dt);
        p.coolCheck = Math.max(0, p.coolCheck - dt);

        if (p.isBot) {
          updateBot(p, dt, w, {
            onFinishTask: (bp, idx) => this.completeTask(room, bp as ServerPlayer, idx),
            onSteal: (bk, bv) => this.executeSteal(room, bk as ServerPlayer, bv as ServerPlayer),
            onStartMeeting: (cid, b) => this.startMeeting(room, cid, b),
            onTriggerSabotage: (st) => this.triggerSabotage(room, st),
            onFixSabotagePart: (id) => this.fixSabotagePart(room, id, p),
          });
          if (room.phase !== 'play') break;
        } else {
          const st = getPlayerStatus(p, w);
          p.speedMul = st.speedMultiplier;
          p.slowReason = st.slowReason;
          if (p.inVent === null && st.stunnedLeft <= 0) {
            const ix = p.inputDx;
            const iy = p.inputDy;
            const mag = Math.hypot(ix, iy);
            p.moving = mag > 0.12;
            if (p.moving) {
              const baseSpeed = p.alive ? 152 : 185;
              const speed = p.alive ? baseSpeed * st.speedMultiplier : baseSpeed;
              const nx = mag > 1 ? ix / mag : ix;
              const ny = mag > 1 ? iy / mag : iy;
              if (p.alive) {
                movePlayer(p, nx * speed * dt, ny * speed * dt, doorsLocked);
              } else {
                p.x = Math.max(20, Math.min(6480, p.x + nx * speed * dt));
                p.y = Math.max(BENCH, Math.min(CH - BENCH, p.y + ny * speed * dt));
              }
              if (Math.abs(nx) > 0.12) p.face = nx > 0 ? 1 : -1;
              p.ph += dt * (p.alive ? Math.max(0.55, st.speedMultiplier) : 1);
            }
          } else {
            p.moving = false;
          }
        }
        p.lastCoach = coachOf(p.x);
      }
      if (room.phase !== 'play') continue;

      // Station physics on server
      const stopped = w.t < w.stationStopUntil;
      const timeToSt = w.nextStation - w.t;
      const approaching = !stopped && timeToSt <= 5.5 && timeToSt > 0;
      const targetSp = stopped ? 0 : approaching ? Math.max(0.06, timeToSt / 5.5) : 1;
      w.trainSpeed += (targetSp - w.trainSpeed) * Math.min(1, dt * 2.2);
      if (stopped && w.trainSpeed < 0.025) w.trainSpeed = 0;
      const doorsOpen = stopped && w.stationStopUntil - w.t > 0.8;
      w.stationDoorOpen += ((doorsOpen ? 1 : 0) - w.stationDoorOpen) * Math.min(1, dt * 4.5);
      if (!stopped && w.t >= w.nextStation) {
        w.stIdx = (w.stIdx + 1) % STATIONS.length;
        w.stationStopUntil = w.t + 4.8;
        w.nextStation += 38;
      }

      // Broadcast sanitized state snapshot (NO roles, NO others' tasks!)
      this.broadcastStateSnapshot(room);
    }
  }


  private broadcastStateSnapshot(room: ServerRoom): void {
    const w = room.world;
    if (!w) return;
    const sharedPlayers = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      acc: p.acc,
      skin: p.skin,
      pants: p.pants,
      hair: p.hair,
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      face: p.face,
      moving: p.moving,
      alive: p.alive,
      inVent: p.inVent,
      scanningUntil: p.scanningUntil,
      lungeUntil: p.lungeUntil,
      stunnedUntil: Math.round((p.stunnedUntil || 0) * 100) / 100,
      hasteUntil: Math.round((p.hasteUntil || 0) * 100) / 100,
      speedMul: Math.round((p.speedMul ?? 1) * 100) / 100,
      slowReason: p.slowReason || null,
      coolSteal: 0,
      coolCheck: 0,
      uses: 0,
      chains: 0,
      isBot: p.isBot,
      connected: p.connected,
    }));

    const basePayload = {
      type: 'state',
      t: Math.round(w.t * 100) / 100,
      matchTimer: Math.round(room.matchTimer * 10) / 10,
      trainSpeed: Math.round(w.trainSpeed * 1000) / 1000,
      stIdx: w.stIdx,
      stationDoorOpen: Math.round(w.stationDoorOpen * 1000) / 1000,
      totalTasks: w.totalTasks,
      doneTasks: w.doneTasks,
      sabotage: w.sabotage,
      ventAnim: w.ventAnim,
      players: sharedPlayers,
      bodies: w.bodies,
    };

    for (const p of room.players) {
      if (p.isBot || !p.connected) continue;
      const conn = this.socketsByToken.get(p.token);
      if (conn && conn.ws.readyState === WebSocket.OPEN) {
        this.send(conn.ws, {
          ...basePayload,
          ackSeq: p.lastSeq,
          self: {
            coolSteal: Math.round(p.coolSteal * 10) / 10,
            coolCheck: Math.round(p.coolCheck * 10) / 10,
            uses: p.uses,
            chains: p.chains,
            tasksDone: p.tasks.map((tk) => tk.done),
          },
        });
      }
    }
  }
}
