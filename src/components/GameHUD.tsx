import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  DoorClosed,
  Flame,
  Gauge,
  Hand,
  LightbulbOff,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Radar,
  Radio,
  SearchCheck,
  ShieldAlert,
  Siren,
  TrainFront,
  User,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  CHAIN,
  CH,
  COACH_NAMES,
  COACH_SHORT,
  CW,
  HAZARD_ZONES,
  N_COACHES,
  SABOTAGE_SPOTS,
  STATIONS,
  STEP,
  TW,
  bn,
  coachOf,
  getPlayerStatus,
} from '../game/mapData';
import { isInteractiveMiniTask, nearestOther } from '../game/engine';
import { GameWorld } from '../game/types';

interface GameHUDProps {
  world: GameWorld;
  soundOn: boolean;
  onToggleSound: () => void;
  onStickMove: (x: number, y: number) => void;
  onUseDown: () => void;
  onUseUp: () => void;
  onAbility: () => void;
  onReport: () => void;
  onToggleVent: () => void;
  onCycleVent: (dir: 1 | -1) => void;
  onOpenMap: () => void;
  onOpenSabotage: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  world,
  soundOn,
  onToggleSound,
  onStickMove,
  onUseDown,
  onUseUp,
  onAbility,
  onReport,
  onToggleVent,
  onCycleVent,
  onOpenMap,
  onOpenSabotage,
}) => {
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const stickRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const stickPidRef = useRef<number | null>(null);
  const stickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [tasksOpen, setTasksOpen] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [sabotageOpen, setSabotageOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const me = world.me;
  const commsJam = world.sabotage.active === 'comms';

  useEffect(() => {
    if (!miniMapOpen) return;
    const mc = miniRef.current;
    if (!mc) return;
    const c = mc.getContext('2d');
    if (!c) return;
    const w = mc.width;
    const h = mc.height;
    const k = (w - 16) / TW;
    c.clearRect(0, 0, w, h);

    for (let i = 0; i < N_COACHES; i++) {
      c.fillStyle = i === 5 ? '#6b4a7a' : i === 0 || i === 6 ? '#3b4d6b' : '#4a5a78';
      c.fillRect(8 + i * STEP * k, 10, CW * k, h - 20);
    }

    HAZARD_ZONES.forEach((hz) => {
      c.fillStyle = hz.kind === 'oil' ? 'rgba(245, 183, 61, 0.35)' : 'rgba(56, 189, 248, 0.35)';
      c.fillRect(
        8 + hz.x * k,
        (hz.y / CH) * (h - 20) + 10,
        Math.max(4, hz.w * k),
        Math.max(4, (hz.h / CH) * (h - 20))
      );
    });

    if (!commsJam) {
      c.fillStyle = '#ef4444';
      c.fillRect(8 + CHAIN.x * k - 3, h / 2 - 3, 6, 6);

      me.tasks.forEach((t) => {
        if (!t.done) {
          c.fillStyle = '#f5b73d';
          c.beginPath();
          c.arc(8 + t.spot.x * k, (t.spot.y / CH) * (h - 20) + 10, 4.5, 0, Math.PI * 2);
          c.fill();
        }
      });
    }

    if (world.sabotage.active && world.sabotage.active !== 'doors') {
      SABOTAGE_SPOTS.forEach((sb) => {
        if (sb.type === world.sabotage.active && !world.sabotage.fixedParts[sb.id]) {
          c.fillStyle = Math.sin(world.t * 8) > 0 ? '#ef4444' : '#fca5a5';
          c.beginPath();
          c.arc(8 + sb.x * k, (sb.y / CH) * (h - 20) + 10, 5.5, 0, Math.PI * 2);
          c.fill();
        }
      });
    }

    world.bodies.forEach((b) => {
      c.fillStyle = '#ff3b30';
      c.fillRect(8 + b.x * k - 4, h / 2 - 4, 8, 8);
    });

    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(8 + me.x * k, (me.y / CH) * (h - 20) + 10, 5.5, 0, Math.PI * 2);
    c.fill();
  });

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stickPidRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const r = e.currentTarget.getBoundingClientRect();
    stickCenterRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    updateStickPos(e.clientX, e.clientY);
    e.preventDefault();
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPidRef.current) return;
    updateStickPos(e.clientX, e.clientY);
  };

  const handleStickEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPidRef.current) return;
    stickPidRef.current = null;
    onStickMove(0, 0);
    if (knobRef.current) {
      knobRef.current.style.transform = 'translate(0px, 0px)';
    }
  };

  const updateStickPos = (cx: number, cy: number) => {
    let dx = cx - stickCenterRef.current.x;
    let dy = cy - stickCenterRef.current.y;
    const d = Math.hypot(dx, dy);
    const rect = stickRef.current?.getBoundingClientRect();
    const max = rect ? Math.max(30, rect.width * 0.31) : 40;
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    onStickMove(dx / max, dy / max);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const roleMeta =
    me.role === 'faker'
      ? { Icon: ShieldAlert, label: 'ফেক টিকেটধারক', color: '#ef5350' }
      : me.role === 'inspector'
      ? { Icon: SearchCheck, label: 'টিকেট পরিদর্শক', color: '#4da3ff' }
      : { Icon: User, label: 'সাধারণ যাত্রী', color: '#43c07a' };
  const RoleIcon = roleMeta.Icon;

  const progressPct = Math.round((world.doneTasks / Math.max(1, world.totalTasks)) * 100);

  let useAction: { label: string; Icon: React.ComponentType<{ className?: string }> } | null = null;
  if (me.inVent === null) {
    if (world.nearSabFix) {
      useAction = { label: world.nearSabFix.label, Icon: Wrench };
    } else if (world.nearCctv && me.alive) {
      useAction = { label: 'সিসিটিভি দেখো', Icon: Camera };
    } else if (world.nearRadar && me.alive) {
      useAction = { label: 'কোচ রাডার দেখো', Icon: Radar };
    } else if (world.nearTask) {
      useAction = {
        label: isInteractiveMiniTask(world.nearTask.spot.type)
          ? `${world.nearTask.spot.label} (খোলো)`
          : `${world.nearTask.spot.label} (চেপে ধরো)`,
        Icon: Hand,
      };
    } else if (world.nearChain && me.alive && me.chains > 0) {
      useAction = { label: 'জরুরি চেইন টানো', Icon: Siren };
    }
  }

  const abilityTarget =
    me.role === 'faker'
      ? nearestOther(world, me, 62, (q) => q.role !== 'faker')
      : me.role === 'inspector'
      ? nearestOther(world, me, 68)
      : null;

  const myStatus = getPlayerStatus(me, world);
  const isStunned = me.alive && myStatus.stunnedLeft > 0;
  const abilityCd = me.role === 'faker' ? me.coolSteal : me.coolCheck;
  const abilityDisabled =
    isStunned ||
    abilityCd > 0 ||
    !abilityTarget ||
    (me.role === 'inspector' && me.uses <= 0) ||
    me.inVent !== null;

  const currentCoach = COACH_SHORT[coachOf(me.x)];
  const doorsLockedLeft = Math.max(0, Math.ceil(world.sabotage.doorLockedUntil - world.t));

  type StatusBadgeItem = {
    key: string;
    Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    label: string;
    detail: string;
    accentColor: string;
    borderClass: string;
    bgClass: string;
    pct?: number;
  };

  const statusItems: StatusBadgeItem[] = [];
  if (isStunned) {
    statusItems.push({
      key: 'stun',
      Icon: Zap,
      label: 'স্তব্ধ',
      detail: `${bn(myStatus.stunnedLeft.toFixed(1))}সে · নড়াচড়া বন্ধ`,
      accentColor: '#38bdf8',
      borderClass: 'border-sky-400/55',
      bgClass: 'bg-[#071526]/92',
      pct: Math.min(100, Math.round((myStatus.stunnedLeft / 3) * 100)),
    });
  }
  if (!isStunned && myStatus.slowMultiplier < 0.99) {
    statusItems.push({
      key: 'slow',
      Icon: Gauge,
      label: 'ধীরগতি',
      detail: `${bn(Math.round(myStatus.slowMultiplier * 100))}% · ${myStatus.slowReason || 'পিচ্ছিল পথ'}`,
      accentColor: '#f5b73d',
      borderClass: 'border-[#f5b73d]/55',
      bgClass: 'bg-[#1a1406]/90',
    });
  }
  if (myStatus.hasteLeft > 0) {
    statusItems.push({
      key: 'haste',
      Icon: Wind,
      label: 'দ্রুতগতি',
      detail: `+২২% · ${bn(myStatus.hasteLeft.toFixed(1))}সে`,
      accentColor: '#43c07a',
      borderClass: 'border-[#1f9d63]/60',
      bgClass: 'bg-[#071d14]/90',
      pct: Math.min(100, Math.round((myStatus.hasteLeft / 4.5) * 100)),
    });
  }

  const hasSabotageAlert = Boolean(world.sabotage.active || doorsLockedLeft > 0);
  const sabotageChipLabel =
    world.sabotage.active === 'brakes'
      ? `ব্রেক ${bn(Math.max(0, Math.ceil(world.sabotage.timer)))}সে`
      : world.sabotage.active === 'lights'
      ? 'লাইট বন্ধ'
      : world.sabotage.active === 'comms'
      ? 'যোগাযোগ জ্যাম'
      : doorsLockedLeft > 0
      ? `লক ${bn(doorsLockedLeft)}সে`
      : '';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Unified Top Dhaka Metro Station Telemetry Bar */}
      <header className="w-full px-2.5 sm:px-4 py-1.5 sm:py-2 bg-[#060b16]/88 backdrop-blur-md border-b border-[#f5b73d]/25 flex items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="text-[11px] sm:text-sm font-bold whitespace-nowrap flex items-center gap-1.5 shrink-0 max-w-[125px] sm:max-w-none truncate"
            style={{ color: roleMeta.color }}
          >
            <RoleIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">
              {roleMeta.label}
              {!me.alive ? ' (ভূত)' : ''}
            </span>
          </div>

          <span className="hidden sm:inline text-slate-700" aria-hidden="true">|</span>

          <div className="w-16 min-[420px]:w-24 sm:w-44 md:w-52 shrink-0">
            <div className="flex justify-between text-[10px] sm:text-[11px] text-slate-300 tabular-nums items-center">
              <span className="flex items-center gap-1 truncate">
                {commsJam ? (
                  <>
                    <Radio className="w-3 h-3 text-red-400 shrink-0" />
                    <span className="text-red-300 truncate">বিচ্ছিন্ন</span>
                  </>
                ) : (
                  <span>কাজ {bn(world.doneTasks)}/{bn(world.totalTasks)}</span>
                )}
              </span>
              {!commsJam && <span className="hidden sm:inline text-[#43c07a] font-bold">{bn(progressPct)}%</span>}
            </div>
            <div className="h-1.5 bg-[#152038] rounded-full overflow-hidden mt-0.5 sm:mt-1">
              <div
                className={`h-full transition-all duration-300 ${commsJam ? 'bg-red-500/60' : 'bg-[#1f9d63]'}`}
                style={{ width: commsJam ? '100%' : `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-slate-200 whitespace-nowrap tabular-nums">
          <MapPin className="w-3.5 h-3.5 text-[#f5b73d]" />
          <span>{currentCoach}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <TrainFront className="w-3.5 h-3.5 text-[#1f9d63]" />
          <span>{STATIONS[world.stIdx]}</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className={world.trainSpeed < 0.08 ? 'text-[#f5b73d]' : 'text-slate-300'}>
            {world.trainSpeed < 0.08
              ? 'স্টেশনে থেমেছে'
              : `${bn(Math.round(world.trainSpeed * 84))} কিমি/ঘণ্টা`}
          </span>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {world.isOnline && world.matchTimer !== undefined && (
            <span
              className={`font-mono-num text-[11px] sm:text-sm font-bold tabular-nums flex items-center gap-1 px-1.5 py-1 ${
                world.matchTimer <= 25 ? 'text-red-400' : 'text-[#f5b73d]'
              }`}
              title="ম্যাচের বাকি সময়"
            >
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{bn(Math.max(0, Math.ceil(world.matchTimer)))}সে</span>
            </span>
          )}

          {hasSabotageAlert && (
            <button
              type="button"
              onClick={() => setSabotageOpen((v) => !v)}
              className={`pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold cursor-pointer whitespace-nowrap tabular-nums transition-colors ${
                sabotageOpen
                  ? 'bg-[#ef5350] border-red-300 text-white'
                  : 'bg-[#450a0a]/90 border-red-400/70 text-red-100 animate-pulse'
              }`}
              title="সাবোটাজ বিস্তারিত দেখো"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-[#f5b73d] shrink-0" />
              <span>{sabotageChipLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setTasksOpen((v) => !v)}
            className={`pointer-events-auto flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
              tasksOpen
                ? 'bg-[#f5b73d] border-[#f5b73d] text-[#060b16]'
                : 'bg-[#0e172c] border-slate-700/80 text-slate-100 hover:border-[#f5b73d]/60'
            }`}
            title={me.role === 'faker' ? 'ভান করার কাজ' : 'আমার কাজ'}
          >
            <ClipboardList className={`w-3.5 h-3.5 ${tasksOpen ? 'text-[#060b16]' : 'text-[#f5b73d]'}`} />
            <span className="hidden sm:inline">কাজ</span>
          </button>

          <button
            type="button"
            onClick={() => setMiniMapOpen((v) => !v)}
            className={`pointer-events-auto flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
              miniMapOpen
                ? 'bg-[#f5b73d] border-[#f5b73d] text-[#060b16]'
                : 'bg-[#0e172c] border-slate-700/80 text-slate-100 hover:border-[#f5b73d]/60'
            }`}
            title="মিনিম্যাপ ও অবস্থান দেখো"
          >
            <Radar className={`w-3.5 h-3.5 ${miniMapOpen ? 'text-[#060b16]' : 'text-[#43c07a]'}`} />
            <span className="hidden md:inline">রাডার</span>
          </button>

          <button
            type="button"
            onClick={onOpenMap}
            className="pointer-events-auto flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg bg-[#0e172c] border border-slate-700/80 text-slate-100 text-xs font-semibold hover:border-[#f5b73d]/60 cursor-pointer whitespace-nowrap"
            title="ট্রেনের ম্যাপ (M)"
          >
            <MapIcon className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span className="hidden sm:inline">ম্যাপ</span>
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            className="pointer-events-auto p-1.5 rounded-lg bg-[#0e172c] border border-slate-700/80 text-slate-100 hover:border-[#f5b73d]/60 cursor-pointer"
            aria-label="সাউন্ড"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-[#f5b73d]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
      </header>

      {/* Expandable Left Drawer: Minimap + Tasks (Hidden by default so playable train stays clean) */}
      {(miniMapOpen || tasksOpen) && (
        <div className="absolute top-12 sm:top-13 left-2.5 sm:left-3 flex flex-col gap-2 max-w-[calc(100vw-20px)] sm:max-w-[300px] z-20">
          {miniMapOpen && (
            <div className="pointer-events-auto bg-[#060b16]/90 backdrop-blur-md border border-[#f5b73d]/30 rounded-xl p-2 space-y-1.5 shadow-xl">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#f5b73d]">
                <span className="truncate">
                  {currentCoach} <span className="text-slate-500">·</span>{' '}
                  <span className="text-slate-200">{STATIONS[world.stIdx]}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setMiniMapOpen(false)}
                  className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="রাডার বন্ধ করো"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <canvas
                ref={miniRef}
                width={560}
                height={44}
                onClick={onOpenMap}
                className="w-60 sm:w-72 h-6 rounded-lg bg-[#040812] border border-slate-700/70 cursor-pointer"
              />
            </div>
          )}

          {tasksOpen && (
            <div className="pointer-events-auto bg-[#060b16]/90 backdrop-blur-md border border-slate-700/70 rounded-xl px-3 py-2 text-xs shadow-xl">
              <div className="flex items-center justify-between font-bold text-[#f5b73d] pb-1.5 border-b border-slate-800">
                <span>{me.role === 'faker' ? 'ভান করার কাজ' : 'আমার কাজ'}</span>
                <button
                  type="button"
                  onClick={() => setTasksOpen(false)}
                  className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                  aria-label="কাজের তালিকা বন্ধ করো"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-1.5 space-y-1.5 leading-snug max-h-[45dvh] overflow-y-auto metro-scroll">
                {commsJam ? (
                  <div className="text-red-400">যোগাযোগ জ্যাম! সিকিউরিটিতে ঠিক করো।</div>
                ) : (
                  me.tasks.map((t, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-1.5 ${
                        t.done ? 'text-[#43c07a] line-through opacity-65' : 'text-slate-200'
                      }`}
                    >
                      {t.done ? (
                        <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#43c07a]" />
                      ) : (
                        <Circle className="w-2.5 h-2.5 shrink-0 mt-1 text-[#f5b73d]" />
                      )}
                      <span>
                        {t.spot.label}{' '}
                        {t.spot.hard && !t.done && (
                          <span className="text-[10px] font-bold text-[#f5b73d]">[কঠিন] </span>
                        )}
                        — <span className="text-slate-400">{COACH_NAMES[t.spot.coach].split(' ')[0]}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable Sabotage Detail Card (Only visible when user clicks the top-bar emergency chip) */}
      {hasSabotageAlert && sabotageOpen && (
        <div className="pointer-events-auto absolute top-12 sm:top-13 right-2.5 sm:right-3 max-w-xs bg-[#2c090e]/95 backdrop-blur-md border border-red-400/70 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white shadow-xl space-y-1.5 z-20">
          <div className="flex items-center justify-between gap-3 text-[11px] text-[#f5b73d] border-b border-red-400/25 pb-1">
            <span>জরুরি সতর্কতা</span>
            <button
              type="button"
              onClick={() => setSabotageOpen(false)}
              className="text-slate-300 hover:text-white cursor-pointer"
              aria-label="সতর্কতা লুকাও"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {world.sabotage.active === 'brakes' && (
            <div className="flex items-center gap-1.5 tabular-nums">
              <AlertTriangle className="w-4 h-4 text-[#f5b73d] shrink-0" />
              <span>জরুরি ব্রেক ফেইল! বাকি {bn(Math.max(0, Math.ceil(world.sabotage.timer)))} সেকেন্ড</span>
            </div>
          )}
          {world.sabotage.active === 'lights' && (
            <div className="flex items-center gap-1.5">
              <LightbulbOff className="w-4 h-4 text-[#f5b73d] shrink-0" />
              <span>লাইট বন্ধ! ইলেকট্রিক্যালে গিয়ে ব্রেকার ঠিক করো</span>
            </div>
          )}
          {world.sabotage.active === 'comms' && (
            <div className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[#f5b73d] shrink-0" />
              <span>যোগাযোগ বিচ্ছিন্ন! সিকিউরিটিতে রাউটার ঠিক করো</span>
            </div>
          )}
          {doorsLockedLeft > 0 && (
            <div className="flex items-center gap-1.5 tabular-nums">
              <DoorClosed className="w-4 h-4 text-[#f5b73d] shrink-0" />
              <span>কোচের দরজা লক: {bn(doorsLockedLeft)} সে.</span>
            </div>
          )}
        </div>
      )}

      {/* Active Player Status Effects Strip (Dhaka Metro Telemetry) */}
      {statusItems.length > 0 && (
        <div
          aria-live="polite"
          className="absolute left-3 bottom-44 md:bottom-auto md:top-14 md:left-1/2 md:-translate-x-1/2 flex flex-col md:flex-row flex-wrap items-start md:items-center justify-center gap-1.5 max-w-[85vw] md:max-w-[52vw]"
        >
          {statusItems.map((st) => {
            const StIcon = st.Icon;
            return (
              <div
                key={st.key}
                className={`${st.bgClass} ${st.borderClass} backdrop-blur-md border rounded-lg px-2.5 py-1.5 shadow-lg min-w-[138px]`}
              >
                <div className="flex items-center gap-1.5 text-xs whitespace-nowrap tabular-nums">
                  <StIcon className="w-3.5 h-3.5 shrink-0" style={{ color: st.accentColor }} />
                  <span className="font-bold" style={{ color: st.accentColor }}>
                    {st.label}
                  </span>
                  <span className="text-slate-500" aria-hidden="true">·</span>
                  <span className="text-[11px] font-medium text-slate-200">{st.detail}</span>
                </div>
                {st.pct !== undefined && (
                  <div className="h-1 bg-slate-900/90 rounded-sm overflow-hidden mt-1">
                    <div
                      className="h-full transition-all duration-100"
                      style={{ width: `${st.pct}%`, backgroundColor: st.accentColor }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Center Station Announcement Toast */}
      {world.t < world.toastUntil && world.toastText && (
        <div className="absolute left-1/2 top-[22%] -translate-x-1/2 max-w-[88vw] text-center bg-[#060b16]/94 backdrop-blur-md border border-[#f5b73d]/70 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-2xl">
          {world.toastText}
        </div>
      )}

      {/* Touch Joystick */}
      {isTouchDevice && (
        <div
          ref={stickRef}
          onPointerDown={handleStickDown}
          onPointerMove={handleStickMove}
          onPointerUp={handleStickEnd}
          onPointerCancel={handleStickEnd}
          className="pointer-events-auto absolute left-2.5 sm:left-3 bottom-3 sm:bottom-4 w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-white/8 border-2 border-white/20 touch-none"
        >
          <div
            ref={knobRef}
            className="absolute left-1/2 top-1/2 w-11 h-11 sm:w-14 sm:h-14 -ml-5.5 -mt-5.5 sm:-ml-7 sm:-mt-7 rounded-full bg-white/30"
          />
        </div>
      )}

      {/* Bottom-Right Action Buttons */}
      <div className="absolute right-2.5 sm:right-3 bottom-3 sm:bottom-4 flex flex-col items-end gap-2">
        {me.inVent !== null ? (
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCycleVent(-1)}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-[#1e293b] border border-slate-500 text-white font-bold shadow-lg cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>আগের ভেন্ট</span>
            </button>
            <button
              type="button"
              onClick={onToggleVent}
              className="min-h-[48px] px-5 py-3 rounded-2xl bg-[#ef5350] text-white font-bold shadow-lg cursor-pointer"
            >
              ভেন্ট থেকে বের হও (V)
            </button>
            <button
              type="button"
              onClick={() => onCycleVent(1)}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-[#1e293b] border border-slate-500 text-white font-bold shadow-lg cursor-pointer flex items-center gap-1"
            >
              <span>পরের ভেন্ট</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              {me.role === 'faker' && me.alive && (
                <button
                  type="button"
                  onClick={onOpenSabotage}
                  disabled={!!world.sabotage.active || world.sabotage.cooldown > 0}
                  className="pointer-events-auto min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#7f1d1d] border border-red-400/50 text-white text-sm font-bold shadow-lg disabled:opacity-45 cursor-pointer tabular-nums flex items-center gap-1.5"
                >
                  <Flame className="w-4 h-4" />
                  <span>
                    সাবোটাজ{world.sabotage.cooldown > 0 ? ` · ${bn(Math.ceil(world.sabotage.cooldown))}` : ' (F)'}
                  </span>
                </button>
              )}

              {me.role === 'faker' && me.alive && world.nearVent && (
                <button
                  type="button"
                  onClick={onToggleVent}
                  disabled={isStunned}
                  className="pointer-events-auto min-h-[46px] px-4 py-2.5 rounded-2xl bg-[#334155] border border-slate-400/60 text-white text-sm font-bold shadow-lg disabled:opacity-45 cursor-pointer flex items-center gap-1.5"
                >
                  <Wind className="w-4 h-4" />
                  <span>{isStunned ? 'স্তব্ধ' : 'ভেন্ট (V)'}</span>
                </button>
              )}

              {me.alive && (me.role === 'faker' || me.role === 'inspector') && (
                <button
                  type="button"
                  onClick={onAbility}
                  disabled={abilityDisabled}
                  className={`pointer-events-auto min-h-[48px] px-4 py-2.5 rounded-2xl text-sm font-bold shadow-lg disabled:opacity-40 cursor-pointer tabular-nums flex items-center gap-1.5 ${
                    me.role === 'faker' ? 'bg-[#ef5350] text-white' : 'bg-[#3b82f6] text-white'
                  }`}
                >
                  {me.role === 'faker' ? (
                    <>
                      <Briefcase className="w-4 h-4" />
                      <span>{isStunned ? 'স্তব্ধ' : 'চুরি (Q)'}</span>
                    </>
                  ) : (
                    <>
                      <SearchCheck className="w-4 h-4" />
                      <span>{isStunned ? 'স্তব্ধ' : `চেক (${bn(me.uses)})`}</span>
                    </>
                  )}
                  {!isStunned && abilityCd > 0 ? ` · ${bn(Math.ceil(abilityCd))}` : ''}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {world.nearBody && me.alive && (
                <button
                  type="button"
                  onClick={onReport}
                  disabled={isStunned}
                  className="pointer-events-auto min-h-[54px] px-5 py-3 rounded-2xl bg-[#ef5350] text-white text-base font-bold shadow-xl animate-pulse disabled:opacity-45 disabled:animate-none cursor-pointer flex items-center gap-2"
                >
                  <Megaphone className="w-5 h-5" />
                  <span>{isStunned ? 'স্তব্ধ' : 'ব্যাগ রিপোর্ট (R)'}</span>
                </button>
              )}

              {useAction && (
                <button
                  type="button"
                  disabled={isStunned}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (!isStunned) onUseDown();
                  }}
                  onPointerUp={onUseUp}
                  onPointerLeave={onUseUp}
                  onPointerCancel={onUseUp}
                  className="pointer-events-auto min-h-[48px] sm:min-h-[58px] min-w-[116px] sm:min-w-[140px] max-w-[54vw] px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-[#f5b73d] text-[#0c111d] text-xs sm:text-base font-bold shadow-xl active:scale-95 transition-transform disabled:opacity-45 cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2"
                >
                  <useAction.Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <span className="truncate">{isStunned ? `স্তব্ধ (${bn(myStatus.stunnedLeft.toFixed(1))}সে)` : useAction.label}</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
