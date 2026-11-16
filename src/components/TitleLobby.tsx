import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Globe,
  KeyRound,
  LogOut,
  MessageSquare,
  Play,
  Send,
  Settings,
  Shirt,
  TrainFront,
  User,
  UserMinus,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import {
  ACCN,
  COLORS,
  DISCUSS_TIME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SKINS,
  bn,
} from '../game/mapData';
import type { NetStatus } from '../game/netClient';
import { drawChar, rr } from '../game/renderer';
import { LobbyConfig, NetRoomState } from '../game/types';

export type LobbyMode = 'public' | 'private' | 'offline';
type ActiveOverlay = null | 'costume' | 'guide' | 'play';
type PlayStep = 'select' | LobbyMode;

interface TitleLobbyProps {
  config: LobbyConfig;
  soundOn: boolean;
  room: NetRoomState | null;
  myPlayerId: number | null;
  netError: string;
  netStatus: NetStatus;
  reconnecting: boolean;
  onChangeConfig: (next: LobbyConfig) => void;
  onToggleSound: () => void;
  onStartOffline: () => void;
  onQuickplay: () => void;
  onCreatePrivate: (fillBots: boolean, maxPlayers: number, teamName: string) => void;
  onJoinPrivate: (code: string) => void;
  onStartRoom: () => void;
  onLeaveRoom: () => void;
  onToggleReady: () => void;
  onKickPlayer: (targetId: number) => void;
  onTransferHost: (targetId: number) => void;
  onUpdateRoom: (opts: { teamName?: string; fillBots?: boolean; maxPlayers?: number }) => void;
  onSendLobbyChat: (text: string) => void;
}

const PLAYER_COUNT_OPTIONS = [4, 5, 6, 7] as const;

