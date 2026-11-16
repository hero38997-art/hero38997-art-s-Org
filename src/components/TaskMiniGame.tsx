import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Briefcase,
  Camera,
  Check,
  Coffee,
  CreditCard,
  CupSoda,
  DoorClosed,
  Droplets,
  Flame,
  Hand,
  LightbulbOff,
  Lock,
  Map as MapIcon,
  Radar,
  Radio,
  RotateCcw,
  Scale,
  ScanLine,
  Timer,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import {
  CAMERAS,
  COACH_NAMES,
  COACH_SHORT,
  N_COACHES,
  SABOTAGE_SPOTS,
  TW,
  bn,
  coachOf,
  shuffle,
} from '../game/mapData';
import { netClient } from '../game/netClient';
import { renderCameraFeed } from '../game/renderer';
import { ActiveModal, GameWorld, SabotageType } from '../game/types';

interface TaskMiniGameProps {
  world: GameWorld;
  modal: NonNullable<ActiveModal>;
  onClose: () => void;
  onCompleteTask: (taskIndex: number) => void;
  onFixSabotage: (spotId: string) => void;
  onTriggerSabotage: (type: Exclude<SabotageType, null>) => void;
}

export const TaskMiniGame: React.FC<TaskMiniGameProps> = ({
  world,
  modal,
  onClose,
  onCompleteTask,
  onFixSabotage,
  onTriggerSabotage,
}) => {
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>({ text: '', ok: true });

  const finishWithSuccess = (cb: () => void) => {
    setMsg({ text: 'কাজ সফল হয়েছে!', ok: true });
    cb();
    setTimeout(() => {
      onClose();
    }, 420);
  };

  let title = '';
  let TitleIcon: React.ComponentType<{ className?: string }> = Wrench;
  if (modal.kind === 'task') {
    title = modal.task.spot.label;
    TitleIcon = Wrench;
  } else if (modal.kind === 'sabotageFix') {
    title = modal.spot.label;
    TitleIcon = AlertTriangle;
  } else if (modal.kind === 'cctv') {
    title = 'মেট্রো সিকিউরিটি ক্যামেরা';
    TitleIcon = Camera;
  } else if (modal.kind === 'radar') {
    title = 'লাইভ কোচ রাডার (Admin)';
    TitleIcon = Radar;
  } else if (modal.kind === 'map') {
    title = 'মেট্রো ট্রেন ব্লুপ্রিন্ট';
    TitleIcon = MapIcon;
  } else if (modal.kind === 'sabotageMenu') {
    title = 'সাবোটাজ কন্ট্রোল';
    TitleIcon = Flame;
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-3 bg-[#040812]/82 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#080f20]/96 border border-[#f5b73d]/30 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.75)] max-h-[calc(100dvh-16px)] overflow-hidden flex flex-col">
        <div className="h-1 bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />
        <div className="p-3.5 sm:p-5 overflow-y-auto metro-scroll flex-1 min-h-0">
          <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-slate-800">
            <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
              <TitleIcon className="w-5 h-5 text-[#f5b73d]" />
              <span>{title}</span>
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-[#101c36] border border-slate-700/70 text-slate-300 hover:text-white cursor-pointer transition-colors"
              aria-label="বন্ধ করো"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        {modal.kind === 'task' && (
          <TaskBody
            world={world}
            type={modal.task.spot.type}
            onError={(t) => {
              soundEngine.sfx('err');
              setMsg({ text: t, ok: false });
            }}
            onDone={() => {
              const idx = world.me.tasks.indexOf(modal.task);
              finishWithSuccess(() => {
                if (idx >= 0) onCompleteTask(idx);
              });
            }}
          />
        )}

        {modal.kind === 'sabotageFix' && (
          <SabotageFixBody
            type={modal.spot.type}
            onDone={() => finishWithSuccess(() => onFixSabotage(modal.spot.id))}
          />
        )}

        {modal.kind === 'cctv' && <CctvMonitor world={world} />}
        {modal.kind === 'radar' && <AdminRadar world={world} />}
        {modal.kind === 'map' && (
          <BlueprintMap world={world} onTriggerSabotage={onTriggerSabotage} />
        )}
        {modal.kind === 'sabotageMenu' && (
          <SabotageMenu world={world} onTrigger={onTriggerSabotage} />
        )}

        {msg.text && (
          <div
            className={`mt-3 flex items-center justify-center gap-1.5 text-sm font-bold ${
              msg.ok ? 'text-[#43c07a]' : 'text-[#ef5350]'
            }`}
          >
            {msg.ok && <Check className="w-4 h-4" />}
            <span>{msg.text}</span>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

/* ================= Task Mini-Games ================= */

const TaskBody: React.FC<{
  world: GameWorld;
  type: string;
  onError: (t: string) => void;
  onDone: () => void;
}> = ({ world, type, onError, onDone }) => {
  switch (type) {
    case 'swipe':
      return <SwipeGame onError={onError} onDone={onDone} />;
    case 'wires':
      return <WiresGame onError={onError} onDone={onDone} />;
    case 'code':
      return <CodeGame onError={onError} onDone={onDone} />;
    case 'lights':
      return <LightsPuzzle onDone={onDone} />;
    case 'clean':
      return <CleanGame onDone={onDone} />;
    case 'luggage':
      return <LuggageGame onError={onError} onDone={onDone} />;
    case 'throttle':
      return <ThrottleGame onError={onError} onDone={onDone} />;
    case 'canteen':
      return <CanteenGame onError={onError} onDone={onDone} />;
    case 'signal':
      return <SignalGame onError={onError} onDone={onDone} />;
    case 'wipe':
      return <WipeWindowGame onDone={onDone} />;
    case 'scan':
      return <BioScanGame world={world} onDone={onDone} />;
    default:
      return <LightsPuzzle onDone={onDone} />;
  }
};

const SwipeGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [px, setPx] = useState(6);
  const dragRef = useRef({ active: false, x0: 0, t0: 0, cur: 6 });

  const maxX = () => (trackRef.current ? trackRef.current.clientWidth - 110 : 220);

  return (
    <div>
      <p className="text-xs text-slate-400 text-center mb-3">
        এমআরটি পাস কার্ডটি বাঁ থেকে ডানে ঠিক মাঝারি গতিতে টানো (খুব দ্রুত বা খুব ধীরে নয়)।
      </p>
      <div
        ref={trackRef}
        className="relative h-24 rounded-xl bg-[#090e1b] border border-[#2c3a57] overflow-hidden touch-none"
      >
        <div className="absolute inset-x-0 top-10 h-3 bg-[#1e293b]" />
        <div
          onPointerDown={(e) => {
            dragRef.current = { active: true, x0: e.clientX - px, t0: performance.now(), cur: px };
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
          }}
          onPointerMove={(e) => {
            if (!dragRef.current.active) return;
            const nx = Math.max(6, Math.min(maxX(), e.clientX - dragRef.current.x0));
            dragRef.current.cur = nx;
            setPx(nx);
            if (nx >= maxX() - 2) {
              dragRef.current.active = false;
              const dt = performance.now() - dragRef.current.t0;
              if (dt < 450) {
                onError('বেশি দ্রুত হয়ে গেছে! আবার চেষ্টা করো');
                setPx(6);
              } else if (dt > 1450) {
                onError('বেশি ধীরে হয়েছে! আবার চেষ্টা করো');
                setPx(6);
              } else {
                soundEngine.sfx('swipe');
                onDone();
              }
            }
          }}
          onPointerUp={() => {
            if (dragRef.current.active) {
              dragRef.current.active = false;
              onError('শেষ পর্যন্ত টেনে নাও');
              setPx(6);
            }
          }}
          style={{ left: `${px}px` }}
          className="absolute top-4 w-24 h-14 rounded-lg bg-gradient-to-br from-[#1f9d63] to-[#34d399] flex flex-col items-center justify-center text-white font-bold text-xs shadow-lg cursor-grab active:cursor-grabbing gap-0.5"
        >
          <div className="flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>MRT PASS</span>
          </div>
          <span className="text-[10px] opacity-85">ঢাকা মেট্রো</span>
        </div>
      </div>
    </div>
  );
};

/* HARD TASK 1: 5-Wire Braided Bézier Drag-and-Drop (with tap fallback) */
const WiresGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const cols = ['#ef4444', '#3b82f6', '#f5b73d', '#22c55e', '#a855f7'];
  const perm = useMemo(() => shuffle([0, 1, 2, 3, 4]), []);
  const [done, setDone] = useState([false, false, false, false, false]);
  const [sel, setSel] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{ from: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const leftY = (i: number) => 24 + i * 44;
  const rightY = (j: number) => 24 + j * 44;

  const toSvgCoords = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 36, y: 24 };
    const r = svg.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * 320,
      y: ((clientY - r.top) / r.height) * 230,
    };
  };

  const tryConnect = (fromIdx: number, rightSlotIdx: number) => {
    if (perm[rightSlotIdx] === fromIdx) {
      const next = done.slice();
      next[fromIdx] = true;
      setDone(next);
      setSel(null);
      soundEngine.sfx('wire');
      if (next.every(Boolean)) onDone();
    } else {
      setSel(null);
      onError('রঙ মেলেনি! সঠিক টার্মিনালে জোড়া দাও');
    }
  };

  const bezier = (x1: number, y1: number, x2: number, y2: number) => {
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div>
      <p className="text-xs text-slate-400 text-center mb-2">
        বাঁ দিকের ৫টি তার টেনে এনে ডান দিকের একই রঙের টার্মিনালে জোড়া দাও (অথবা ট্যাপ করো)।
      </p>
      <div className="bg-[#090e1b] border border-[#2c3a57] rounded-xl p-2">
        <svg
          ref={svgRef}
          viewBox="0 0 320 230"
          className="w-full max-w-sm mx-auto block touch-none select-none"
          onPointerMove={(e) => {
            if (!dragState) return;
            const pt = toSvgCoords(e.clientX, e.clientY);
            setDragState({ from: dragState.from, x: pt.x, y: pt.y });
          }}
          onPointerUp={(e) => {
            if (!dragState) return;
            const pt = toSvgCoords(e.clientX, e.clientY);
            if (pt.x > 245) {
              for (let j = 0; j < 5; j++) {
                if (Math.hypot(pt.x - 284, pt.y - rightY(j)) < 26) {
                  tryConnect(dragState.from, j);
                  break;
                }
              }
            }
            setDragState(null);
          }}
          onPointerCancel={() => setDragState(null)}
        >
          {/* Terminal housing strips */}
          <rect x={8} y={6} width={44} height={218} rx={8} fill="#151f36" stroke="#283554" strokeWidth={1.5} />
          <rect x={268} y={6} width={44} height={218} rx={8} fill="#151f36" stroke="#283554" strokeWidth={1.5} />

          {/* Completed curved cables */}
          {[0, 1, 2, 3, 4].map((i) => {
            if (!done[i]) return null;
            const j = perm.indexOf(i);
            return (
              <path
                key={`p-${i}`}
                d={bezier(42, leftY(i), 278, rightY(j))}
                fill="none"
                stroke={cols[i]}
                strokeWidth={7.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Live dragged cable */}
          {dragState && (
            <path
              d={bezier(42, leftY(dragState.from), dragState.x, dragState.y)}
              fill="none"
              stroke={cols[dragState.from]}
              strokeWidth={7.5}
              strokeLinecap="round"
              opacity={0.9}
            />
          )}

          {/* Left terminals */}
          {[0, 1, 2, 3, 4].map((i) => (
            <g
              key={`lc-${i}`}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => {
                if (done[i]) return;
                setSel(i);
                try {
                  svgRef.current?.setPointerCapture(e.pointerId);
                } catch {
                  // ignore
                }
                const pt = toSvgCoords(e.clientX, e.clientY);
                setDragState({ from: i, x: pt.x, y: pt.y });
              }}
            >
              <rect x={16} y={leftY(i) - 8} width={22} height={16} rx={3} fill={cols[i]} />
              <circle
                cx={42}
                cy={leftY(i)}
                r={12}
                fill={cols[i]}
                stroke={sel === i ? '#fff' : '#0f172a'}
                strokeWidth={3}
              />
            </g>
          ))}

          {/* Right terminals */}
          {[0, 1, 2, 3, 4].map((j) => (
            <g
              key={`rc-${j}`}
              className="cursor-pointer"
              onClick={() => {
                if (sel !== null) tryConnect(sel, j);
              }}
            >
              <rect x={282} y={rightY(j) - 8} width={22} height={16} rx={3} fill={cols[perm[j]]} />
              <circle
                cx={278}
                cy={rightY(j)}
                r={12}
                fill={cols[perm[j]]}
                stroke="#0f172a"
                strokeWidth={3}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

/* HARD TASK 2: 6-Digit Rotating Security Pinpad + 10s Countdown + Shuffled Keys */
const CodeGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const genPin = () => {
    let s = '';
    for (let i = 0; i < 6; i++) s += String((Math.random() * 10) | 0);
    return s;
  };

  const [code, setCode] = useState(genPin);
  const [digits, setDigits] = useState(() => shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']));
  const [cur, setCur] = useState('');
  const [timeLeft, setTimeLeft] = useState(10);
  const doneRef = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const id = window.setInterval(() => {
      if (doneRef.current) return;
      setTimeLeft((prev) => {
        if (prev <= 0.2) {
          setCode(genPin());
          setDigits(shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']));
          setCur('');
          onErrorRef.current('সময় শেষ! নতুন নিরাপত্তা কোড এসেছে');
          return 10;
        }
        return Number((prev - 0.2).toFixed(1));
      });
    }, 200);
    return () => clearInterval(id);
  }, []);

  const pressKey = (k: string) => {
    if (doneRef.current) return;
    if (k === 'DEL') setCur((c) => c.slice(0, -1));
    else if (k === 'C') setCur('');
    else if (cur.length < 6) {
      const next = cur + k;
      setCur(next);
      soundEngine.sfx('click');
      if (next.length === 6) {
        if (next === code) {
          doneRef.current = true;
          onDone();
        } else {
          onError('ভুল ৬-অঙ্কের কোড! আবার দাও');
          setTimeout(() => setCur(''), 240);
        }
      }
    }
  };

  const keyLayout = [...digits.slice(0, 9), 'DEL', digits[9], 'C'];

  return (
    <div className="text-center">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
        <span>এলোমেলো কীপ্যাডে ৬-অঙ্কের কোড দাও</span>
        <span className="inline-flex items-center gap-1 font-mono-num font-bold text-amber-300 tabular-nums">
          <Timer className="w-3.5 h-3.5" />
          <span>{bn(Math.ceil(timeLeft))} সে.</span>
        </span>
      </div>
      <div className="h-1.5 bg-[#1c253b] rounded-full overflow-hidden mb-2">
        <div
          className={`h-full transition-all duration-200 ${timeLeft <= 3 ? 'bg-red-500' : 'bg-[#f5b73d]'}`}
          style={{ width: `${(timeLeft / 10) * 100}%` }}
        />
      </div>
      <div className="text-3xl font-mono-num tracking-[0.22em] text-[#f5b73d] font-bold my-2">
        {bn(code)}
      </div>
      <div className="min-h-[44px] text-2xl font-mono-num tracking-[0.22em] bg-[#090e1b] border border-[#2c3a57] rounded-xl py-2 mb-3">
        {bn(cur)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keyLayout.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pressKey(k)}
            className="py-2.5 rounded-xl bg-[#1c2844] hover:bg-[#27375d] text-white font-bold text-lg cursor-pointer"
          >
            {k === 'DEL' ? 'মুছো' : bn(k)}
          </button>
        ))}
      </div>
    </div>
  );
};

/* HARD TASK 3: 6-Switch Coupled Lights Puzzle (simpleMode uses 5 direct switches for sabotage) */
const LightsPuzzle: React.FC<{ onDone: () => void; simpleMode?: boolean }> = ({
  onDone,
  simpleMode,
}) => {
  const count = simpleMode ? 5 : 6;
  const makeInitial = () => {
    if (simpleMode) return Array(count).fill(false) as boolean[];
    const arr = Array(count).fill(true) as boolean[];
    const flip = (idx: number) => {
      [idx - 1, idx, idx + 1].forEach((j) => {
        if (j >= 0 && j < count) arr[j] = !arr[j];
      });
    };
    do {
      for (let i = 0; i < count; i++) arr[i] = true;
      for (let i = 0; i < 4; i++) flip((Math.random() * count) | 0);
    } while (arr.every(Boolean));
    return arr;
  };

  const [initial] = useState<boolean[]>(makeInitial);
  const [on, setOn] = useState<boolean[]>(initial);

  const toggle = (k: number) => {
    const next = on.slice();
    if (simpleMode) {
      next[k] = !next[k];
    } else {
      [k - 1, k, k + 1].forEach((j) => {
        if (j >= 0 && j < count) next[j] = !next[j];
      });
    }
    setOn(next);
    soundEngine.sfx('check');
    if (next.every(Boolean)) onDone();
  };

  return (
    <div>
      <div className="flex justify-around gap-1.5 my-4">
        {on.map((v, i) => (
          <div key={i} className="text-center">
            <div
              className={`w-8 h-8 rounded-full mx-auto mb-3 transition-colors ${
                v ? 'bg-[#4ade80] shadow-[0_0_16px_#4ade80]' : 'bg-[#2a334d]'
              }`}
            />
            <button
              type="button"
              onClick={() => toggle(i)}
              className="w-11 py-3 rounded-xl bg-[#1c2844] hover:bg-[#28385e] text-white font-bold cursor-pointer flex items-center justify-center"
              aria-label={`সুইচ ${i + 1}`}
            >
              {v ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          {simpleMode
            ? 'সবগুলো মেইন ব্রেকার সুইচ চালু (সবুজ) করো।'
            : 'সব ৬টি বাতি জ্বালাও। একটা সুইচ পাশের দুটিকেও বদলে দেয়।'}
        </span>
        {!simpleMode && (
          <button
            type="button"
            onClick={() => setOn(initial)}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1c2844] text-slate-200 hover:bg-[#27375d] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>রিসেট</span>
          </button>
        )}
      </div>
    </div>
  );
};

const CleanGame: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [hits, setHits] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const coords = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
        left: 7 + (i % 4) * 23 + Math.random() * 4,
        top: 12 + ((i / 4) | 0) * 45 + Math.random() * 8,
      })),
    []
  );

  return (
    <div>
      <div
        className="relative h-44 rounded-xl overflow-hidden select-none"
        style={{
          background: 'repeating-linear-gradient(90deg, #257a4c 0 56px, #1e653f 56px 60px)',
        }}
      >
        {hits.map((h, i) => {
          if (h >= 3) return null;
          return (
            <button
              key={i}
              type="button"
              onPointerDown={() => {
                const next = hits.slice();
                next[i]++;
                setHits(next);
                soundEngine.sfx('click');
                if (next.every((x) => x >= 3)) onDone();
              }}
              style={{
                left: `${coords[i].left}%`,
                top: `${coords[i].top}%`,
                opacity: 1 - h * 0.3,
              }}
              className="absolute w-12 h-10 rounded-full bg-[#5a3a1c] border-2 border-[#3f2812] cursor-pointer"
              aria-label="দাগ"
            />
          );
        })}
      </div>
      <p className="text-xs text-slate-400 text-center mt-2">
        প্রতিটা দাগ ৩ বার ট্যাপ করে সিট পরিষ্কার করো।
      </p>
    </div>
  );
};

/* HARD TASK 4: Cargo Weight Balance — Split 5 bags into Left (25 kg) & Right (25 kg) */
const LuggageGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const bags = useMemo(
    () => [
      { id: 0, weight: 12, name: '১২ কেজি', color: '#ef4444' },
      { id: 1, weight: 8, name: '৮ কেজি', color: '#3b82f6' },
      { id: 2, weight: 15, name: '১৫ কেজি', color: '#f5b73d' },
      { id: 3, weight: 5, name: '৫ কেজি', color: '#22c55e' },
      { id: 4, weight: 10, name: '১০ কেজি', color: '#a855f7' },
    ],
    []
  );
  // 0 = staging floor, 1 = left rack, 2 = right rack
  const [loc, setLoc] = useState<number[]>([0, 0, 0, 0, 0]);
  const [sel, setSel] = useState<number | null>(null);

  const leftW = bags.reduce((s, b) => s + (loc[b.id] === 1 ? b.weight : 0), 0);
  const rightW = bags.reduce((s, b) => s + (loc[b.id] === 2 ? b.weight : 0), 0);
  const allPlaced = loc.every((l) => l !== 0);
  const balanced = allPlaced && leftW === 25 && rightW === 25;

  const moveBagTo = (target: 1 | 2) => {
    if (sel === null) return;
    const next = loc.slice();
    next[sel] = target;
    setLoc(next);
    setSel(null);
    soundEngine.sfx('check');

    const lw = bags.reduce((s, b) => s + (next[b.id] === 1 ? b.weight : 0), 0);
    const rw = bags.reduce((s, b) => s + (next[b.id] === 2 ? b.weight : 0), 0);
    if (next.every((l) => l !== 0)) {
      if (lw === 25 && rw === 25) {
        onDone();
      } else {
        onError('দুই পাশের ওজন সমান (২৫ কেজি) হয়নি! ব্যাগ বদল করো');
      }
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 text-center">
        ব্যাগ সিলেক্ট করে বাম ও ডান র‍্যাকে এমনভাবে সাজাও যেন উভয় র‍্যাকে ঠিক <b className="text-[#43c07a]">২৫ কেজি</b> হয়।
      </p>

      {/* Weight Beam Status */}
      <div className="flex items-center justify-center gap-2 text-xs font-mono-num">
        <span className={leftW === 25 ? 'text-[#43c07a] font-bold' : 'text-slate-300'}>
          বাম: {bn(leftW)} কেজি
        </span>
        <Scale className={`w-4 h-4 ${balanced ? 'text-[#43c07a]' : 'text-[#f5b73d]'}`} />
        <span className={rightW === 25 ? 'text-[#43c07a] font-bold' : 'text-slate-300'}>
          ডান: {bn(rightW)} কেজি
        </span>
      </div>

      {/* Left & Right Racks */}
      <div className="grid grid-cols-2 gap-2.5">
        {([1, 2] as const).map((side) => {
          const w = side === 1 ? leftW : rightW;
          const items = bags.filter((b) => loc[b.id] === side);
          return (
            <div
              key={side}
              onClick={() => moveBagTo(side)}
              className={`min-h-[96px] rounded-xl border-2 p-2.5 flex flex-col justify-between cursor-pointer transition-colors ${
                sel !== null
                  ? 'border-[#f5b73d] bg-[#162038]'
                  : w === 25
                  ? 'border-[#43c07a] bg-[#132924]'
                  : 'border-[#2c3a57] bg-[#090e1b]'
              }`}
            >
              <div className="flex justify-between items-center text-xs font-bold text-slate-200 mb-2">
                <span>{side === 1 ? 'বাম বগি র‍্যাক' : 'ডান বগি র‍্যাক'}</span>
                <span className="font-mono-num text-[#f5b73d]">{bn(w)}/২৫</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSel(b.id);
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold text-white flex items-center gap-1 border cursor-pointer ${
                      sel === b.id ? 'border-white scale-105' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: b.color }}
                  >
                    <Briefcase className="w-3 h-3" />
                    <span>{b.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unplaced staging floor */}
      <div className="flex justify-center gap-2 flex-wrap min-h-[38px]">
        {bags
          .filter((b) => loc[b.id] === 0)
          .map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSel(b.id)}
              className={`px-3 py-2 rounded-xl font-bold text-xs text-white cursor-pointer border-2 flex items-center gap-1.5 ${
                sel === b.id ? 'border-white scale-105' : 'border-transparent'
              }`}
              style={{ backgroundColor: b.color }}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>{b.name}</span>
            </button>
          ))}
      </div>
    </div>
  );
};

/* HARD TASK 5: 3-Ring Rotating Brake Calibrator (Among Us Calibrate Distributor) */
const ThrottleGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const [stage, setStage] = useState(0); // 0, 1, 2
  const [angles, setAngles] = useState([0, 120, 240]);
  const targets = useMemo(() => [45, 195, 310], []);
  const speeds = useMemo(() => [145, 200, 255], []);
  const lockedRef = useRef([false, false, false]);
  const doneRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setAngles((prev) =>
        prev.map((a, idx) => (lockedRef.current[idx] ? targets[idx] : (a + speeds[idx] * dt) % 360))
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speeds, targets]);

  const tryLock = () => {
    if (doneRef.current) return;
    const diffRaw = Math.abs(angles[stage] - targets[stage]);
    const diff = Math.min(diffRaw, 360 - diffRaw);
    if (diff <= 20) {
      lockedRef.current[stage] = true;
      soundEngine.sfx('check');
      if (stage >= 2) {
        doneRef.current = true;
        onDone();
      } else {
        setStage((s) => s + 1);
      }
    } else {
      lockedRef.current = [false, false, false];
      setStage(0);
      onError('সঠিক দাগে মেলেনি! আবার প্রথম রিং থেকে লক করো');
    }
  };

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs text-slate-400">
        ঘূর্ণায়মান কাঁটা সবুজ জোনে আসামাত্র নিচের <b className="text-[#43c07a]">লক করো</b> বাটনে চাপ দাও ({bn(stage + 1)}/৩)।
      </p>
      <div className="flex justify-center gap-3">
        {[0, 1, 2].map((idx) => {
          const isLocked = idx < stage;
          const isCur = idx === stage;
          const ang = isLocked ? targets[idx] : angles[idx];
          const tRad = ((targets[idx] - 90) * Math.PI) / 180;
          const nRad = ((ang - 90) * Math.PI) / 180;
          return (
            <div
              key={idx}
              className={`p-2 rounded-xl border ${
                isLocked
                  ? 'border-[#43c07a] bg-[#132924]'
                  : isCur
                  ? 'border-[#f5b73d] bg-[#10182b]'
                  : 'border-[#253352] bg-[#090e1b] opacity-60'
              }`}
            >
              <svg width={88} height={88} viewBox="0 0 88 88">
                <circle cx={44} cy={44} r={34} fill="none" stroke="#1e293b" strokeWidth={8} />
                {/* Emerald target marker */}
                <circle
                  cx={44 + Math.cos(tRad) * 34}
                  cy={44 + Math.sin(tRad) * 34}
                  r={7}
                  fill="#22c55e"
                />
                {/* Spinning needle */}
                <line
                  x1={44}
                  y1={44}
                  x2={44 + Math.cos(nRad) * 32}
                  y2={44 + Math.sin(nRad) * 32}
                  stroke={isLocked ? '#4ade80' : '#f5b73d'}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
                <circle cx={44} cy={44} r={5} fill="#cbd5e1" />
              </svg>
              <div className="text-[11px] font-bold text-slate-300">রিং {bn(idx + 1)}</div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={tryLock}
        className="w-full py-3.5 rounded-xl bg-[#f5b73d] hover:bg-[#fbbf24] text-[#090e1b] font-bold text-base cursor-pointer flex items-center justify-center gap-2"
      >
        <Lock className="w-4 h-4" />
        <span>রিং {bn(stage + 1)} লক করো</span>
      </button>
    </div>
  );
};

/* HARDER TASK 6: 4-Item Randomized Canteen Order */
const CanteenGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const items = [
    { id: 'tea', label: 'গরম চা', Icon: Coffee },
    { id: 'coffee', label: 'কোল্ড কফি', Icon: CupSoda },
    { id: 'singara', label: 'সিঙ্গারা', Icon: Utensils },
    { id: 'water', label: 'মিনারেল পানি', Icon: Droplets },
  ];
  const order = useMemo(() => shuffle(items), []);
  const [step, setStep] = useState(0);

  return (
    <div className="space-y-3 text-center">
      <p className="text-xs text-slate-400">যাত্রীর ৪ আইটেমের অর্ডার হুবহু ক্রম অনুযায়ী দাও:</p>
      <div className="flex justify-center gap-1.5 flex-wrap">
        {order.map((o, i) => {
          const OIcon = o.Icon;
          return (
            <span
              key={`${o.id}-${i}`}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1 ${
                i < step
                  ? 'bg-[#19352b] border-[#43c07a] text-[#43c07a]'
                  : i === step
                  ? 'bg-[#2a2312] border-[#f5b73d] text-[#f5b73d]'
                  : 'bg-[#090e1b] border-[#2c3a57] text-slate-400'
              }`}
            >
              <OIcon className="w-3.5 h-3.5" />
              <span>{o.label}</span>
            </span>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2.5 pt-2">
        {items.map((it) => {
          const ItIcon = it.Icon;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                if (order[step].id === it.id) {
                  soundEngine.sfx('check');
                  if (step + 1 >= order.length) onDone();
                  else setStep(step + 1);
                } else {
                  setStep(0);
                  onError('ভুল আইটেম! শুরু থেকে সঠিক ক্রমে দাও');
                }
              }}
              className="py-3.5 rounded-xl bg-[#1c2844] hover:bg-[#27385f] text-white font-bold text-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <ItIcon className="w-4 h-4 text-[#f5b73d]" />
              <span>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* HARD TASK 7: 3x3 Memory Signal Matrix (Simon Says — 3 Escalating Rounds: 3, 4, 5 steps) */
const SignalGame: React.FC<{ onError: (t: string) => void; onDone: () => void }> = ({
  onError,
  onDone,
}) => {
  const targetSeq = useMemo(
    () => Array.from({ length: 5 }, () => (Math.random() * 9) | 0),
    []
  );
  const [round, setRound] = useState(1); // round 1 = 3 steps, round 2 = 4 steps, round 3 = 5 steps
  const [replayNonce, setReplayNonce] = useState(0);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [isPlayback, setIsPlayback] = useState(true);
  const [userStep, setUserStep] = useState(0);
  const [pressedCell, setPressedCell] = useState<{ cell: number; ok: boolean } | null>(null);

  const seqLen = round + 2; // 3, 4, 5

  useEffect(() => {
    let cancelled = false;
    setIsPlayback(true);
    setUserStep(0);
    setPlayingIdx(null);

    const timers: number[] = [];
    for (let i = 0; i < seqLen; i++) {
      const startAt = 380 + i * 520;
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setPlayingIdx(targetSeq[i]);
          soundEngine.sfx('click');
        }, startAt)
      );
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setPlayingIdx(null);
        }, startAt + 330)
      );
    }
    timers.push(
      window.setTimeout(() => {
        if (!cancelled) setIsPlayback(false);
      }, 380 + seqLen * 520 + 80)
    );

    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [round, replayNonce, seqLen, targetSeq]);

  const handlePress = (cell: number) => {
    if (isPlayback) return;
    if (targetSeq[userStep] === cell) {
      soundEngine.sfx('check');
      setPressedCell({ cell, ok: true });
      setTimeout(() => setPressedCell(null), 180);
      const nextStep = userStep + 1;
      if (nextStep >= seqLen) {
        if (round >= 3) {
          onDone();
        } else {
          setRound((r) => r + 1);
        }
      } else {
        setUserStep(nextStep);
      }
    } else {
      setPressedCell({ cell, ok: false });
      setTimeout(() => setPressedCell(null), 260);
      onError('ভুল সিগন্যাল! প্যাটার্নটি আবার দেখো');
      setUserStep(0);
      setReplayNonce((n) => n + 1);
    }
  };

  return (
    <div className="space-y-3 text-center">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{isPlayback ? 'বাম মনিটরের প্যাটার্ন মনোযোগ দিয়ে দেখো…' : 'এবার ডান কীপ্যাডে একই ক্রমে চাপো!'}</span>
        <span className="font-mono-num font-bold text-[#f5b73d]">ধাপ {bn(round)}/৩</span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-center">
        {/* Monitor (Playback Display) */}
        <div className="bg-[#090e1b] border border-[#2c3a57] rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 mb-1.5">সিগন্যাল মনিটর</div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className={`h-9 rounded-lg border transition-colors ${
                  playingIdx === idx
                    ? 'bg-[#38bdf8] border-white shadow-[0_0_12px_#38bdf8]'
                    : 'bg-[#121c33] border-[#253352]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Interactive Keypad */}
        <div className="bg-[#090e1b] border border-[#2c3a57] rounded-xl p-2.5">
          <div className="text-[10px] text-slate-400 mb-1.5">ইনপুট প্যাড</div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, idx) => {
              const isLit = pressedCell?.cell === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isPlayback}
                  onClick={() => handlePress(idx)}
                  className={`h-9 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                    isLit
                      ? pressedCell?.ok
                        ? 'bg-[#4ade80] border-white'
                        : 'bg-[#ef4444] border-white'
                      : 'bg-[#1c2844] hover:bg-[#2a3b63] border-[#33466d]'
                  }`}
                  aria-label={`সিগন্যাল ঘর ${idx + 1}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* REALISTIC PIXEL-COVERAGE WINDOW WIPE (must clear >= 88%) */
const WipeWindowGame: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);
  const drawingRef = useRef(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = 'rgba(180, 200, 220, 0.9)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // Subtle frost streaks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    for (let i = 0; i < 18; i++) {
      ctx.fillRect(Math.random() * cv.width, Math.random() * cv.height, 45, 3);
    }
    ctx.fillStyle = '#1e293b';
    ctx.font = '700 14px "Hind Siliguri", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('পুরো জানালা ঘষে কমপক্ষে ৮৮% পরিষ্কার করো', cv.width / 2, cv.height / 2);
  }, []);

  const checkCoverage = () => {
    const cv = cvRef.current;
    if (!cv || doneRef.current) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let total = 0;
    let clear = 0;
    // Sample every 12th pixel for fast exact check
    for (let i = 3; i < data.length; i += 48) {
      total++;
      if (data[i] < 40) clear++;
    }
    const p = Math.min(100, Math.round((clear / Math.max(1, total)) * 100));
    setPct(p);
    if (p >= 88) {
      doneRef.current = true;
      onDone();
    }
  };

  const scrub = (clientX: number, clientY: number) => {
    const cv = cvRef.current;
    if (!cv || doneRef.current) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const rect = cv.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * cv.width;
    const y = ((clientY - rect.top) / rect.height) * cv.height;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-slate-400 tabular-nums">
        <span>আঙুল বা মাউস ঘষে কুয়াশা সরাও</span>
        <span className="font-bold text-[#38bdf8]">{bn(pct)}% পরিষ্কার</span>
      </div>
      <div className="relative h-44 rounded-xl overflow-hidden bg-gradient-to-b from-[#0b1733] to-[#1b2e59] border border-[#2c3a57]">
        <div className="absolute inset-0 flex items-end justify-around px-4 opacity-80 pointer-events-none">
          {[60, 110, 80, 130, 95, 70].map((h, i) => (
            <div key={i} className="w-10 bg-[#091022]" style={{ height: `${h}px` }} />
          ))}
        </div>
        <canvas
          ref={cvRef}
          width={400}
          height={176}
          onPointerDown={(e) => {
            drawingRef.current = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            scrub(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (drawingRef.current) {
              scrub(e.clientX, e.clientY);
              if (Math.random() < 0.25) checkCoverage();
            }
          }}
          onPointerUp={() => {
            drawingRef.current = false;
            checkCoverage();
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
            checkCoverage();
          }}
          className="relative z-10 w-full h-full touch-none cursor-crosshair"
        />
      </div>
    </div>
  );
};

const BioScanGame: React.FC<{ world: GameWorld; onDone: () => void }> = ({ world, onDone }) => {
  const [scanning, setScanning] = useState(false);
  const [pct, setPct] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!scanning) return;
    if (world.me.role !== 'faker') {
      world.me.scanningUntil = world.t + 3.5;
      if (world.isOnline) netClient.sendScanStart();
    }
    const id = window.setInterval(() => {
      setPct((p) => {
        if (p >= 100) {
          clearInterval(id);
          onDoneRef.current();
          return 100;
        }
        return p + 5;
      });
    }, 130);
    return () => clearInterval(id);
  }, [scanning, world]);

  return (
    <div className="text-center space-y-3">
      <p className="text-xs text-slate-400">
        স্ক্যান শুরু করলে আশেপাশের যাত্রীরা সবুজ লেজার রশ্মি দেখতে পাবে (নিরপরাধ প্রমাণের ভিজ্যুয়াল টাস্ক!)
      </p>
      <div className="bg-[#090e1b] border border-[#2c3a57] rounded-xl p-4">
        <div className="text-sm font-bold text-[#34d399] mb-2">
          {scanning ? `স্ক্যানিং চলছে… ${bn(pct)}%` : 'স্ক্যানার প্রস্তুত'}
        </div>
        <div className="h-3 bg-[#1c253b] rounded-full overflow-hidden">
          <div className="h-full bg-[#34d399] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {!scanning && (
        <button
          type="button"
          onClick={() => {
            soundEngine.sfx('scan');
            setScanning(true);
          }}
          className="w-full py-3 rounded-xl bg-[#1f9d63] hover:bg-[#27b774] text-white font-bold cursor-pointer flex items-center justify-center gap-2"
        >
          <ScanLine className="w-5 h-5" />
          <span>স্ক্যান শুরু করো</span>
        </button>
      )}
    </div>
  );
};

/* ================= Sabotage Fix Panels ================= */

const SabotageFixBody: React.FC<{ type: string; onDone: () => void }> = ({ type, onDone }) => {
  const [val, setVal] = useState(15);
  const [holdPct, setHoldPct] = useState(0);
  const holdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (holdRef.current) {
        clearInterval(holdRef.current);
        holdRef.current = null;
      }
    };
  }, []);

  if (type === 'lights') {
    return <LightsPuzzle onDone={onDone} simpleMode />;
  }

  if (type === 'comms') {
    return (
      <div className="space-y-3 text-center">
        <p className="text-xs text-slate-400">ফ্রিকোয়েন্সি ৭৫-এ মিলিয়ে যোগাযোগ পরিষ্কার করো।</p>
        <div className="text-2xl font-mono-num font-bold text-[#38bdf8] flex items-center justify-center gap-2">
          <Activity className="w-5 h-5" />
          <span>{bn(val)}.০ MHz</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          value={val}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVal(v);
            if (Math.abs(v - 75) <= 3) onDone();
          }}
          className="w-full accent-[#38bdf8] cursor-pointer"
        />
      </div>
    );
  }

  const startHold = () => {
    if (holdRef.current) return;
    holdRef.current = window.setInterval(() => {
      setHoldPct((p) => {
        if (p >= 100) {
          if (holdRef.current) clearInterval(holdRef.current);
          holdRef.current = null;
          onDone();
          return 100;
        }
        return p + 8;
      });
    }, 100);
  };
  const stopHold = () => {
    if (holdRef.current) {
      clearInterval(holdRef.current);
      holdRef.current = null;
    }
    setHoldPct(0);
  };

  return (
    <div className="space-y-4 text-center">
      <p className="text-xs text-slate-400">জরুরি ব্রেক ভালভ রিসেট করতে বাটনটি চেপে ধরে রাখো।</p>
      <div className="h-3 bg-[#1c253b] rounded-full overflow-hidden">
        <div className="h-full bg-[#43c07a]" style={{ width: `${holdPct}%` }} />
      </div>
      <button
        type="button"
        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className="w-full py-5 rounded-2xl bg-[#ef5350] active:bg-[#dc2626] text-white font-bold text-lg cursor-pointer flex items-center justify-center gap-2"
      >
        <Hand className="w-5 h-5" />
        <span>ভালভ রিসেট চেপে ধরো</span>
      </button>
    </div>
  );
};

/* ================= CCTV Monitor ================= */

const CctvMonitor: React.FC<{ world: GameWorld }> = ({ world }) => {
  const [camIdx, setCamIdx] = useState(0);
  const cvRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cv = cvRef.current;
      if (cv) {
        const ctx = cv.getContext('2d');
        if (ctx) renderCameraFeed(ctx, cv.width, cv.height, world, camIdx);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [world, camIdx]);

  return (
    <div className="space-y-3">
      <canvas
        ref={cvRef}
        width={460}
        height={260}
        className="w-full h-56 rounded-xl border border-[#2c3a57] bg-[#070b14]"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CAMERAS.map((c, idx) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              soundEngine.sfx('click');
              setCamIdx(idx);
            }}
            className={`py-2 px-2 rounded-xl text-xs font-bold cursor-pointer ${
              camIdx === idx ? 'bg-[#38bdf8] text-[#091124]' : 'bg-[#1c2844] text-slate-200'
            }`}
          >
            {c.name.split(' · ')[0]}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ================= Admin Coach Radar ================= */

const AdminRadar: React.FC<{ world: GameWorld }> = ({ world }) => {
  const counts = Array.from({ length: N_COACHES }, (_, i) => {
    return world.players.filter((p) => p.alive && coachOf(p.x) === i).length;
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400 text-center">
        প্রতিটি কোচে বর্তমানে কতজন জীবিত যাত্রী অবস্থান করছে:
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {COACH_SHORT.map((name, i) => (
          <div
            key={i}
            className="bg-[#090e1b] border border-[#2c3a57] rounded-xl p-2.5 flex flex-col justify-between"
          >
            <div className="text-xs font-bold text-slate-300">{name}</div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap min-h-[20px]">
              {counts[i] === 0 ? (
                <span className="text-[11px] text-slate-500">খালি</span>
              ) : (
                Array.from({ length: counts[i] }).map((_, k) => (
                  <span key={k} className="w-3.5 h-3.5 rounded-full bg-[#4ade80] inline-block" />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ================= Full Train Blueprint Map & Sabotage Menu ================= */

const BlueprintMap: React.FC<{
  world: GameWorld;
  onTriggerSabotage: (type: Exclude<SabotageType, null>) => void;
}> = ({ world, onTriggerSabotage }) => {
  const me = world.me;
  const myCoach = coachOf(me.x);
  const myPct = Math.max(2, Math.min(98, (me.x / TW) * 100));

  return (
    <div className="space-y-3">
      <div className="relative bg-[#090e1b] border border-[#2c3a57] rounded-xl p-3 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1 min-w-[440px]">
          {COACH_SHORT.map((nm, i) => (
            <div
              key={i}
              className={`rounded-lg p-2 border text-center ${
                myCoach === i
                  ? 'bg-[#192847] border-[#f5b73d]'
                  : 'bg-[#111a2f] border-[#253352]'
              }`}
            >
              <div className="text-[10px] font-bold text-slate-200 leading-tight">{nm}</div>
              <div className="mt-1.5 flex justify-center gap-1 flex-wrap min-h-[14px]">
                {me.tasks.map((t, ti) =>
                  !t.done && t.spot.coach === i ? (
                    <span
                      key={ti}
                      className="w-3 h-3 rounded-full bg-[#f5b73d] text-[#090e1b] text-[9px] font-black flex items-center justify-center"
                    >
                      !
                    </span>
                  ) : null
                )}
                {world.sabotage.active &&
                  world.sabotage.active !== 'doors' &&
                  SABOTAGE_SPOTS.some(
                    (sb) =>
                      sb.coach === i &&
                      sb.type === world.sabotage.active &&
                      !world.sabotage.fixedParts[sb.id]
                  ) && (
                    <span className="w-3 h-3 rounded-full bg-[#ef4444] text-white text-[9px] font-black flex items-center justify-center animate-pulse">
                      !
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
        <div className="relative h-2 bg-[#1c253b] rounded-full mt-2 min-w-[440px]">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#f5b73d]"
            style={{ left: `calc(${myPct}% - 7px)` }}
          />
        </div>
        <div className="text-[11px] text-slate-400 mt-2 text-center">
          বর্তমান অবস্থান: <b className="text-[#f5b73d]">{COACH_NAMES[myCoach]}</b> · সাদা বিন্দু = তুমি · হলুদ = বাকি কাজ
        </div>
      </div>

      {me.role === 'faker' && me.alive && (
        <SabotageMenu world={world} onTrigger={onTriggerSabotage} />
      )}
    </div>
  );
};

const SabotageMenu: React.FC<{
  world: GameWorld;
  onTrigger: (type: Exclude<SabotageType, null>) => void;
}> = ({ world, onTrigger }) => {
  const disabled = !!world.sabotage.active || world.sabotage.cooldown > 0;
  const items: Array<{
    type: Exclude<SabotageType, null>;
    title: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    { type: 'lights', title: 'লাইট বন্ধ', desc: 'যাত্রীদের দৃশ্যমানতা কমে অন্ধকার হয়ে যাবে', Icon: LightbulbOff },
    { type: 'doors', title: 'দরজা লক', desc: 'সব কোচের সংযোগ দরজা ১২ সেকেন্ড বন্ধ থাকবে', Icon: DoorClosed },
    { type: 'brakes', title: 'ব্রেক ফেইল', desc: '৪৫ সেকেন্ডে রিসেট না করলে চোরের জয়!', Icon: AlertTriangle },
    { type: 'comms', title: 'যোগাযোগ জ্যাম', desc: 'মিনি-ম্যাপ, টাস্ক লিস্ট ও সিসিটিভি বন্ধ হবে', Icon: Radio },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-400 text-center">
        {world.sabotage.active
          ? 'একটি সাবোটাজ ইতিমধ্যেই চলছে!'
          : world.sabotage.cooldown > 0
          ? `সাবোটাজ কুলডাউন: ${bn(Math.ceil(world.sabotage.cooldown))} সেকেন্ড`
          : 'যাত্রীদের বিভ্রান্ত করতে একটি সাবোটাজ বেছে নাও:'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((it) => {
          const ItIcon = it.Icon;
          return (
            <button
              key={it.type}
              type="button"
              disabled={disabled}
              onClick={() => onTrigger(it.type)}
              className="p-3 rounded-xl bg-[#2a151b] hover:bg-[#3f1c25] border border-[#ef5350]/50 text-left disabled:opacity-40 cursor-pointer"
            >
              <div className="font-bold text-sm text-[#fca5a5] flex items-center gap-1.5">
                <ItIcon className="w-4 h-4 shrink-0" />
                <span>{it.title}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">{it.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
