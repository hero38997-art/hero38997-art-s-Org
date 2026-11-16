import { soundEngine } from './audio';
import {
  BENCH,
  CCTV_CONSOLE,
  CH,
  CHAIN,
  RADAR_CONSOLE,
  SABOTAGE_SPOTS,
  SEATS,
  SPOTS,
  STATIONS,
  VENTS,
  coachOf,
  getPlayerStatus,
  movePlayer,
  rnd,
} from './mapData';
import type {
  GameWorld,
  LobbyChatEntry,
  LobbyConfig,
  NetRoomState,
  Player,
  PlayerTask,
  Role,
  SabotageType,
  StolenBody,
} from './types';

export type NetStatus = 'disconnected' | 'connecting' | 'connected';

interface RemoteTarget {
  x: number;
  y: number;
  face: 1 | -1;
  moving: boolean;
}

interface PredFrame {
  seq: number;
  x: number;
  y: number;
}

const TOKEN_STORAGE_KEY = 'tm_rejoin_token_v1';

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private status: NetStatus = 'disconnected';
  private pendingQueue: string[] = [];
  private room: NetRoomState | null = null;
  private world: GameWorld | null = null;
  private myId: number | null = null;
  private token: string | null = null;
  private lastError = '';

  private intentionalLeave = false;
  private isReconnecting = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private silentStartupRejoin = false;
  private pendingTaskSentAt = new Map<number, number>();

  private inputSeq = 0;
  private lastSentInputAt = 0;
  private lastSentDx = 0;
  private lastSentDy = 0;
  private predHistory: PredFrame[] = [];
  private remoteTargets = new Map<number, RemoteTarget>();
  private prevStIdx = -1;
  private prevDoorOpen = 0;
  private meetingVoteTime = 16;

  private onSyncCallback: (() => void) | null = null;
  private onErrorCallback: ((msg: string) => void) | null = null;

  constructor() {
    try {
      const saved = sessionStorage.getItem(TOKEN_STORAGE_KEY);
      if (saved) this.token = saved;
    } catch {
      // ignore
    }
  }

  public setCallbacks(onSync: () => void, onError: (msg: string) => void): void {
    this.onSyncCallback = onSync;
    this.onErrorCallback = onError;
  }

  public getStatus(): NetStatus {
    return this.status;
  }

  public isReconnectingSession(): boolean {
    return this.isReconnecting;
  }

  public getRoom(): NetRoomState | null {
    return this.room;
  }

  public getWorld(): GameWorld | null {
    return this.world;
  }

  public getMyId(): number | null {
    return this.myId;
  }

  public getLastError(): string {
    return this.lastError;
  }

  public clearError(): void {
    this.lastError = '';
  }

  public tryResumeSession(): void {
    if (!this.token || this.room || this.world) return;
    this.intentionalLeave = false;
    this.silentStartupRejoin = true;
    this.isReconnecting = true;
    this.connect();
    this.sendRaw({ type: 'rejoin', token: this.token });
  }

  private emitSync(): void {
    this.onSyncCallback?.();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalLeave || !this.token) return;
    const shouldRecover = Boolean((this.world && this.world.phase !== 'end') || this.room);
    if (!shouldRecover) return;
    if (this.reconnectAttempt >= 16) {
      this.isReconnecting = false;
      this.lastError = 'সংযোগ বিচ্ছিন্ন হয়েছে। অনুগ্রহ করে আবার চেষ্টা করো।';
      this.onErrorCallback?.(this.lastError);
      this.emitSync();
      return;
    }
    this.isReconnecting = true;
    const delay = Math.min(3000, 900 + this.reconnectAttempt * 350);
    this.reconnectAttempt++;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalLeave || !this.token) return;
      const stillNeedsRecover = Boolean((this.world && this.world.phase !== 'end') || this.room);
      if (!stillNeedsRecover) return;
      // Clear stale offline messages so 'rejoin' is always the first frame sent on reconnect
      this.pendingQueue = [];
      this.connect();
      this.sendRaw({ type: 'rejoin', token: this.token });
    }, delay);
  }

  private connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.status = 'connecting';
    this.emitSync();

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.status = 'connected';
      this.reconnectAttempt = 0;
      while (this.pendingQueue.length > 0) {
        const msg = this.pendingQueue.shift();
        if (msg) ws.send(msg);
      }
      this.emitSync();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        this.handleServerMsg(msg);
      } catch {
        // ignore invalid message
      }
    };

    ws.onclose = () => {
      this.status = 'disconnected';
      this.ws = null;
      this.scheduleReconnect();
      this.emitSync();
    };

    ws.onerror = () => {
      if (!this.isReconnecting && !this.silentStartupRejoin) {
        this.lastError = 'সার্ভারের সাথে সংযোগ করতে সমস্যা হয়েছে।';
      }
      this.emitSync();
    };
  }

  private sendRaw(payload: unknown): void {
    const str = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(str);
    } else {
      this.pendingQueue.push(str);
      this.connect();
    }
  }

  public quickplay(cfg: LobbyConfig): void {
    this.intentionalLeave = false;
    this.silentStartupRejoin = false;
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.lastError = '';
    this.world = null;
    this.room = null;
    this.pendingQueue = [];
    this.sendRaw({
      type: 'quickplay',
      name: cfg.name,
      color: cfg.color,
      acc: cfg.acc,
      skin: cfg.skin,
    });
  }

  public createPrivate(cfg: LobbyConfig, fillBots: boolean, maxPlayers: number, teamName?: string): void {
    this.intentionalLeave = false;
    this.silentStartupRejoin = false;
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.lastError = '';
    this.world = null;
    this.room = null;
    this.pendingQueue = [];
    this.sendRaw({
      type: 'create_private',
      name: cfg.name,
      teamName: teamName?.trim() || undefined,
      color: cfg.color,
      acc: cfg.acc,
      skin: cfg.skin,
      fillBots,
      maxPlayers,
    });
  }

  public joinPrivate(code: string, cfg: LobbyConfig): void {
    this.intentionalLeave = false;
    this.silentStartupRejoin = false;
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.lastError = '';
    this.world = null;
    this.room = null;
    this.pendingQueue = [];
    this.sendRaw({
      type: 'join_private',
      code: code.trim().toUpperCase(),
      name: cfg.name,
      color: cfg.color,
      acc: cfg.acc,
      skin: cfg.skin,
    });
  }

  public startMatch(): void {
    this.sendRaw({ type: 'start' });
  }

  public sendToggleReady(ready?: boolean): void {
    this.sendRaw({ type: 'toggle_ready', ready });
  }

  public sendKick(targetId: number): void {
    this.sendRaw({ type: 'kick', targetId });
  }

  public sendTransferHost(targetId: number): void {
    this.sendRaw({ type: 'transfer_host', targetId });
  }

  public sendUpdateRoom(opts: { teamName?: string; fillBots?: boolean; maxPlayers?: number }): void {
    this.sendRaw({ type: 'update_room', ...opts });
  }

  public sendLobbyChat(text: string): void {
    this.sendRaw({ type: 'lobby_chat', text });
  }

  public sendReturnLobby(): void {
    this.sendRaw({ type: 'return_lobby' });
  }

  public leaveRoom(): void {
    this.intentionalLeave = true;
    this.silentStartupRejoin = false;
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.pendingQueue = [];
    this.pendingTaskSentAt.clear();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'leave' }));
    }
    this.room = null;
    this.world = null;
    this.myId = null;
    this.token = null;
    this.remoteTargets.clear();
    this.predHistory = [];
    soundEngine.setRumble(false);
    try {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // ignore
    }
    this.emitSync();
  }

  public sendInput(dx: number, dy: number, force = false): void {
    const now = performance.now();
    const changed = Math.hypot(dx - this.lastSentDx, dy - this.lastSentDy) > 0.08;
    if (!force && !changed && now - this.lastSentInputAt < 50) return;
    if (!force && dx === 0 && dy === 0 && this.lastSentDx === 0 && this.lastSentDy === 0) return;
    this.lastSentInputAt = now;
    this.lastSentDx = dx;
    this.lastSentDy = dy;
    this.inputSeq++;
    this.sendRaw({ type: 'input', dx, dy, seq: this.inputSeq });
  }

  public sendAction(): void {
    this.sendRaw({ type: 'action' });
  }

  public sendAlarm(): void {
    this.sendRaw({ type: 'alarm' });
  }

  public sendReport(): void {
    this.sendRaw({ type: 'report' });
  }

  public sendVent(): void {
    this.sendRaw({ type: 'vent' });
  }

  public sendCycleVent(dir: 1 | -1): void {
    this.sendRaw({ type: 'cycle_vent', dir });
  }

  public sendCompleteTask(taskIndex: number): void {
    const w = this.world;
    if (!w || !w.me.tasks[taskIndex] || w.me.tasks[taskIndex].done) return;
    const now = performance.now();
    const lastSent = this.pendingTaskSentAt.get(taskIndex) || 0;
    if (now - lastSent < 1500) return;
    this.pendingTaskSentAt.set(taskIndex, now);
    // Wait for server task_ack / snapshot before marking task completed
    this.sendRaw({ type: 'task_complete', taskIndex });
  }

  public sendScanStart(): void {
    this.sendRaw({ type: 'scan_start' });
  }

  public sendSabotage(sabType: Exclude<SabotageType, null>): void {
    this.sendRaw({ type: 'sabotage', sabType });
    if (this.world) this.world.modal = null;
  }

  public sendFixSabotage(spotId: string): void {
    this.sendRaw({ type: 'fix_sabotage', spotId });
    if (this.world) this.world.modal = null;
  }

  public sendChat(text: string): void {
    this.sendRaw({ type: 'chat', text });
  }

  public sendSuspect(targetId: number): void {
    this.sendRaw({ type: 'suspect', targetId });
  }

  public sendVote(targetId: number | null): void {
    this.sendRaw({ type: 'vote', targetId });
    soundEngine.sfx('vote');
    if (this.world?.m && this.myId !== null) {
      this.world.m.votes[this.myId] = targetId === null ? -1 : targetId;
    }
  }

  private handleServerMsg(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    if (type === 'welcome') {
      this.myId = msg.playerId as number;
      this.token = msg.token as string;
      this.isReconnecting = false;
      this.silentStartupRejoin = false;
      this.reconnectAttempt = 0;
      this.lastError = '';
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, this.token);
      } catch {
        // ignore
      }
      this.emitSync();
      return;
    }

    if (type === 'kicked') {
      const m = String(msg.msg || 'তোমাকে রুম থেকে সরিয়ে দেওয়া হয়েছে।');
      this.intentionalLeave = true;
      this.isReconnecting = false;
      this.clearReconnectTimer();
      this.room = null;
      this.world = null;
      this.myId = null;
      this.token = null;
      this.lastError = m;
      soundEngine.setRumble(false);
      try {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        // ignore
      }
      this.onErrorCallback?.(m);
      this.emitSync();
      return;
    }

    if (type === 'return_lobby') {
      this.world = null;
      this.remoteTargets.clear();
      this.predHistory = [];
      soundEngine.setRumble(false);
      this.emitSync();
      return;
    }

    if (type === 'error') {
      const m = String(msg.msg || 'একটি ত্রুটি ঘটেছে।');
      const sessionExpired =
        m.includes('সেশন শেষ') ||
        m.includes('রুমটি আর নেই') ||
        m.includes('প্লেয়ার পাওয়া যায়নি') ||
        m.includes('সময় শেষ') ||
        m.includes('সময় পার');

      if (sessionExpired) {
        this.isReconnecting = false;
        this.clearReconnectTimer();
        this.token = null;
        this.room = null;
        this.world = null;
        soundEngine.setRumble(false);
        try {
          sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        } catch {
          // ignore
        }
        if (this.silentStartupRejoin) {
          this.silentStartupRejoin = false;
          this.emitSync();
          return;
        }
      }

      this.lastError = m;
      this.onErrorCallback?.(m);
      if (this.world) {
        this.world.toastText = m;
        this.world.toastUntil = this.world.t + 3;
      }
      this.emitSync();
      return;
    }

    if (type === 'room') {
      this.room = {
        code: String(msg.code),
        isPublic: Boolean(msg.isPublic),
        teamName: msg.teamName ? String(msg.teamName) : undefined,
        hostId: Number(msg.hostId),
        maxPlayers: Number(msg.maxPlayers),
        fillBots: Boolean(msg.fillBots),
        countdown: msg.countdown === null ? null : Number(msg.countdown),
        phase: (msg.phase as GameWorld['phase']) || 'lobby',
        players: (msg.players as NetRoomState['players']) || [],
        lobbyChat: (msg.lobbyChat as LobbyChatEntry[]) || this.room?.lobbyChat || [],
      };
      this.emitSync();
      return;
    }

    if (type === 'lobby_chat') {
      if (this.room && msg.entry) {
        const entry = msg.entry as LobbyChatEntry;
        const list = this.room.lobbyChat || [];
        if (!list.some((x) => x.id === entry.id)) {
          this.room = {
            ...this.room,
            lobbyChat: [...list.slice(-24), entry],
          };
          this.emitSync();
        }
      }
      return;
    }

    if (type === 'role') {
      this.initOnlineWorld(msg);
      soundEngine.sfx('role');
      this.emitSync();
      return;
    }

    if (type === 'state') {
      this.applyStateSnapshot(msg);
      return;
    }

    if (type === 'private') {
      this.handlePrivateMsg(msg);
      return;
    }

    if (type === 'meeting') {
      this.handleMeetingStart(msg);
      this.emitSync();
      return;
    }

    if (type === 'meeting_stage') {
      if (this.world?.m) {
        const nextStage = msg.stage as 'discuss' | 'vote';
        if (nextStage === 'vote') {
          this.world.m.stage = 'vote';
          this.world.m.t = Number(msg.t || this.meetingVoteTime);
        }
        this.emitSync();
      }
      return;
    }

    if (type === 'chat') {
      if (this.world?.m) {
        const id = Number(msg.id);
        if (!this.world.m.chatLog.some((c) => c.id === id)) {
          this.world.m.chatLog.push({
            id,
            name: msg.from ? String(msg.from) : undefined,
            color: msg.color ? String(msg.color) : undefined,
            text: String(msg.text || ''),
            sys: Boolean(msg.sys),
          });
        }
        this.emitSync();
      }
      return;
    }

    if (type === 'votes') {
      if (this.world?.m) {
        const votedIds = (msg.votedIds as number[]) || [];
        votedIds.forEach((pid) => {
          if (this.world?.m && this.world.m.votes[pid] === undefined) {
            this.world.m.votes[pid] = -2; // sentinel indicating player has cast a secret vote
          }
        });
        this.emitSync();
      }
      return;
    }

    if (type === 'verdict') {
      if (this.world?.m) {
        const ejectedId = msg.ejectedId as number | null;
        const out = ejectedId !== null ? this.world.players.find((p) => p.id === ejectedId) || null : null;
        this.world.m.out = out;
        this.world.m.stage = 'result';
        this.world.m.t = 4.5;
        const counts = (msg.counts as Record<number, number>) || {};
        // Reconstruct tally votes so MeetingModal displays exact vote bars
        const fakeVotes: Record<number, number> = {};
        let vid = 1000;
        for (const tidStr of Object.keys(counts)) {
          const tid = Number(tidStr);
          for (let c = 0; c < counts[tid]; c++) {
            fakeVotes[vid++] = tid;
          }
        }
        const skipCount = Number(msg.skipCount || 0);
        for (let s = 0; s < skipCount; s++) {
          fakeVotes[vid++] = -1;
        }
        this.world.m.votes = fakeVotes;
        this.emitSync();
      }
      return;
    }

    if (type === 'end') {
      if (this.world) {
        const roles = (msg.roles as Array<{ id: number; role: Role; alive: boolean }>) || [];
        roles.forEach((r) => {
          const p = this.world?.players.find((x) => x.id === r.id);
          if (p) {
            p.role = r.role;
            p.alive = r.alive;
          }
        });
        this.world.phase = 'end';
        this.world.modal = null;
        this.world.m = null;
        this.world.endWinner = msg.winner as 'passengers' | 'fakers';
        this.world.endReason = String(msg.reason || '');
        soundEngine.setRumble(false);
        const iWin = (this.world.endWinner === 'fakers') === (this.world.me.role === 'faker');
        soundEngine.sfx(iWin ? 'win' : 'lose');
        if (this.room?.isPublic !== false) {
          try {
            sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            // ignore
          }
        }
        this.emitSync();
      }
    }
  }

  private initOnlineWorld(msg: Record<string, unknown>): void {
    const role = msg.role as Role;
    const rawTasks = (msg.tasks as Array<{ spotId: number; done: boolean }>) || [];
    const seatIdx = Number(msg.seatIdx || 0);
    const stIdx = Number(msg.stIdx || 0);
    const matchTimer = Number(msg.matchTimer || 150);
    const isRejoin = Boolean(msg.rejoin);
    const playersState =
      (msg.playersState as Array<{ id: number; alive: boolean; x: number; y: number }>) || [];

    const tasks: PlayerTask[] = rawTasks
      .map((rt) => {
        const spot = SPOTS.find((s) => s.id === rt.spotId);
        return spot ? { spot, done: rt.done } : null;
      })
      .filter((x): x is PlayerTask => x !== null);

    const roomPlayers = this.room?.players || [];
    const myId = this.myId ?? roomPlayers[0]?.id ?? 1;
    const players: Player[] = roomPlayers.map((rp, idx) => {
      const seat = SEATS[(seatIdx + idx) % SEATS.length];
      const pState = playersState.find((ps) => ps.id === rp.id);
      return {
        id: rp.id,
        name: rp.name,
        color: rp.color,
        acc: rp.acc,
        skin: rp.skin,
        pants: '#262e42',
        hair: '#221814',
        isMe: rp.id === myId,
        role: rp.id === myId ? role : 'passenger',
        alive: pState ? pState.alive : true,
        x: pState ? pState.x : seat.x,
        y: pState ? pState.y : seat.side ? CH - BENCH - 14 : BENCH + 14,
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
        seat: rp.id === myId ? SEATS[seatIdx] || seat : seat,
        tasks: rp.id === myId ? tasks : [],
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
          huntCd: 10,
          stuck: 0,
          nudge: 0,
          nx: 0,
          ny: 0,
          chkCd: 10,
          reportT: 0,
          rep: false,
        },
      };
    });

    const me = players.find((p) => p.isMe) || players[0];
    this.prevStIdx = stIdx;
    this.prevDoorOpen = 0;
    this.remoteTargets.clear();
    this.predHistory = [];
    this.pendingTaskSentAt.clear();

    const restoredPhase: GameWorld['phase'] =
      isRejoin && msg.phase === 'meeting'
        ? 'meeting'
        : isRejoin && msg.phase === 'play'
        ? 'play'
        : 'intro';

    this.world = {
      phase: restoredPhase,
      players,
      me,
      t: isRejoin ? Number(msg.t || 0) : 0,
      scroll: 0,
      trainSpeed: 1,
      stationStopUntil: 0,
      stationDoorOpen: 0,
      ventAnim: {},
      bodies: isRejoin ? ((msg.bodies as StolenBody[]) || []) : [],
      particles: [],
      footprints: [],
      shockwaves: [],
      totalTasks: isRejoin ? Math.max(1, Number(msg.totalTasks || 1)) : 1,
      doneTasks: isRejoin ? Number(msg.doneTasks || 0) : 0,
      nearTask: null,
      nearChain: false,
      nearBody: null,
      nearVent: null,
      nearSabFix: null,
      nearCctv: false,
      nearRadar: false,
      hold: { task: null, prog: 0 },
      sabotage:
        isRejoin && msg.sabotage
          ? (msg.sabotage as GameWorld['sabotage'])
          : {
              active: null,
              timer: 0,
              fixedParts: {},
              cooldown: 14,
              doorLockedUntil: 0,
            },
      camsInUse: false,
      m: null,
      cam: { x: me.x, y: CH / 2, shake: 0 },
      hitFlash: 0,
      modal: null,
      nextStation: 26,
      stIdx,
      fakers: 1,
      endReason: '',
      endWinner: null,
      toastText: '',
      toastUntil: 0,
      isOnline: true,
      matchTimer,
    };
  }

  public beginOnlinePlay(): void {
    if (!this.world || this.world.phase !== 'intro') return;
    this.world.phase = 'play';
    soundEngine.setRumble(true);
    this.world.toastText = `পরবর্তী স্টেশন: ${STATIONS[this.world.stIdx]}`;
    this.world.toastUntil = this.world.t + 3;
    this.emitSync();
  }

  private applyStateSnapshot(msg: Record<string, unknown>): void {
    const w = this.world;
    if (!w || w.phase === 'end') return;

    if (w.phase === 'meeting') {
      // Server resumed from meeting without ejection!
      w.phase = 'play';
      w.m = null;
      w.modal = null;
      soundEngine.setRumble(true);
    }

    w.t = Number(msg.t || w.t);
    w.matchTimer = Number(msg.matchTimer ?? w.matchTimer ?? 150);
    w.trainSpeed = Number(msg.trainSpeed ?? w.trainSpeed);
    const nextStIdx = Number(msg.stIdx ?? w.stIdx);
    if (nextStIdx !== this.prevStIdx && this.prevStIdx >= 0) {
      this.prevStIdx = nextStIdx;
      soundEngine.sfx('chime');
      soundEngine.sfx('dooropen');
      w.toastText = `স্টেশন: ${STATIONS[nextStIdx]} — দরজা খুলছে`;
      w.toastUntil = w.t + 3.4;
    }
    w.stIdx = nextStIdx;

    const nextDoor = Number(msg.stationDoorOpen ?? w.stationDoorOpen);
    if (this.prevDoorOpen > 0.85 && nextDoor <= 0.85) {
      soundEngine.sfx('doorbeep');
    }
    this.prevDoorOpen = nextDoor;
    w.stationDoorOpen = nextDoor;

    w.totalTasks = Math.max(1, Number(msg.totalTasks || w.totalTasks));
    w.doneTasks = Number(msg.doneTasks || 0);
    w.sabotage = (msg.sabotage as GameWorld['sabotage']) || w.sabotage;
    if (w.sabotage.active === 'comms' && (w.modal?.kind === 'cctv' || w.modal?.kind === 'radar')) {
      w.camsInUse = false;
      w.modal = null;
    }
    w.ventAnim = (msg.ventAnim as Record<number, number>) || w.ventAnim;

    const prevBodiesCount = w.bodies.length;
    w.bodies = (msg.bodies as StolenBody[]) || [];
    if (w.bodies.length > prevBodiesCount) {
      const nb = w.bodies[w.bodies.length - 1];
      w.shockwaves.push({
        x: nb.x,
        y: nb.y - 10,
        r: 8,
        maxR: 72,
        alpha: 0.9,
        color: '#ef4444',
      });
    }

    const ackSeq = Number(msg.ackSeq || 0);
    const selfData = (msg.self as Record<string, unknown> | undefined) || undefined;
    const sPlayers = (msg.players as Array<Record<string, unknown>>) || [];

    for (const sp of sPlayers) {
      const pid = Number(sp.id);
      const local = w.players.find((p) => p.id === pid);
      if (!local) continue;

      const wasAlive = local.alive;
      local.alive = Boolean(sp.alive);
      if (wasAlive && !local.alive && local.isMe) {
        soundEngine.sfx('steal');
        w.cam.shake = 0.65;
        w.hitFlash = 1;
        w.modal = null;
      }

      const sx = Number(sp.x);
      const sy = Number(sp.y);
      const nextInVent = sp.inVent === null ? null : Number(sp.inVent);
      const bigJump = Math.hypot(sx - local.x, sy - local.y) > 72 || local.inVent !== nextInVent;

      const prevStunned = local.stunnedUntil > w.t;
      const prevHaste = local.hasteUntil > w.t;
      const prevLunge = local.lungeUntil > w.t;
      local.inVent = nextInVent;
      local.scanningUntil = Number(sp.scanningUntil || 0);
      local.lungeUntil = Number(sp.lungeUntil || 0);
      local.stunnedUntil = Number(sp.stunnedUntil || 0);
      local.hasteUntil = Number(sp.hasteUntil || 0);
      local.speedMul = sp.speedMul !== undefined ? Number(sp.speedMul) : 1;
      local.slowReason = sp.slowReason ? String(sp.slowReason) : null;
      if (local.isMe && !prevLunge && local.lungeUntil > w.t) {
        soundEngine.sfx('steal');
        w.cam.shake = 0.4;
      }
      if (local.isMe && !prevStunned && local.stunnedUntil > w.t) {
        soundEngine.sfx('stun');
        w.cam.shake = 0.55;
        w.shockwaves.push({ x: sx, y: sy - 12, r: 6, maxR: 48, alpha: 0.9, color: '#38bdf8' });
      }
      if (local.isMe && !prevHaste && local.hasteUntil > w.t) {
        soundEngine.sfx('haste');
      }
      if (local.isMe && selfData) {
        local.coolSteal = Number(selfData.coolSteal ?? local.coolSteal);
        local.coolCheck = Number(selfData.coolCheck ?? local.coolCheck);
        local.uses = Number(selfData.uses ?? local.uses);
        local.chains = Number(selfData.chains ?? local.chains);
        if (Array.isArray(selfData.tasksDone)) {
          const td = selfData.tasksDone as boolean[];
          for (let i = 0; i < local.tasks.length && i < td.length; i++) {
            local.tasks[i].done = Boolean(td[i]);
          }
        }
      }
      local.pants = String(sp.pants || local.pants);
      local.hair = String(sp.hair || local.hair);

      if (local.isMe) {
        if (bigJump) {
          local.x = sx;
          local.y = sy;
          this.predHistory = [];
        } else {
          // Compare server position with predicted frame at ackSeq
          const pf = this.predHistory.find((f) => f.seq === ackSeq);
          const err = pf ? Math.hypot(sx - pf.x, sy - pf.y) : Math.hypot(sx - local.x, sy - local.y);
          if (err > 22) {
            local.x += (sx - local.x) * 0.45;
            local.y += (sy - local.y) * 0.45;
          }
          // Prune old prediction frames
          this.predHistory = this.predHistory.filter((f) => f.seq >= ackSeq);
        }
      } else {
        const face = (sp.face === -1 ? -1 : 1) as 1 | -1;
        const moving = Boolean(sp.moving);
        if (bigJump) {
          local.x = sx;
          local.y = sy;
          local.face = face;
          local.moving = moving;
        }
        this.remoteTargets.set(pid, { x: sx, y: sy, face, moving });
      }
      local.lastCoach = coachOf(local.x);
    }
  }

  private handlePrivateMsg(msg: Record<string, unknown>): void {
    const w = this.world;
    if (!w) return;
    const kind = msg.kind as string;

    if (kind === 'check') {
      const tid = Number(msg.targetId);
      const tname = String(msg.targetName || '');
      const isFaker = Boolean(msg.isFaker);
      const usesLeft = Number(msg.usesLeft ?? 0);
      w.me.known[tid] = isFaker;
      w.me.uses = usesLeft;
      soundEngine.sfx('check');
      w.toastText = `${tname}-এর টিকেট: ${isFaker ? 'ভুয়া টিকেট!' : 'বৈধ টিকেট'} (বাকি ${usesLeft})`;
      w.toastUntil = w.t + 4;
      this.emitSync();
    } else if (kind === 'witness') {
      const killerName = String(msg.killerName || 'কেউ একজন');
      const victimName = msg.victimName ? String(msg.victimName) : null;
      const wx = Number(msg.x || w.me.x);
      const wy = Number(msg.y || w.me.y);
      soundEngine.sfx('steal');
      w.shockwaves.push({ x: wx, y: wy, r: 10, maxR: 84, alpha: 0.95, color: '#ef4444' });
      w.toastText = victimName
        ? `সাক্ষী! তুমি ${killerName}-কে ${victimName}-এর ব্যাগ চুরি করতে দেখেছো!`
        : `সাক্ষী! তুমি ${killerName}-কে ভেন্ট থেকে বের হতে দেখেছো!`;
      w.toastUntil = w.t + 4.5;
      this.emitSync();
    } else if (kind === 'task_ack') {
      const idx = Number(msg.taskIndex);
      this.pendingTaskSentAt.delete(idx);
      const t = w.me.tasks[idx];
      if (t) {
        if (!t.done) {
          t.done = true;
          soundEngine.sfx('task');
          w.shockwaves.push({
            x: t.spot.x,
            y: t.spot.y,
            r: 8,
            maxR: 48,
            alpha: 0.85,
            color: '#4ade80',
          });
        }
      }
      this.emitSync();
    } else if (kind === 'task_reject') {
      const idx = Number(msg.taskIndex);
      this.pendingTaskSentAt.delete(idx);
      const t = w.me.tasks[idx];
      if (t) t.done = false;
      w.toastText = String(msg.reason || 'সার্ভার কাজটি অনুমোদন করেনি — আবার চেষ্টা করো!');
      w.toastUntil = w.t + 3.4;
      this.emitSync();
    } else if (kind === 'toast') {
      w.toastText = String(msg.text || '');
      w.toastUntil = w.t + 3.2;
      this.emitSync();
    }
  }

  private handleMeetingStart(msg: Record<string, unknown>): void {
    const w = this.world;
    if (!w) return;
    w.phase = 'meeting';
    w.modal = null;
    w.hold = { task: null, prog: 0 };
    w.sabotage.doorLockedUntil = 0;
    soundEngine.sfx('alarm');
    soundEngine.setRumble(false);

    const discussTime = Number(msg.discussTime || 12);
    const voteTime = Number(msg.voteTime || 16);
    this.meetingVoteTime = voteTime;
    const stage = (msg.stage as 'discuss' | 'vote') || 'discuss';
    const stageTimeLeft =
      msg.stageTimeLeft !== undefined
        ? Number(msg.stageTimeLeft)
        : stage === 'vote'
        ? voteTime
        : discussTime;
    const callerId = Number(msg.callerId || 0);
    const body = (msg.body as StolenBody | null) || null;
    const chatLog = (msg.chatLog as NonNullable<GameWorld['m']>['chatLog']) || [];
    const votes: Record<number, number> = {};
    const votedIds = (msg.votedIds as number[] | undefined) || [];
    votedIds.forEach((pid) => {
      votes[pid] = -2;
    });

    w.m = {
      stage,
      t: stageTimeLeft,
      callerId,
      body,
      votes,
      sched: [],
      botAt: {},
      mention: {},
      out: null,
      ejectProgress: 0,
      chatLog,
    };
  }

  /**
   * Called at 60fps during online match to predict local movement,
   * interpolate remote players, update local interaction prompts & particles.
   */
  public updateOnlineWorld(
    rawDt: number,
    input: { ix: number; iy: number; useHeld: boolean }
  ): void {
    const w = this.world;
    if (!w) return;
    const dt = Math.min(0.05, Math.max(0, rawDt));

    w.scroll += dt * 115 * w.trainSpeed;
    w.hitFlash = Math.max(0, w.hitFlash - dt * 2.2);
    w.cam.shake = Math.max(0, w.cam.shake - dt * 1.8);

    if (w.phase === 'meeting' && w.m) {
      w.m.t = Math.max(0, w.m.t - dt);
      if (w.m.stage === 'discuss' && w.m.t <= 0) {
        w.m.stage = 'vote';
        w.m.t = this.meetingVoteTime;
      }
      return;
    }

    if (w.phase !== 'play') return;

    w.t += dt;
    const me = w.me;
    const doorsLocked = w.sabotage.doorLockedUntil > w.t;

    // Update particles, footprints, shockwaves
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const pt = w.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) w.particles.splice(i, 1);
    }
    for (let i = w.footprints.length - 1; i >= 0; i--) {
      w.footprints[i].alpha -= dt * 0.36;
      if (w.footprints[i].alpha <= 0) w.footprints.splice(i, 1);
    }
    for (let i = w.shockwaves.length - 1; i >= 0; i--) {
      const sw = w.shockwaves[i];
      sw.r += (sw.maxR - sw.r) * Math.min(1, dt * 8.5) + dt * 65;
      sw.alpha -= dt * 1.9;
      if (sw.alpha <= 0 || sw.r >= sw.maxR) w.shockwaves.splice(i, 1);
    }

    // Local movement prediction with status effect multipliers
    const myStatus = getPlayerStatus(me, w);
    me.speedMul = myStatus.speedMultiplier;
    me.slowReason = myStatus.slowReason;

    let ix = input.ix;
    let iy = input.iy;
    if (w.modal || me.inVent !== null || myStatus.stunnedLeft > 0) {
      ix = 0;
      iy = 0;
    }
    if (myStatus.stunnedLeft > 0 && Math.random() < dt * 12) {
      w.particles.push({
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
    const mag = Math.hypot(ix, iy);
    if (mag > 1) {
      ix /= mag;
      iy /= mag;
    }
    me.moving = mag > 0.12;
    if (me.moving) {
      const baseSpeed = me.alive ? 152 : 185;
      const speed = me.alive ? baseSpeed * myStatus.speedMultiplier : baseSpeed;
      if (me.alive) {
        movePlayer(me, ix * speed * dt, iy * speed * dt, doorsLocked);
      } else {
        me.x = Math.max(20, Math.min(6480, me.x + ix * speed * dt));
        me.y = Math.max(BENCH, Math.min(CH - BENCH, me.y + iy * speed * dt));
      }
      if (Math.abs(ix) > 0.12) me.face = ix > 0 ? 1 : -1;
      me.ph += dt * (me.alive ? Math.max(0.55, myStatus.speedMultiplier) : 1);
      if (me.alive) {
        soundEngine.playFootstep();
        if (Math.random() < dt * 7.5) {
          w.footprints.push({
            x: me.x,
            y: me.y + 1,
            alpha: 0.72,
            color: me.color,
            angle: Math.atan2(iy, ix),
          });
        }
        if (Math.random() < dt * 8) {
          const pCol =
            myStatus.hasteLeft > 0
              ? 'rgba(67, 192, 122, 0.75)'
              : myStatus.slowMultiplier < 1
              ? 'rgba(245, 183, 61, 0.65)'
              : 'rgba(203, 213, 225, 0.45)';
          w.particles.push({
            x: me.x - ix * 8 + rnd(-4, 4),
            y: me.y + rnd(-2, 2),
            vx: -ix * rnd(12, 26),
            vy: rnd(-12, -2),
            life: 0.3,
            maxLife: 0.3,
            size: rnd(1.4, 2.5),
            color: pCol,
          });
        }
      }
    }
    this.sendInput(ix, iy);
    this.predHistory.push({ seq: this.inputSeq, x: me.x, y: me.y });
    if (this.predHistory.length > 40) this.predHistory.shift();

    // Smooth remote player interpolation
    for (const p of w.players) {
      if (p.isMe) continue;
      const tgt = this.remoteTargets.get(p.id);
      if (!tgt) continue;
      const k = Math.min(1, dt * 15);
      const ox = p.x;
      const oy = p.y;
      p.x += (tgt.x - p.x) * k;
      p.y += (tgt.y - p.y) * k;
      p.face = tgt.face;
      p.moving = tgt.moving || Math.hypot(tgt.x - ox, tgt.y - oy) > 1.2;
      if (p.moving) p.ph += dt;
      if (p.alive && p.moving && Math.random() < dt * 4.8) {
        w.footprints.push({
          x: p.x,
          y: p.y + 1,
          alpha: 0.6,
          color: p.color,
          angle: Math.atan2(tgt.y - oy, tgt.x - ox),
        });
      }
      p.lastCoach = coachOf(p.x);
    }

    // Local interaction prompts
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
    w.nearTask = nt;
    w.nearChain = me.alive && me.chains > 0 && Math.hypot(me.x - CHAIN.x, me.y - CHAIN.y) < 58;
    w.nearCctv = me.alive && Math.hypot(me.x - CCTV_CONSOLE.x, me.y - CCTV_CONSOLE.y) < 52;
    w.nearRadar = me.alive && Math.hypot(me.x - RADAR_CONSOLE.x, me.y - RADAR_CONSOLE.y) < 52;
    w.nearBody = me.alive
      ? w.bodies.find((b) => Math.hypot(b.x - me.x, b.y - me.y) < 88) || null
      : null;
    w.nearVent =
      me.alive && me.role === 'faker'
        ? VENTS.find((v) => Math.hypot(v.x - me.x, v.y - me.y) < 46) || null
        : null;
    w.nearSabFix =
      me.alive && w.sabotage.active && w.sabotage.active !== 'doors'
        ? SABOTAGE_SPOTS.find(
            (sb) =>
              sb.type === w.sabotage.active &&
              !w.sabotage.fixedParts[sb.id] &&
              Math.hypot(sb.x - me.x, sb.y - me.y) < 54
          ) || null
        : null;

    // Hold-to-complete tasks in online mode
    const miniTypes = ['swipe', 'wires', 'code', 'lights', 'clean', 'luggage', 'throttle', 'canteen', 'signal', 'wipe', 'scan'];
    if (nt && input.useHeld && !w.modal && !miniTypes.includes((nt as PlayerTask).spot.type)) {
      const holdTask = nt as PlayerTask;
      if (w.hold.task !== holdTask) w.hold = { task: holdTask, prog: 0 };
      w.hold.prog += dt * 1000;
      if (Math.random() < dt * 12) {
        const sp = holdTask.spot;
        w.particles.push({
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
      if (w.hold.prog >= holdTask.spot.dur) {
        const idx = me.tasks.indexOf(holdTask);
        if (idx >= 0) this.sendCompleteTask(idx);
        w.hold = { task: null, prog: 0 };
      }
    } else {
      w.hold = { task: null, prog: 0 };
    }

    // Smooth camera tracking
    const tx = me.x + (me.moving ? ix * 38 : 0);
    const ty = CH / 2 + (me.y - CH / 2) * 0.25;
    const k = Math.min(1, dt * 8.5);
    w.cam.x += (tx - w.cam.x) * k;
    w.cam.y += (ty - w.cam.y) * k;
  }
}

export const netClient = new MultiplayerClient();