export const TitleLobby: React.FC<TitleLobbyProps> = ({
  config,
  soundOn,
  room,
  myPlayerId,
  netError,
  netStatus,
  reconnecting,
  onChangeConfig,
  onToggleSound,
  onStartOffline,
  onQuickplay,
  onCreatePrivate,
  onJoinPrivate,
  onStartRoom,
  onLeaveRoom,
  onToggleReady,
  onKickPlayer,
  onTransferHost,
  onUpdateRoom,
  onSendLobbyChat,
}) => {
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [overlay, setOverlay] = useState<ActiveOverlay>(null);
  const [playStep, setPlayStep] = useState<PlayStep>('select');
  const [privateTab, setPrivateTab] = useState<'create' | 'join'>('create');
  const [teamNameInput, setTeamNameInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [fillBots, setFillBots] = useState(true);
  const [privateMax, setPrivateMax] = useState(6);
  const [copied, setCopied] = useState(false);

  const [teamDrawer, setTeamDrawer] = useState<'none' | 'chat' | 'settings'>('none');
  const [chatText, setChatText] = useState('');
  const [editTeamName, setEditTeamName] = useState('');

  const clampedCount = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, config.count));

  useEffect(() => {
    if (room && overlay === 'play') {
      setOverlay(null);
    }
  }, [room, overlay]);

  useEffect(() => {
    if (room?.teamName) {
      setEditTeamName(room.teamName);
    }
  }, [room?.teamName]);

  useEffect(() => {
    if (teamDrawer === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [teamDrawer, room?.lobbyChat?.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape' && overlay) {
        setOverlay(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [overlay]);

  // Fullscreen elevated Dhaka Metro night canvas scene
  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const drawBg = (now: number) => {
      const t = now * 0.001;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#040812');
      g.addColorStop(0.55, '#0b1428');
      g.addColorStop(0.84, '#101c36');
      g.addColorStop(1, '#050912');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(W * 0.5, H * 0.65, 24, W * 0.5, H * 0.65, W * 0.55);
      glow.addColorStop(0, 'rgba(245, 183, 61, 0.11)');
      glow.addColorStop(0.5, 'rgba(31, 157, 99, 0.07)');
      glow.addColorStop(1, 'rgba(5, 9, 20, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 48; i++) {
        const sx = ((Math.sin(i * 91.7) * 0.5 + 0.5) * W + t * 1.4) % W;
        const sy = (Math.cos(i * 47.3) * 0.5 + 0.5) * H * 0.48;
        const twinkle = 0.25 + 0.35 * Math.sin(t * 1.8 + i * 2.1);
        ctx.fillStyle = `rgba(226, 232, 240, ${twinkle.toFixed(2)})`;
        ctx.fillRect(sx, sy, 1.7, 1.7);
      }

      const baseLine = H * 0.8;
      const bw = 78;
      const scroll = t * 14;
      const count = Math.ceil(W / bw) + 3;
      const startIdx = Math.floor(scroll / bw);
      for (let i = 0; i < count; i++) {
        const idx = startIdx + i;
        const x = idx * bw - scroll;
        const bh = 68 + Math.abs(Math.sin(idx * 12.9898)) * 165;
        ctx.fillStyle = '#091124';
        ctx.fillRect(x, baseLine - bh, bw - 8, bh);

        if (bh > 175 && Math.sin(t * 2.4 + idx) > 0.25) {
          ctx.fillStyle = 'rgba(239, 83, 80, 0.7)';
          ctx.beginPath();
          ctx.arc(x + (bw - 8) / 2, baseLine - bh - 3, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(245, 183, 61, 0.22)';
        for (let ry = 14; ry < bh - 16; ry += 18) {
          for (let rx = 10; rx < bw - 18; rx += 14) {
            if (Math.sin(idx * 31 + ry * 7 + rx) > 0.38) {
              ctx.fillRect(x + rx, baseLine - bh + ry, 5, 7);
            }
          }
        }
      }

      const trackY = H * 0.82;
      ctx.fillStyle = '#141e33';
      ctx.fillRect(0, trackY, W, 16);
      ctx.fillStyle = '#1f9d63';
      ctx.fillRect(0, trackY + 1, W, 2);
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, trackY + 16, W, H - trackY);

      const pierSpacing = 220;
      const pierOffset = (t * 28) % pierSpacing;
      for (let px = -pierOffset; px < W + pierSpacing; px += pierSpacing) {
        ctx.fillStyle = '#10182b';
        ctx.fillRect(px - 18, trackY + 16, 36, H - trackY);
        ctx.fillStyle = '#18233d';
        ctx.fillRect(px - 28, trackY + 12, 56, 8);
      }

      const trainSpan = W + 1600;
      const trainX = ((t * 255) % trainSpan) - 1080;
      const coachCount = 5;
      for (let c = 0; c < coachCount; c++) {
        const cx = trainX + c * 214;
        const isFront = c === coachCount - 1;
        ctx.fillStyle = '#d7e0ec';
        rr(ctx, cx, trackY - 52, 202, 48, isFront ? 12 : 7);
        ctx.fill();

        ctx.fillStyle = '#334155';
        ctx.fillRect(cx + 8, trackY - 55, 186, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(cx + 12, trackY - 5, 178, 5);

        ctx.fillStyle = '#1f9d63';
        ctx.fillRect(cx + 4, trackY - 14, 194, 5);
        ctx.fillStyle = '#f5b73d';
        ctx.fillRect(cx + 4, trackY - 17, 194, 2);

        for (let w = 0; w < 5; w++) {
          const wx = cx + 16 + w * 35;
          ctx.fillStyle = '#1e293b';
          rr(ctx, wx, trackY - 42, 24, 18, 3);
          ctx.fill();
          ctx.fillStyle = 'rgba(254, 240, 138, 0.86)';
          rr(ctx, wx + 1.5, trackY - 40.5, 21, 15, 2.5);
          ctx.fill();
        }
      }

      const leadX = trainX + coachCount * 214 - 12;
      const beam = ctx.createLinearGradient(leadX, trackY - 26, leadX + 240, trackY - 26);
      beam.addColorStop(0, 'rgba(254, 243, 199, 0.65)');
      beam.addColorStop(0.5, 'rgba(245, 183, 61, 0.18)');
      beam.addColorStop(1, 'rgba(254, 243, 199, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(leadX, trackY - 32);
      ctx.lineTo(leadX + 240, trackY - 72);
      ctx.lineTo(leadX + 240, trackY + 14);
      ctx.lineTo(leadX, trackY - 16);
      ctx.closePath();
      ctx.fill();

      raf = requestAnimationFrame(drawBg);
    };

    raf = requestAnimationFrame(drawBg);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Center Hero Character Platform Canvas
  useEffect(() => {
    const cv = previewCanvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const drawPrev = (now: number) => {
      const t = now * 0.001;
      ctx.clearRect(0, 0, 260, 210);

      const aura = ctx.createRadialGradient(130, 178, 10, 130, 178, 95);
      aura.addColorStop(0, 'rgba(245, 183, 61, 0.22)');
      aura.addColorStop(1, 'rgba(245, 183, 61, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(20, 120, 220, 90);

      ctx.fillStyle = 'rgba(6, 11, 22, 0.72)';
      ctx.beginPath();
      ctx.ellipse(130, 182, 80, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f5b73d';
      rr(ctx, 46, 176, 168, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#1f9d63';
      rr(ctx, 64, 183, 132, 3, 1.5);
      ctx.fill();

      drawChar(ctx, 130, 174, {
        s: 2.3,
        color: COLORS[config.color],
        skin: SKINS[config.skin],
        acc: config.acc,
        face: 1,
        ph: 0,
        idleT: t,
        moving: false,
        hasBag: true,
        seed: 7,
      });
      raf = requestAnimationFrame(drawPrev);
    };
    raf = requestAnimationFrame(drawPrev);
    return () => cancelAnimationFrame(raf);
  }, [config.color, config.skin, config.acc]);

  const isHost = room !== null && myPlayerId !== null && room.hostId === myPlayerId;
  const meInRoom = room?.players.find((p) => p.id === myPlayerId);
  const canStartPrivate = room !== null && isHost && (room.fillBots || room.players.length >= MIN_PLAYERS);
  const readyHumansCount = room ? room.players.filter((p) => !p.isBot && p.ready).length : 0;
  const totalHumansCount = room ? room.players.filter((p) => !p.isBot).length : 0;

  const copyRoomCode = () => {
    if (!room) return;
    navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const openPlaySelector = () => {
    setPlayStep('select');
    setOverlay('play');
  };

  const submitLobbyChat = (e: React.FormEvent) => {
    e.preventDefault();
    const t = chatText.trim();
    if (!t) return;
    onSendLobbyChat(t);
    setChatText('');
  };

  return (
    <div className="fixed inset-0 z-20 h-[100dvh] w-full overflow-hidden flex flex-col justify-between select-none">
      <canvas ref={bgCanvasRef} className="fixed inset-0 w-full h-full pointer-events-none" />
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(6,11,22,0.08) 0%, rgba(4,8,18,0.68) 100%)',
        }}
      />

      {/* Top Slim Responsive Gaming Header */}
      <header className="relative z-10 h-11 sm:h-13 shrink-0 w-full px-3 sm:px-7 flex items-center justify-between gap-2 sm:gap-4 border-b border-[#f5b73d]/20 bg-[#050a16]/78 backdrop-blur-md">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#1f9d63] flex items-center justify-center text-white shadow-md">
            <TrainFront className="w-4 h-4" />
          </span>
          <span className="text-base sm:text-lg font-bold tracking-tight text-white">Platform X</span>
        </div>

        <div className="hidden md:flex items-center gap-2.5 text-xs text-slate-400 whitespace-nowrap">
          <span className="text-[#f5b73d] font-semibold">ঢাকা মেট্রো লাইন-৬</span>
          <span aria-hidden="true">·</span>
          <span>সর্বোচ্চ {bn(MAX_PLAYERS)} প্লেয়ার</span>
          <span aria-hidden="true">·</span>
          <span>মিটিং {bn(DISCUSS_TIME)} সেকেন্ড</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOverlay(overlay === 'costume' ? null : 'costume')}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#0d162b]/90 border border-slate-700/75 text-xs font-semibold text-slate-100 hover:border-[#f5b73d]/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            <User className="w-3.5 h-3.5 text-[#f5b73d] shrink-0" />
            <span className="max-w-[72px] sm:max-w-[100px] truncate">
              {config.name.trim() || 'নাম সেট করো'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label="সাউন্ড পরিবর্তন"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#0d162b]/90 border border-slate-700/75 text-slate-100 hover:border-[#f5b73d]/60 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </header>

      {/* Main Responsive Stage (Scales cleanly across Portrait Phone, Landscape Phone, Tablet & Desktop) */}
      <main className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center px-3 sm:px-8 py-2 overflow-hidden">
        {/* Left Side Compact Icon Rail */}
        {!room && (
          <nav
            aria-label="লবি মেনু"
            className="fixed left-2.5 sm:left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2"
          >
            <button
              type="button"
              onClick={() => setOverlay(overlay === 'costume' ? null : 'costume')}
              className={`flex flex-col items-center justify-center w-12 h-12 sm:w-15 sm:h-15 rounded-xl border backdrop-blur-md transition-all cursor-pointer ${
                overlay === 'costume'
                  ? 'bg-[#f5b73d] border-[#f5b73d] text-[#060b16] shadow-lg'
                  : 'bg-[#070e1f]/88 border-[#f5b73d]/35 text-slate-200 hover:border-[#f5b73d] hover:bg-[#0e1a36]'
              }`}
            >
              <Shirt className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] font-bold mt-0.5 sm:mt-1">পোশাক</span>
            </button>

            <button
              type="button"
              onClick={() => setOverlay(overlay === 'guide' ? null : 'guide')}
              className={`flex flex-col items-center justify-center w-12 h-12 sm:w-15 sm:h-15 rounded-xl border backdrop-blur-md transition-all cursor-pointer ${
                overlay === 'guide'
                  ? 'bg-[#f5b73d] border-[#f5b73d] text-[#060b16] shadow-lg'
                  : 'bg-[#070e1f]/88 border-slate-700/80 text-slate-200 hover:border-[#f5b73d]/70 hover:bg-[#0e1a36]'
              }`}
            >
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] font-bold mt-0.5 sm:mt-1">নিয়ম</span>
            </button>
          </nav>
        )}

        {/* Center Hero Character Showcase OR Waiting Squad Stage */}
        {!room ? (
          <div className="flex flex-col items-center justify-center text-center pointer-events-none pl-8 pr-4 sm:px-0">
            <div className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#f5b73d] mb-0.5">
              যাত্রী · পরিদর্শক · ছদ্মবেশী চোর
            </div>
            <h1 className="text-lg sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
              মেট্রোর ভেতর আসল চোর কে?
            </h1>

            <canvas
              ref={previewCanvasRef}
              width={260}
              height={210}
              className="h-[clamp(112px,35dvh,210px)] w-auto my-1 sm:my-2"
            />

            <div className="pointer-events-auto flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-[#070e1f]/84 border border-[#f5b73d]/30 backdrop-blur-md">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[config.color] }}
              />
              <span className="text-xs sm:text-sm font-bold text-white max-w-[120px] truncate">
                {config.name.trim() || 'নামহীন যাত্রী'}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-[11px] sm:text-xs text-slate-300">{ACCN[config.acc]}</span>
            </div>
          </div>
        ) : (
          /* Squad Waiting Room Centerpiece (Responsive across all heights & widths) */
          <div className="w-full max-w-xl max-h-[calc(100dvh-76px)] bg-[#070e1f]/92 backdrop-blur-md border border-[#f5b73d]/35 rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex flex-col">
            <div className="h-1 w-full bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />
            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              {(reconnecting || netStatus !== 'connected') && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f5b73d]/15 border border-[#f5b73d]/45 text-[11px] sm:text-xs font-semibold text-[#f5b73d]">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                  <span>সার্ভারের সাথে স্বয়ংক্রিয় পুনঃসংযোগ চলছে…</span>
                </div>
              )}

              <div className="flex items-start justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                    {room.isPublic ? (
                      <>
                        <Globe className="w-4 h-4 text-[#1f9d63] shrink-0" />
                        <span>পাবলিক স্টেশন লবি</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 text-[#f5b73d] shrink-0" />
                        <span className="truncate">{room.teamName || 'টিম লবি'}</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                    {room.isPublic
                      ? room.countdown !== null
                        ? `সবাই প্রস্তুত · ${bn(room.countdown)} সেকেন্ডে ট্রেন ছাড়ছে…`
                        : '৪ জন হলে বা ২০ সেকেন্ডে বট সহ ট্রেন ছাড়বে'
                      : isHost
                      ? `কোড শেয়ার করো · প্রস্তুত: ${bn(readyHumansCount)}/${bn(totalHumansCount)}`
                      : `টিম প্রস্তুত: ${bn(readyHumansCount)}/${bn(totalHumansCount)} · লিডারের জন্য অপেক্ষা…`}
                  </p>
                </div>

                {!room.isPublic && (
                  <button
                    type="button"
                    onClick={copyRoomCode}
                    className="px-2.5 py-1.5 rounded-lg bg-[#040812] border border-[#f5b73d]/60 flex items-center gap-1.5 cursor-pointer hover:border-[#f5b73d] shrink-0"
                    title="কোড কপি করো"
                  >
                    <span className="font-mono-num text-sm sm:text-base font-bold tracking-widest text-[#f5b73d]">
                      {room.code}
                    </span>
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-[#43c07a]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Users className="w-3.5 h-3.5 text-[#f5b73d]" />
                  <span>
                    সদস্য ({bn(room.players.length)}/{bn(Math.min(MAX_PLAYERS, room.maxPlayers))})
                    {room.fillBots ? ' · খালি সিটে বট' : ''}
                  </span>
                </span>

                {!room.isPublic && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTeamDrawer(teamDrawer === 'chat' ? 'none' : 'chat')}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                        teamDrawer === 'chat'
                          ? 'bg-[#1f9d63]/20 border-[#1f9d63] text-[#43c07a]'
                          : 'bg-[#0a1328] border-slate-700/80 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>টিম চ্যাট</span>
                      {(room.lobbyChat?.length || 0) > 0 && (
                        <span className="font-mono-num text-[10px] opacity-80">
                          ({bn(room.lobbyChat?.length || 0)})
                        </span>
                      )}
                    </button>

                    {isHost && (
                      <button
                        type="button"
                        onClick={() => setTeamDrawer(teamDrawer === 'settings' ? 'none' : 'settings')}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          teamDrawer === 'settings'
                            ? 'bg-[#f5b73d]/20 border-[#f5b73d] text-[#f5b73d]'
                            : 'bg-[#0a1328] border-slate-700/80 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <Settings className="w-3 h-3" />
                        <span>সেটিংস</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Team Management Drawer: Lobby Chat OR Live Host Room Settings */}
              {!room.isPublic && teamDrawer === 'chat' && (
                <div className="rounded-xl bg-[#040812]/90 border border-slate-800 p-2.5 space-y-2">
                  <div className="max-h-24 sm:max-h-28 overflow-y-auto metro-scroll space-y-1 text-[11px] sm:text-xs pr-1">
                    {(room.lobbyChat || []).length === 0 ? (
                      <div className="text-slate-500 text-center py-2">টিম চ্যাটে কথা বলো…</div>
                    ) : (
                      (room.lobbyChat || []).map((c) => (
                        <div key={c.id} className={c.sys ? 'text-[#f5b73d]/90 italic' : 'text-slate-200'}>
                          {!c.sys && c.name && (
                            <span className="font-bold mr-1.5" style={{ color: c.color || '#cbd5e1' }}>
                              {c.name}:
                            </span>
                          )}
                          <span className="break-words">{c.text}</span>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={submitLobbyChat} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={80}
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="টিমকে মেসেজ পাঠাও..."
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#091226] border border-slate-700/80 text-xs text-slate-100 focus:outline-none focus:border-[#f5b73d]"
                    />
                    <button
                      type="submit"
                      disabled={!chatText.trim()}
                      className="w-8 h-8 rounded-lg bg-[#f5b73d] hover:bg-[#ffc34d] disabled:opacity-40 text-[#060b16] flex items-center justify-center cursor-pointer shrink-0"
                      aria-label="পাঠাও"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {!room.isPublic && teamDrawer === 'settings' && isHost && (
                <div className="rounded-xl bg-[#040812]/90 border border-[#f5b73d]/35 p-2.5 sm:p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={18}
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      placeholder="টিমের নাম"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#091226] border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-[#f5b73d]"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateRoom({ teamName: editTeamName })}
                      className="px-2.5 py-1.5 rounded-lg bg-[#f5b73d] text-[#060b16] text-xs font-bold cursor-pointer shrink-0"
                    >
                      নাম সেভ
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">সর্বোচ্চ:</span>
                      {PLAYER_COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={n < room.players.length}
                          onClick={() => onUpdateRoom({ maxPlayers: n })}
                          className={`w-6 h-6 rounded text-xs font-bold cursor-pointer disabled:opacity-30 ${
                            room.maxPlayers === n
                              ? 'bg-[#f5b73d] text-[#060b16]'
                              : 'bg-[#091226] text-slate-300 border border-slate-700'
                          }`}
                        >
                          {bn(n)}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={room.fillBots}
                        onChange={(e) => onUpdateRoom({ fillBots: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#f5b73d] cursor-pointer"
                      />
                      <span>খালি সিটে বট</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-1.5">
                {Array.from({ length: Math.min(MAX_PLAYERS, room.maxPlayers) }).map((_, idx) => {
                  const p = room.players[idx];
                  if (!p) {
                    return (
                      <div
                        key={`empty-${idx}`}
                        className="flex items-center gap-2 px-2.5 py-1.5 sm:py-2 rounded-lg border border-dashed border-slate-800 bg-[#040812]/50 text-xs text-slate-500"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-800 shrink-0" />
                        <span className="truncate">
                          {room.fillBots ? 'বট যোগ হবে' : 'খালি সিট'}
                        </span>
                      </div>
                    );
                  }
                  const canManageTeammate = !room.isPublic && isHost && !p.isBot && p.id !== myPlayerId;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 rounded-lg border text-xs ${
                        p.id === myPlayerId
                          ? 'border-[#f5b73d]/55 bg-[#101c38]'
                          : 'border-slate-800 bg-[#0a1328]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: p.color }}
                      />
                      <span
                        className={`font-semibold truncate flex-1 ${
                          p.id === myPlayerId ? 'text-[#f5b73d]' : 'text-slate-100'
                        }`}
                      >
                        {p.name}
                        {p.id === myPlayerId ? ' (তুমি)' : ''}
                      </span>

                      {!p.connected && !p.isBot && (
                        <span className="text-[10px] text-[#f5b73d] shrink-0">পুনঃসংযোগ…</span>
                      )}

                      {!room.isPublic && !p.isBot && p.connected && (
                        p.ready ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#43c07a] shrink-0"
                            title="প্রস্তুত"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 shrink-0">অপেক্ষায়</span>
                        )
                      )}

                      {p.id === room.hostId && (
                        <Crown className="w-3.5 h-3.5 text-[#f5b73d] shrink-0" aria-label="টিম লিডার" />
                      )}

                      {canManageTeammate && (
                        <div className="flex items-center gap-1 shrink-0 ml-0.5">
                          {p.connected && (
                            <button
                              type="button"
                              onClick={() => onTransferHost(p.id)}
                              title="টিম লিডার বানাও"
                              className="w-5 h-5 rounded bg-[#152242] hover:bg-[#f5b73d] text-slate-300 hover:text-[#060b16] flex items-center justify-center cursor-pointer"
                            >
                              <Crown className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onKickPlayer(p.id)}
                            title="টিম থেকে সরাও"
                            className="w-5 h-5 rounded bg-[#152242] hover:bg-[#ef5350] text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {p.isBot && <span className="text-[10px] text-slate-400 shrink-0">বট</span>}
                    </div>
                  );
                })}
              </div>

              {netError && <div className="text-xs font-semibold text-red-400">{netError}</div>}

              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="px-3 py-2 rounded-lg bg-[#111c36] hover:bg-[#1a294d] border border-slate-700/75 text-slate-200 font-semibold text-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>রুম ছাড়ো</span>
                </button>

                {!room.isPublic && meInRoom && (
                  <button
                    type="button"
                    onClick={onToggleReady}
                    className={`px-3.5 py-2 rounded-lg font-bold text-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap border transition-colors ${
                      meInRoom.ready
                        ? 'bg-[#1f9d63] border-[#1f9d63] text-white'
                        : 'bg-[#0e1a36] border-slate-700 text-slate-200 hover:border-[#1f9d63]'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{meInRoom.ready ? 'প্রস্তুত আছি' : 'প্রস্তুত হও'}</span>
                  </button>
                )}

                {!room.isPublic && isHost && (
                  <button
                    type="button"
                    disabled={!canStartPrivate}
                    onClick={onStartRoom}
                    className="flex-1 min-w-[120px] py-2 sm:py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#f5b73d] to-[#ffca5c] hover:from-[#ffc34d] hover:to-[#ffd47a] disabled:opacity-45 text-[#060b16] font-extrabold text-xs sm:text-sm cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-[#060b16]" />
                    <span>শুরু করো</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom-Right Corner Primary PLAY Button */}
      {!room && (
        <div className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-20 flex items-center gap-3">
          <button
            type="button"
            onClick={openPlaySelector}
            className="px-5 py-2.5 sm:px-8 sm:py-3.5 rounded-xl bg-gradient-to-r from-[#f5b73d] to-[#ffca5c] hover:from-[#ffc34d] hover:to-[#ffd47a] text-[#060b16] font-extrabold text-sm sm:text-lg tracking-wide shadow-[0_10px_30px_rgba(245,183,61,0.42)] cursor-pointer flex items-center gap-2 whitespace-nowrap transition-transform active:scale-[0.97]"
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-[#060b16]" />
            <span>খেলো (PLAY)</span>
          </button>
        </div>
      )}

      {/* Bottom-Left Subtle Error Alert if any */}
      {netError && !overlay && !room && (
        <div className="fixed bottom-3 left-3 sm:bottom-5 sm:left-6 z-20 px-3 py-1.5 rounded-lg bg-red-950/90 border border-red-500/50 text-xs font-semibold text-red-200 max-w-[55vw] sm:max-w-xs truncate">
          {netError}
        </div>
      )}

      {/* Responsive Costume / Dress Modal (Never clips on Portrait or Landscape Mobile) */}
      {overlay === 'costume' && !room && (
        <div
          className="fixed inset-0 z-30 bg-[#040812]/74 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#070e1f]/98 border border-[#f5b73d]/35 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />

            {/* Sticky Modal Header */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <Shirt className="w-4 h-4 text-[#f5b73d]" />
                <span>পোশাক ও চরিত্র সাজগোজ</span>
              </div>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-7 h-7 rounded-lg bg-[#101b36] text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Scrollable Body */}
            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  তোমার নাম (সর্বোচ্চ ১২ অক্ষর)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  value={config.name}
                  onChange={(e) => onChangeConfig({ ...config, name: e.target.value })}
                  placeholder="যেমন: রাহিম"
                  className="w-full px-3 py-2 rounded-xl bg-[#040812] border border-slate-700 text-slate-100 text-sm font-medium focus:outline-none focus:border-[#f5b73d]"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-slate-400">জ্যাকেটের রঙ</span>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 justify-items-center bg-[#040812]/65 p-2 rounded-xl border border-slate-800/80">
                  {COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, color: i })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        config.color === i
                          ? 'border-white scale-115'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`জ্যাকেট রঙ ${i + 1}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 mr-1">ত্বক</span>
                  {SKINS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, skin: i })}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        config.skin === i
                          ? 'border-white scale-115'
                          : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`ত্বকের রঙ ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-[#040812] border border-slate-700/80 rounded-xl px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ ...config, acc: (config.acc + 7) % 8 })}
                    className="w-7 h-7 rounded-lg text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="আগের স্টাইল"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-100 min-w-[68px] text-center truncate">
                    {ACCN[config.acc]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ ...config, acc: (config.acc + 1) % 8 })}
                    className="w-7 h-7 rounded-lg text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="পরের স্টাইল"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-slate-800 bg-[#050a16]/75 shrink-0">
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-full py-2.5 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#060b16] font-bold text-sm cursor-pointer"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Guide / Controls Modal */}
      {overlay === 'guide' && !room && (
        <div
          className="fixed inset-0 z-30 bg-[#040812]/74 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#070e1f]/98 border border-[#f5b73d]/35 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />

            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                <BookOpen className="w-4 h-4 text-[#f5b73d]" />
                <span>খেলার নিয়ম ও কন্ট্রোল</span>
              </div>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-7 h-7 rounded-lg bg-[#101b36] text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              <div className="space-y-1.5 text-xs text-slate-300 leading-relaxed">
                <p>
                  <strong className="text-[#43c07a]">যাত্রী:</strong> ৭ কোচের কাজ শেষ করো, সিসিটিভি দেখো এবং চোরকে ভোট দাও।
                </p>
                <p>
                  <strong className="text-[#4da3ff]">পরিদর্শক:</strong> ৩ বার সন্দেহভাজনের টিকেট চেক (Q) করে আসল-নকল যাচাই করো।
                </p>
                <p>
                  <strong className="text-[#ef5350]">চোর (ফেক টিকেট):</strong> একা পেলে ব্যাগ চুরি (Q), সাবোটাজ (F) ও ভেন্ট (V) ব্যবহার করো।
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800 text-[11px] sm:text-xs text-slate-300">
                <div className="flex items-center justify-between bg-[#040812] px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span>চলাফেরা</span>
                  <kbd className="font-mono-num text-[#f5b73d]">WASD</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#040812] px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span>কাজ / ব্যবহার</span>
                  <kbd className="font-mono-num text-[#f5b73d]">E / Space</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#040812] px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span>চুরি / চেক</span>
                  <kbd className="font-mono-num text-[#f5b73d]">Q</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#040812] px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span>রিপোর্ট / ম্যাপ</span>
                  <kbd className="font-mono-num text-[#f5b73d]">R / M</kbd>
                </div>
              </div>
            </div>

            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-slate-800 bg-[#050a16]/75 shrink-0">
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-full py-2.5 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#060b16] font-bold text-sm cursor-pointer"
              >
                বুঝেছি
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Corner PLAY Flow Modal (Works identically & cleanly on all devices) */}
      {overlay === 'play' && !room && (
        <div
          className="fixed inset-0 z-30 bg-[#040812]/76 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#070e1f]/98 border border-[#f5b73d]/35 rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.8)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-1 bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />

            {/* Sticky Header */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {playStep !== 'select' && (
                  <button
                    type="button"
                    onClick={() => setPlayStep('select')}
                    className="w-7 h-7 rounded-lg bg-[#101b36] hover:bg-[#19294f] text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="পেছনে যাও"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  {playStep === 'select'
                    ? 'কোন মোডে খেলবে?'
                    : playStep === 'public'
                    ? 'মাল্টিপ্লেয়ার (পাবলিক ম্যাচ)'
                    : playStep === 'private'
                    ? 'টিম / প্রাইভেট রুম'
                    : 'বট মোড (অফলাইন)'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-7 h-7 rounded-lg bg-[#101b36] text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body for Short Landscape Screens */}
            <div className="p-3.5 sm:p-5 overflow-y-auto metro-scroll flex-1 min-h-0">
              {playStep === 'select' && (
                <div className="space-y-2 sm:space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setPlayStep('public')}
                    className="w-full p-3 sm:p-3.5 rounded-xl bg-[#0a142b] hover:bg-[#102042] border border-[#1f9d63]/45 hover:border-[#1f9d63] text-left flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#1f9d63]/18 border border-[#1f9d63]/40 flex items-center justify-center text-[#43c07a] shrink-0">
                      <Globe className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">মাল্টিপ্লেয়ার</div>
                      <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                        অনলাইনে অটো-ম্যাচ (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlayStep('private')}
                    className="w-full p-3 sm:p-3.5 rounded-xl bg-[#0a142b] hover:bg-[#102042] border border-[#f5b73d]/35 hover:border-[#f5b73d] text-left flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#f5b73d]/15 border border-[#f5b73d]/35 flex items-center justify-center text-[#f5b73d] shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">টিম / প্রাইভেট রুম</div>
                      <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                        রুম কোড দিয়ে বন্ধুদের সাথে খেলো (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlayStep('offline')}
                    className="w-full p-3 sm:p-3.5 rounded-xl bg-[#0a142b] hover:bg-[#102042] border border-slate-700/80 hover:border-[#f5b73d] text-left flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-800/80 border border-slate-600/50 flex items-center justify-center text-[#f5b73d] shrink-0">
                      <Bot className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-white">বট মোড</div>
                      <div className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                        অফলাইনে স্মার্ট এআই বটদের সাথে খেলো (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                </div>
              )}

              {playStep === 'public' && (
                <div className="space-y-3.5">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    পাবলিক অটো-ম্যাচে ৪ জন হলেই অথবা ২০ সেকেন্ড পর খালি সিটে বট সহ ম্যাচ শুরু হবে (সর্বোচ্চ {bn(MAX_PLAYERS)} জন)।
                  </p>

                  <div className="grid grid-cols-3 divide-x divide-slate-800 border-y border-slate-800/90 py-2.5 text-center text-xs">
                    <div>
                      <div className="text-slate-400">প্লেয়ার</div>
                      <div className="font-bold text-white mt-0.5 tabular-nums">৪–{bn(MAX_PLAYERS)} জন</div>
                    </div>
                    <div>
                      <div className="text-slate-400">ম্যাচ</div>
                      <div className="font-bold text-white mt-0.5 tabular-nums">১৫০ সে.</div>
                    </div>
                    <div>
                      <div className="text-slate-400">মিটিং</div>
                      <div className="font-bold text-[#f5b73d] mt-0.5 tabular-nums">{bn(DISCUSS_TIME)} সে.</div>
                    </div>
                  </div>

                  {netError && <div className="text-xs font-semibold text-red-400">{netError}</div>}

                  <button
                    type="button"
                    onClick={onQuickplay}
                    className="w-full py-3 rounded-xl bg-[#1f9d63] hover:bg-[#25b874] text-white font-bold text-sm sm:text-base shadow-lg cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>ম্যাচে প্রবেশ করো</span>
                  </button>
                </div>
              )}

              {playStep === 'private' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 bg-[#040812] p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setPrivateTab('create')}
                      className={`py-1.5 sm:py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                        privateTab === 'create'
                          ? 'bg-[#f5b73d] text-[#060b16]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      রুম তৈরি করো
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrivateTab('join')}
                      className={`py-1.5 sm:py-2 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                        privateTab === 'join'
                          ? 'bg-[#f5b73d] text-[#060b16]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      কোড দিয়ে ঢোকো
                    </button>
                  </div>

                  {privateTab === 'create' ? (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-400">
                          টিমের নাম (ঐচ্ছিক)
                        </label>
                        <input
                          type="text"
                          maxLength={18}
                          value={teamNameInput}
                          onChange={(e) => setTeamNameInput(e.target.value)}
                          placeholder="যেমন: টিম ঢাকা"
                          className="w-full px-3 py-2 rounded-xl bg-[#040812] border border-slate-700 text-slate-100 text-sm font-medium focus:outline-none focus:border-[#f5b73d]"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 border-y border-slate-800/90 py-2.5">
                        <span className="text-xs font-semibold text-slate-300">
                          কয়জন খেলবে? ({bn(MIN_PLAYERS)}–{bn(MAX_PLAYERS)})
                        </span>
                        <div className="flex items-center gap-1 bg-[#040812] p-1 rounded-lg border border-slate-800">
                          {PLAYER_COUNT_OPTIONS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPrivateMax(n)}
                              className={`w-7 h-7 rounded text-xs font-bold tabular-nums cursor-pointer ${
                                privateMax === n
                                  ? 'bg-[#f5b73d] text-[#060b16]'
                                  : 'text-slate-300 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              {bn(n)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer py-0.5">
                        <span>খালি সিটে বট বসাও</span>
                        <input
                          type="checkbox"
                          checked={fillBots}
                          onChange={(e) => setFillBots(e.target.checked)}
                          className="w-4 h-4 accent-[#f5b73d] cursor-pointer"
                        />
                      </label>

                      {netError && <div className="text-xs font-semibold text-red-400">{netError}</div>}

                      <button
                        type="button"
                        onClick={() =>
                          onCreatePrivate(fillBots, Math.min(MAX_PLAYERS, privateMax), teamNameInput)
                        }
                        className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#060b16] font-bold text-sm sm:text-base shadow-lg cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>টিম রুম তৈরি করো</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        maxLength={4}
                        value={joinCode}
                        onChange={(e) =>
                          setJoinCode(e.target.value.toUpperCase().replace(/[IO01\s]/g, '').slice(0, 4))
                        }
                        placeholder="রুম কোড লেখো (যেমন: A7K2)"
                        className="w-full px-4 py-2.5 rounded-xl bg-[#040812] border border-slate-700 text-center text-slate-100 font-mono-num font-bold tracking-[0.35em] uppercase text-base sm:text-lg focus:outline-none focus:border-[#f5b73d]"
                      />
                      {netError && <div className="text-xs font-semibold text-red-400">{netError}</div>}
                      <button
                        type="button"
                        disabled={joinCode.trim().length < 4}
                        onClick={() => onJoinPrivate(joinCode)}
                        className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] disabled:opacity-45 text-[#060b16] font-bold text-sm sm:text-base shadow-lg cursor-pointer whitespace-nowrap"
                      >
                        রুমে প্রবেশ করো
                      </button>
                    </div>
                  )}
                </div>
              )}

              {playStep === 'offline' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-y border-slate-800/90 py-2.5">
                    <span className="text-xs font-semibold text-slate-300">
                      কয়জন খেলবে? ({bn(MIN_PLAYERS)}–{bn(MAX_PLAYERS)})
                    </span>
                    <div className="flex items-center gap-1 bg-[#040812] p-1 rounded-lg border border-slate-800">
                      {PLAYER_COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            onChangeConfig({
                              ...config,
                              count: n,
                              fakers: n < MAX_PLAYERS ? 1 : config.fakers,
                            })
                          }
                          className={`w-7 h-7 rounded text-xs font-bold tabular-nums cursor-pointer ${
                            clampedCount === n
                              ? 'bg-[#f5b73d] text-[#060b16]'
                              : 'text-slate-300 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {bn(n)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">ম্যাচে চোর কয়জন?</span>
                    <div className="flex items-center gap-1 bg-[#040812] p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => onChangeConfig({ ...config, fakers: 1 })}
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer whitespace-nowrap ${
                          config.fakers === 1
                            ? 'bg-[#ef5350] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ১ জন
                      </button>
                      <button
                        type="button"
                        disabled={clampedCount < MAX_PLAYERS}
                        onClick={() => onChangeConfig({ ...config, fakers: 2 })}
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-35 ${
                          config.fakers === 2 && clampedCount >= MAX_PLAYERS
                            ? 'bg-[#ef5350] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ২ জন
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 text-center">
                    ৩৩% সমান র‍্যান্ডম রোল · মিটিং সময় {bn(DISCUSS_TIME)} সেকেন্ড
                  </div>

                  <button
                    type="button"
                    onClick={onStartOffline}
                    className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#060b16] font-bold text-sm sm:text-base shadow-lg cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <TrainFront className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>ট্রেনে ওঠো</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
