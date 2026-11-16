import { useCallback, useEffect, useRef, useState } from 'react';
import { EjectionCutscene } from './components/EjectionCutscene';
import { GameHUD } from './components/GameHUD';
import { EndGameModal, IntroModal } from './components/IntroAndEndModal';
import { MeetingModal } from './components/MeetingModal';
import { TaskMiniGame } from './components/TaskMiniGame';
import { TitleLobby } from './components/TitleLobby';
import { soundEngine } from './game/audio';
import {
  castVote,
  completeTask,
  createWorld,
  cycleVent,
  fixSabotagePart,
  isInteractiveMiniTask,
  pressAbility,
  pressReport,
  pressUse,
  sendMeetingChat,
  showToast,
  toggleVent,
  triggerSabotage,
  updateWorld,
} from './game/engine';
import { STATIONS } from './game/mapData';
import { netClient } from './game/netClient';
import { renderWorld } from './game/renderer';
import { GameWorld, LobbyConfig, SabotageType } from './game/types';

const DEFAULT_LOBBY: LobbyConfig = {
  name: '',
  color: 1,
  acc: 0,
  skin: 1,
  count: 7,
  fakers: 1,
};

function loadSavedLobby(): LobbyConfig {
  try {
    const raw = localStorage.getItem('tm_lobby_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_LOBBY, ...parsed };
      const count = Math.max(4, Math.min(7, Number(merged.count) || 7));
      const fakers = count >= 7 && merged.fakers === 2 ? 2 : 1;
      return { ...merged, count, fakers };
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOBBY;
}

export default function App() {
  const [lobbyConfig, setLobbyConfig] = useState<LobbyConfig>(loadSavedLobby);
  const [soundOn, setSoundOn] = useState<boolean>(soundEngine.enabled);
  const [worldVersion, setWorldVersion] = useState(0); // forces HUD/modal sync at ~12Hz or on event
  const [netError, setNetError] = useState('');

  const worldRef = useRef<GameWorld | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const stickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const useHeldRef = useRef<boolean>(false);

  const bumpUI = useCallback(() => {
    setWorldVersion((v) => (v + 1) & 0xfffffff);
  }, []);

  useEffect(() => {
    netClient.setCallbacks(
      () => bumpUI(),
      (err) => {
        setNetError(err);
        bumpUI();
      }
    );
    netClient.tryResumeSession();
  }, [bumpUI]);

  // Initialize audio on first user interaction
  useEffect(() => {
    const unlock = () => soundEngine.init();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  const getActiveWorld = (): GameWorld | null => {
    return netClient.getWorld() || worldRef.current;
  };

  const handleToggleSound = useCallback(() => {
    const next = !soundEngine.enabled;
    const w = netClient.getWorld() || worldRef.current;
    const inPlay = w?.phase === 'play';
    soundEngine.setEnabled(next, !!inPlay);
    setSoundOn(next);
  }, []);

  const saveLobbyCfg = useCallback(() => {
    try {
      localStorage.setItem('tm_lobby_v2', JSON.stringify(lobbyConfig));
    } catch {
      // ignore
    }
  }, [lobbyConfig]);

  const startOfflineGame = useCallback(() => {
    saveLobbyCfg();
    soundEngine.init();
    soundEngine.setRumble(false);
    setNetError('');
    netClient.leaveRoom();
    const w = createWorld(lobbyConfig);
    worldRef.current = w;
    useHeldRef.current = false;
    keysRef.current = {};
    stickRef.current = { x: 0, y: 0 };
    bumpUI();
  }, [lobbyConfig, saveLobbyCfg, bumpUI]);

  const handleQuickplay = useCallback(() => {
    saveLobbyCfg();
    soundEngine.init();
    setNetError('');
    worldRef.current = null;
    netClient.quickplay(lobbyConfig);
  }, [lobbyConfig, saveLobbyCfg]);

  const handleCreatePrivate = useCallback(
    (fillBots: boolean, maxPlayers: number, teamName: string) => {
      saveLobbyCfg();
      soundEngine.init();
      setNetError('');
      worldRef.current = null;
      netClient.createPrivate(lobbyConfig, fillBots, Math.max(4, Math.min(7, maxPlayers)), teamName);
    },
    [lobbyConfig, saveLobbyCfg]
  );

  const handleJoinPrivate = useCallback(
    (code: string) => {
      saveLobbyCfg();
      soundEngine.init();
      setNetError('');
      worldRef.current = null;
      netClient.joinPrivate(code, lobbyConfig);
    },
    [lobbyConfig, saveLobbyCfg]
  );

  const beginPlay = useCallback(() => {
    const online = netClient.getWorld();
    if (online) {
      netClient.beginOnlinePlay();
      return;
    }
    const w = worldRef.current;
    if (!w || w.phase !== 'intro') return;
    w.phase = 'play';
    soundEngine.setRumble(true);
    showToast(w, `পরবর্তী স্টেশন: ${STATIONS[w.stIdx]}`);
    bumpUI();
  }, [bumpUI]);

  const backToMenu = useCallback(() => {
    soundEngine.setRumble(false);
    if (netClient.getWorld() || netClient.getRoom()) {
      netClient.leaveRoom();
    }
    worldRef.current = null;
    useHeldRef.current = false;
    keysRef.current = {};
    setNetError('');
    bumpUI();
  }, [bumpUI]);

  const handleUseAction = useCallback(
    (w: GameWorld) => {
      if (w.me.alive && w.me.stunnedUntil > w.t) return;
      if (!w.isOnline) {
        pressUse(w, (v) => {
          useHeldRef.current = v;
        });
        return;
      }
      if (w.phase !== 'play' || w.modal || w.me.inVent !== null) return;
      if (w.nearSabFix) {
        w.modal = { kind: 'sabotageFix', spot: w.nearSabFix };
        return;
      }
      if (w.nearCctv && w.me.alive && w.sabotage.active !== 'comms') {
        w.camsInUse = true;
        w.modal = { kind: 'cctv' };
        return;
      }
      if (w.nearRadar && w.me.alive && w.sabotage.active !== 'comms') {
        w.modal = { kind: 'radar' };
        return;
      }
      if (w.nearTask) {
        if (isInteractiveMiniTask(w.nearTask.spot.type)) {
          w.modal = { kind: 'task', task: w.nearTask };
        } else {
          useHeldRef.current = true;
        }
        return;
      }
      if (w.nearChain && w.me.alive && w.me.chains > 0) {
        netClient.sendAlarm();
      }
    },
    []
  );

  const handleAbility = useCallback((w: GameWorld) => {
    if (w.me.alive && w.me.stunnedUntil > w.t) return;
    if (w.isOnline) {
      netClient.sendAction();
    } else {
      pressAbility(w);
    }
  }, []);

  const handleReport = useCallback((w: GameWorld) => {
    if (w.me.alive && w.me.stunnedUntil > w.t) return;
    if (w.isOnline) {
      netClient.sendReport();
    } else {
      pressReport(w);
    }
  }, []);

  const handleToggleVent = useCallback((w: GameWorld) => {
    if (w.me.alive && w.me.stunnedUntil > w.t) return;
    if (w.isOnline) {
      netClient.sendVent();
    } else {
      toggleVent(w);
    }
  }, []);

  const handleCycleVent = useCallback((w: GameWorld, dir: 1 | -1) => {
    if (w.isOnline) {
      netClient.sendCycleVent(dir);
    } else {
      cycleVent(w, dir);
    }
  }, []);

  // Isolated 60fps simulation & Canvas render loop
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    let uiAcc = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      const online = netClient.getWorld();
      const w = online || worldRef.current;

      if (w) {
        const k = keysRef.current;
        let ix = 0;
        let iy = 0;
        if (k.arrowleft || k.a) ix -= 1;
        if (k.arrowright || k.d) ix += 1;
        if (k.arrowup || k.w) iy -= 1;
        if (k.arrowdown || k.s) iy += 1;
        ix += stickRef.current.x;
        iy += stickRef.current.y;

        if (w.isOnline) {
          netClient.updateOnlineWorld(dt, { ix, iy, useHeld: useHeldRef.current });
        } else {
          updateWorld(w, dt, { ix, iy, useHeld: useHeldRef.current });
        }
        renderWorld(ctx, window.innerWidth, window.innerHeight, dpr, w);

        uiAcc += dt;
        if (uiAcc >= 0.085) {
          uiAcc = 0;
          setWorldVersion((v) => (v + 1) & 0xfffffff);
        }
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const w = netClient.getWorld() || worldRef.current;
      if (!w) return;
      const k = e.key.toLowerCase();
      keysRef.current[k] = true;

      if (w.phase === 'play') {
        if (k === 'escape' && w.modal) {
          w.camsInUse = false;
          w.modal = null;
          bumpUI();
          return;
        }
        if (k === 'm' || k === 'tab') {
          e.preventDefault();
          if (w.modal?.kind === 'map') {
            w.modal = null;
          } else if (!w.modal) {
            w.modal = { kind: 'map' };
          }
          bumpUI();
          return;
        }
        if (k === 'f' && w.me.role === 'faker' && w.me.alive) {
          w.modal = w.modal?.kind === 'sabotageMenu' ? null : { kind: 'sabotageMenu' };
          bumpUI();
          return;
        }
        if (k === 'e' || k === ' ') {
          e.preventDefault();
          handleUseAction(w);
          bumpUI();
        } else if (k === 'q') {
          handleAbility(w);
          bumpUI();
        } else if (k === 'r') {
          handleReport(w);
          bumpUI();
        } else if (k === 'v') {
          handleToggleVent(w);
          bumpUI();
        }
        if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current[k] = false;
      if (k === 'e' || k === ' ') useHeldRef.current = false;
    };

    const onBlur = () => {
      keysRef.current = {};
      useHeldRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [bumpUI, handleUseAction, handleAbility, handleReport, handleToggleVent]);

  const world = getActiveWorld();
  const activeRoom = netClient.getRoom();
  void worldVersion;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070b14]">
      <canvas ref={canvasRef} className="fixed inset-0 w-full h-full block" />

      {!world && (
        <TitleLobby
          config={lobbyConfig}
          soundOn={soundOn}
          room={activeRoom}
          myPlayerId={netClient.getMyId()}
          netError={netError || netClient.getLastError()}
          netStatus={netClient.getStatus()}
          reconnecting={netClient.isReconnectingSession()}
          onChangeConfig={setLobbyConfig}
          onToggleSound={handleToggleSound}
          onStartOffline={startOfflineGame}
          onQuickplay={handleQuickplay}
          onCreatePrivate={handleCreatePrivate}
          onJoinPrivate={handleJoinPrivate}
          onStartRoom={() => netClient.startMatch()}
          onLeaveRoom={() => {
            setNetError('');
            netClient.leaveRoom();
          }}
          onToggleReady={() => netClient.sendToggleReady()}
          onKickPlayer={(targetId) => netClient.sendKick(targetId)}
          onTransferHost={(targetId) => netClient.sendTransferHost(targetId)}
          onUpdateRoom={(opts) => netClient.sendUpdateRoom(opts)}
          onSendLobbyChat={(text) => netClient.sendLobbyChat(text)}
        />
      )}

      {world && world.phase === 'intro' && <IntroModal world={world} onBegin={beginPlay} />}

      {world && world.phase === 'play' && (
        <GameHUD
          world={world}
          soundOn={soundOn}
          onToggleSound={handleToggleSound}
          onStickMove={(x, y) => {
            stickRef.current = { x, y };
          }}
          onUseDown={() => {
            handleUseAction(world);
            bumpUI();
          }}
          onUseUp={() => {
            useHeldRef.current = false;
          }}
          onAbility={() => {
            handleAbility(world);
            bumpUI();
          }}
          onReport={() => {
            handleReport(world);
            bumpUI();
          }}
          onToggleVent={() => {
            handleToggleVent(world);
            bumpUI();
          }}
          onCycleVent={(dir) => {
            handleCycleVent(world, dir);
            bumpUI();
          }}
          onOpenMap={() => {
            world.modal = { kind: 'map' };
            bumpUI();
          }}
          onOpenSabotage={() => {
            world.modal = { kind: 'sabotageMenu' };
            bumpUI();
          }}
        />
      )}

      {world && world.phase === 'play' && world.modal && (
        <TaskMiniGame
          world={world}
          modal={world.modal}
          onClose={() => {
            world.camsInUse = false;
            world.modal = null;
            bumpUI();
          }}
          onCompleteTask={(idx) => {
            if (world.isOnline) netClient.sendCompleteTask(idx);
            else completeTask(world, world.me, idx);
            bumpUI();
          }}
          onFixSabotage={(spotId) => {
            if (world.isOnline) netClient.sendFixSabotage(spotId);
            else fixSabotagePart(world, spotId);
            bumpUI();
          }}
          onTriggerSabotage={(type: Exclude<SabotageType, null>) => {
            if (world.isOnline) netClient.sendSabotage(type);
            else triggerSabotage(world, type);
            bumpUI();
          }}
        />
      )}

      {world && world.phase === 'meeting' && world.m && world.m.stage !== 'eject' && (
        <MeetingModal
          world={world}
          onSendChat={(text) => {
            if (world.isOnline) netClient.sendChat(text);
            else sendMeetingChat(world, text);
            bumpUI();
          }}
          onSuspect={(targetId) => {
            if (world.isOnline) {
              netClient.sendSuspect(targetId);
            } else {
              const t = world.players.find((p) => p.id === targetId);
              if (t) sendMeetingChat(world, `${t.name}-কে আমার সন্দেহ হচ্ছে!`);
            }
            bumpUI();
          }}
          onCastVote={(targetId) => {
            if (world.isOnline) {
              netClient.sendVote(targetId < 0 ? null : targetId);
            } else {
              castVote(world, world.me.id, targetId);
            }
            bumpUI();
          }}
        />
      )}

      {world && world.phase === 'meeting' && world.m && world.m.stage === 'eject' && (
        <EjectionCutscene world={world} />
      )}

      {world && world.phase === 'end' && (
        <EndGameModal
          world={world}
          isTeamRoom={Boolean(activeRoom && !activeRoom.isPublic)}
          canReturnTeamLobby={Boolean(
            activeRoom && !activeRoom.isPublic && netClient.getMyId() !== null && activeRoom.hostId === netClient.getMyId()
          )}
          onPlayAgain={startOfflineGame}
          onReturnTeamLobby={() => netClient.sendReturnLobby()}
          onBackToMenu={backToMenu}
        />
      )}
    </div>
  );
}
