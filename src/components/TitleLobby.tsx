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
      g.addColorStop(0, '#0d0e11');
      g.addColorStop(0.55, '#16181d');
      g.addColorStop(0.84, '#1d2026');
      g.addColorStop(1, '#0c0d0f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const glow = ctx.createRadialGradient(W * 0.5, H * 0.65, 24, W * 0.5, H * 0.65, W * 0.55);
      glow.addColorStop(0, 'rgba(229, 158, 36, 0.09)');
      glow.addColorStop(0.5, 'rgba(45, 159, 104, 0.05)');
      glow.addColorStop(1, 'rgba(13, 14, 17, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 48; i++) {
        const sx = ((Math.sin(i * 91.7) * 0.5 + 0.5) * W + t * 1.4) % W;
        const sy = (Math.cos(i * 47.3) * 0.5 + 0.5) * H * 0.48;
        const twinkle = 0.22 + 0.3 * Math.sin(t * 1.8 + i * 2.1);
        ctx.fillStyle = `rgba(243, 239, 230, ${twinkle.toFixed(2)})`;
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
        ctx.fillStyle = '#121317';
        ctx.fillRect(x, baseLine - bh, bw - 8, bh);

        if (bh > 175 && Math.sin(t * 2.4 + idx) > 0.25) {
          ctx.fillStyle = 'rgba(217, 72, 59, 0.72)';
          ctx.beginPath();
          ctx.arc(x + (bw - 8) / 2, baseLine - bh - 3, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(229, 158, 36, 0.19)';
        for (let ry = 14; ry < bh - 16; ry += 18) {
          for (let rx = 10; rx < bw - 18; rx += 14) {
            if (Math.sin(idx * 31 + ry * 7 + rx) > 0.38) {
              ctx.fillRect(x + rx, baseLine - bh + ry, 5, 7);
            }
          }
        }
      }

      const trackY = H * 0.82;
      ctx.fillStyle = '#1d1f25';
      ctx.fillRect(0, trackY, W, 16);
      ctx.fillStyle = '#2d9f68';
      ctx.fillRect(0, trackY + 1, W, 2);
      ctx.fillStyle = '#121316';
      ctx.fillRect(0, trackY + 16, W, H - trackY);

      const pierSpacing = 220;
      const pierOffset = (t * 28) % pierSpacing;
      for (let px = -pierOffset; px < W + pierSpacing; px += pierSpacing) {
        ctx.fillStyle = '#16181c';
        ctx.fillRect(px - 18, trackY + 16, 36, H - trackY);
        ctx.fillStyle = '#22252c';
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
      aura.addColorStop(0, 'rgba(229, 158, 36, 0.18)');
      aura.addColorStop(1, 'rgba(229, 158, 36, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(20, 120, 220, 90);

      ctx.fillStyle = 'rgba(12, 13, 16, 0.78)';
      ctx.beginPath();
      ctx.ellipse(130, 182, 80, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e59e24';
      rr(ctx, 46, 176, 168, 4, 2);
      ctx.fill();
      ctx.fillStyle = '#2d9f68';
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
            'radial-gradient(ellipse at center, rgba(17,18,20,0.06) 0%, rgba(11,12,15,0.72) 100%)',
        }}
      />

      {/* Top Slim Responsive Station Console Header */}
      <header className="relative z-10 h-11 sm:h-13 shrink-0 w-full px-3 sm:px-7 flex items-center justify-between gap-2 sm:gap-4 border-b border-[#2e313a] bg-[#16171b]/90 backdrop-blur-md">
        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#2d9f68] border border-[#3ec182]/40 flex items-center justify-center text-[#f3efe6] shadow-sm">
            <TrainFront className="w-4 h-4" />
          </span>
          <span className="text-base sm:text-lg font-bold tracking-tight text-[#f3efe6]">Platform X</span>
        </div>

        <div className="hidden md:flex items-center gap-2.5 text-xs text-[#a19e96] whitespace-nowrap">
          <span className="text-[#e59e24] font-semibold">ঢাকা মেট্রো লাইন-৬</span>
          <span aria-hidden="true">·</span>
          <span>সর্বোচ্চ {bn(MAX_PLAYERS)} প্লেয়ার</span>
          <span aria-hidden="true">·</span>
          <span>মিটিং {bn(DISCUSS_TIME)} সেকেন্ড</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOverlay(overlay === 'costume' ? null : 'costume')}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[#23252b] border border-[#363943] text-xs font-semibold text-[#f3efe6] hover:border-[#e59e24] transition-colors cursor-pointer whitespace-nowrap"
          >
            <User className="w-3.5 h-3.5 text-[#e59e24] shrink-0" />
            <span className="max-w-[72px] sm:max-w-[100px] truncate">
              {config.name.trim() || 'নাম সেট করো'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            aria-label="সাউন্ড পরিবর্তন"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#23252b] border border-[#363943] text-[#f3efe6] hover:border-[#e59e24] flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-[#e59e24]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#a19e96]" />
            )}
          </button>
        </div>
      </header>

      {/* Main Responsive Stage */}
      <main className="relative z-10 flex-1 min-h-0 w-full flex items-center justify-center px-3 sm:px-8 py-2 overflow-hidden">
        {/* Left Side Compact Icon Rail */}
        {!room && (
          <nav
            aria-label="লবি মেনু"
            className="fixed left-2.5 sm:left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2.5"
          >
            <button
              type="button"
              onClick={() => setOverlay(overlay === 'costume' ? null : 'costume')}
              className={`flex flex-col items-center justify-center w-12 h-12 sm:w-15 sm:h-15 rounded-xl border transition-all cursor-pointer ${
                overlay === 'costume'
                  ? 'bg-[#e59e24] border-[#f0ae35] text-[#111214] shadow-[0_3px_0_#9a650b]'
                  : 'bg-[#1a1b1f]/95 border-[#343741] text-[#f3efe6] hover:border-[#e59e24] hover:bg-[#23252b] shadow-[0_3px_0_#0b0c0e]'
              }`}
            >
              <Shirt className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-[10px] font-bold mt-0.5 sm:mt-1">পোশাক</span>
            </button>

            <button
              type="button"
              onClick={() => setOverlay(overlay === 'guide' ? null : 'guide')}
              className={`flex flex-col items-center justify-center w-12 h-12 sm:w-15 sm:h-15 rounded-xl border transition-all cursor-pointer ${
                overlay === 'guide'
                  ? 'bg-[#e59e24] border-[#f0ae35] text-[#111214] shadow-[0_3px_0_#9a650b]'
                  : 'bg-[#1a1b1f]/95 border-[#343741] text-[#f3efe6] hover:border-[#e59e24] hover:bg-[#23252b] shadow-[0_3px_0_#0b0c0e]'
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
            <div className="text-[11px] sm:text-xs font-semibold tracking-wide text-[#e59e24] mb-0.5">
              যাত্রী · পরিদর্শক · ছদ্মবেশী চোর
            </div>
            <h1 className="text-lg sm:text-3xl lg:text-4xl font-extrabold text-[#f3efe6] tracking-tight drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)]">
              মেট্রোর ভেতর আসল চোর কে?
            </h1>

            <canvas
              ref={previewCanvasRef}
              width={260}
              height={210}
              className="h-[clamp(112px,35dvh,210px)] w-auto my-1 sm:my-2"
            />

            <div className="pointer-events-auto flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-[#1a1b1f]/95 border border-[#343741] shadow-md">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: COLORS[config.color] }}
              />
              <span className="text-xs sm:text-sm font-bold text-[#f3efe6] max-w-[120px] truncate">
                {config.name.trim() || 'নামহীন যাত্রী'}
              </span>
              <span className="text-[#625f59]">·</span>
              <span className="text-[11px] sm:text-xs text-[#a19e96]">{ACCN[config.acc]}</span>
            </div>
          </div>
        ) : (
          /* Squad Waiting Room Centerpiece */
          <div className="w-full max-w-xl max-h-[calc(100dvh-76px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8)] flex flex-col">
            <div className="p-3 sm:p-5 space-y-2.5 sm:space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              {(reconnecting || netStatus !== 'connected') && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#e59e24]/15 border border-[#e59e24]/45 text-[11px] sm:text-xs font-semibold text-[#e59e24]">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                  <span>সার্ভারের সাথে স্বয়ংক্রিয় পুনঃসংযোগ চলছে…</span>
                </div>
              )}

              <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#2e313a]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-[#f3efe6]">
                    {room.isPublic ? (
                      <>
                        <Globe className="w-4 h-4 text-[#2d9f68] shrink-0" />
                        <span>পাবলিক স্টেশন লবি</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4 text-[#e59e24] shrink-0" />
                        <span className="truncate">{room.teamName || 'টিম লবি'}</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-[#a19e96] mt-0.5 truncate">
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
                    className="px-2.5 py-1.5 rounded-lg bg-[#111214] border border-[#e59e24]/60 flex items-center gap-1.5 cursor-pointer hover:border-[#e59e24] shrink-0"
                    title="কোড কপি করো"
                  >
                    <span className="font-mono-num text-sm sm:text-base font-bold tracking-widest text-[#e59e24]">
                      {room.code}
                    </span>
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-[#3cc280]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#a19e96]" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-[#a19e96]">
                <span className="flex items-center gap-1.5 font-semibold text-[#f3efe6]">
                  <Users className="w-3.5 h-3.5 text-[#e59e24]" />
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
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                        teamDrawer === 'chat'
                          ? 'bg-[#2d9f68]/20 border-[#2d9f68] text-[#4ad190]'
                          : 'bg-[#23252b] border-[#343741] text-[#d5d1c8] hover:border-[#625f59]'
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
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          teamDrawer === 'settings'
                            ? 'bg-[#e59e24]/20 border-[#e59e24] text-[#e59e24]'
                            : 'bg-[#23252b] border-[#343741] text-[#d5d1c8] hover:border-[#625f59]'
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
                <div className="rounded-lg bg-[#111214] border border-[#2e313a] p-2.5 space-y-2">
                  <div className="max-h-24 sm:max-h-28 overflow-y-auto metro-scroll space-y-1 text-[11px] sm:text-xs pr-1">
                    {(room.lobbyChat || []).length === 0 ? (
                      <div className="text-[#73706a] text-center py-2">টিম চ্যাটে কথা বলো…</div>
                    ) : (
                      (room.lobbyChat || []).map((c) => (
                        <div key={c.id} className={c.sys ? 'text-[#e59e24]/90 italic' : 'text-[#f3efe6]'}>
                          {!c.sys && c.name && (
                            <span className="font-bold mr-1.5" style={{ color: c.color || '#d5d1c8' }}>
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
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#1a1b1f] border border-[#343741] text-xs text-[#f3efe6] focus:outline-none focus:border-[#e59e24]"
                    />
                    <button
                      type="submit"
                      disabled={!chatText.trim()}
                      className="w-8 h-8 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] disabled:opacity-40 text-[#111214] flex items-center justify-center cursor-pointer shrink-0"
                      aria-label="পাঠাও"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}

              {!room.isPublic && teamDrawer === 'settings' && isHost && (
                <div className="rounded-lg bg-[#111214] border border-[#e59e24]/35 p-2.5 sm:p-3 space-y-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={18}
                      value={editTeamName}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      placeholder="টিমের নাম"
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#1a1b1f] border border-[#343741] text-xs text-[#f3efe6] focus:outline-none focus:border-[#e59e24]"
                    />
                    <button
                      type="button"
                      onClick={() => onUpdateRoom({ teamName: editTeamName })}
                      className="px-2.5 py-1.5 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] text-xs font-bold cursor-pointer shrink-0"
                    >
                      নাম সেভ
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#a19e96]">সর্বোচ্চ:</span>
                      {PLAYER_COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={n < room.players.length}
                          onClick={() => onUpdateRoom({ maxPlayers: n })}
                          className={`w-6 h-6 rounded text-xs font-bold cursor-pointer disabled:opacity-30 ${
                            room.maxPlayers === n
                              ? 'bg-[#e59e24] text-[#111214]'
                              : 'bg-[#23252b] text-[#d5d1c8] border border-[#343741]'
                          }`}
                        >
                          {bn(n)}
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-1.5 text-[#d5d1c8] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={room.fillBots}
                        onChange={(e) => onUpdateRoom({ fillBots: e.target.checked })}
                        className="w-3.5 h-3.5 accent-[#e59e24] cursor-pointer"
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
                        className="flex items-center gap-2 px-2.5 py-1.5 sm:py-2 rounded-lg border border-dashed border-[#2e313a] bg-[#131418] text-xs text-[#73706a]"
                      >
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2a2d35] shrink-0" />
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
                          ? 'border-[#e59e24]/70 bg-[#25231f]'
                          : 'border-[#2e313a] bg-[#22242a]'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ backgroundColor: p.color }}
                      />
                      <span
                        className={`font-semibold truncate flex-1 ${
                          p.id === myPlayerId ? 'text-[#e59e24]' : 'text-[#f3efe6]'
                        }`}
                      >
                        {p.name}
                        {p.id === myPlayerId ? ' (তুমি)' : ''}
                      </span>

                      {!p.connected && !p.isBot && (
                        <span className="text-[10px] text-[#e59e24] shrink-0">পুনঃসংযোগ…</span>
                      )}

                      {!room.isPublic && !p.isBot && p.connected && (
                        p.ready ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#3cc280] shrink-0"
                            title="প্রস্তুত"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#a19e96] shrink-0">অপেক্ষায়</span>
                        )
                      )}

                      {p.id === room.hostId && (
                        <Crown className="w-3.5 h-3.5 text-[#e59e24] shrink-0" aria-label="টিম লিডার" />
                      )}

                      {canManageTeammate && (
                        <div className="flex items-center gap-1 shrink-0 ml-0.5">
                          {p.connected && (
                            <button
                              type="button"
                              onClick={() => onTransferHost(p.id)}
                              title="টিম লিডার বানাও"
                              className="w-5 h-5 rounded bg-[#2d3039] hover:bg-[#e59e24] text-[#d5d1c8] hover:text-[#111214] flex items-center justify-center cursor-pointer"
                            >
                              <Crown className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onKickPlayer(p.id)}
                            title="টিম থেকে সরাও"
                            className="w-5 h-5 rounded bg-[#2d3039] hover:bg-[#d9483b] text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {p.isBot && <span className="text-[10px] text-[#a19e96] shrink-0">বট</span>}
                    </div>
                  );
                })}
              </div>

              {netError && <div className="text-xs font-semibold text-[#e86b5e]">{netError}</div>}

              <div className="pt-2.5 border-t border-[#2e313a] flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="px-3 py-2 rounded-lg bg-[#23252b] hover:bg-[#2d3038] border border-[#363943] text-[#f3efe6] font-semibold text-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
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
                        ? 'bg-[#2d9f68] border-[#3ab67a] text-white'
                        : 'bg-[#23252b] border-[#363943] text-[#f3efe6] hover:border-[#2d9f68]'
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
                    className="flex-1 min-w-[120px] py-2 sm:py-2.5 px-4 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] disabled:opacity-45 text-[#111214] font-extrabold text-xs sm:text-sm cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap shadow-[0_3px_0_#9a650b] active:translate-y-[1px] active:shadow-[0_2px_0_#9a650b]"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-[#111214]" />
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
            className="px-5 py-2.5 sm:px-8 sm:py-3.5 rounded-xl bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-extrabold text-sm sm:text-lg tracking-wide shadow-[0_4px_0_#9a650b,0_12px_28px_rgba(0,0,0,0.55)] cursor-pointer flex items-center gap-2 whitespace-nowrap transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#9a650b]"
          >
            <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-[#111214]" />
            <span>খেলো (PLAY)</span>
          </button>
        </div>
      )}

      {/* Bottom-Left Subtle Error Alert if any */}
      {netError && !overlay && !room && (
        <div className="fixed bottom-3 left-3 sm:bottom-5 sm:left-6 z-20 px-3 py-1.5 rounded-lg bg-[#2b1211] border border-[#d9483b]/70 text-xs font-semibold text-[#f8c6c1] max-w-[55vw] sm:max-w-xs truncate">
          {netError}
        </div>
      )}

      {/* Responsive Costume / Dress Modal */}
      {overlay === 'costume' && !room && (
        <div
          className="fixed inset-0 z-30 bg-[#0a0b0d]/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Solid Station Console Modal Header */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-[#212329] border-b border-[#343741] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-[#f3efe6]">
                <span className="w-1 h-4 rounded-xs bg-[#e59e24] shrink-0" aria-hidden="true" />
                <Shirt className="w-4 h-4 text-[#e59e24]" />
                <span>পোশাক ও চরিত্র সাজগোজ</span>
              </div>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-7 h-7 rounded-lg bg-[#2a2d35] hover:bg-[#353944] border border-[#3c404d] text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Compact Scrollable Body */}
            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#a19e96]">
                  তোমার নাম (সর্বোচ্চ ১২ অক্ষর)
                </label>
                <input
                  type="text"
                  maxLength={12}
                  value={config.name}
                  onChange={(e) => onChangeConfig({ ...config, name: e.target.value })}
                  placeholder="যেমন: রাহিম"
                  className="w-full px-3 py-2 rounded-lg bg-[#111214] border border-[#343741] text-[#f3efe6] text-sm font-medium focus:outline-none focus:border-[#e59e24]"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-[#a19e96]">জ্যাকেটের রঙ</span>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 justify-items-center bg-[#111214] p-2.5 rounded-lg border border-[#2e313a]">
                  {COLORS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, color: i })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        config.color === i
                          ? 'border-[#f3efe6] scale-115'
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
                  <span className="text-[11px] font-semibold text-[#a19e96] mr-1">ত্বক</span>
                  {SKINS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeConfig({ ...config, skin: i })}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                        config.skin === i
                          ? 'border-[#f3efe6] scale-115'
                          : 'border-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`ত্বকের রঙ ${i + 1}`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1 bg-[#111214] border border-[#343741] rounded-lg px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ ...config, acc: (config.acc + 7) % 8 })}
                    className="w-7 h-7 rounded-md text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="আগের স্টাইল"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-[#f3efe6] min-w-[68px] text-center truncate">
                    {ACCN[config.acc]}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeConfig({ ...config, acc: (config.acc + 1) % 8 })}
                    className="w-7 h-7 rounded-md text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer"
                    aria-label="পরের স্টাইল"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-[#2e313a] bg-[#15161a] shrink-0">
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-full py-2.5 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm cursor-pointer shadow-[0_3px_0_#9a650b] active:translate-y-[1px] active:shadow-[0_2px_0_#9a650b]"
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
          className="fixed inset-0 z-30 bg-[#0a0b0d]/80 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-[#212329] border-b border-[#343741] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-sm sm:text-base font-bold text-[#f3efe6]">
                <span className="w-1 h-4 rounded-xs bg-[#e59e24] shrink-0" aria-hidden="true" />
                <BookOpen className="w-4 h-4 text-[#e59e24]" />
                <span>খেলার নিয়ম ও কন্ট্রোল</span>
              </div>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-7 h-7 rounded-lg bg-[#2a2d35] hover:bg-[#353944] border border-[#3c404d] text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-5 space-y-3 overflow-y-auto metro-scroll flex-1 min-h-0">
              <div className="space-y-1.5 text-xs text-[#d5d1c8] leading-relaxed">
                <p>
                  <strong className="text-[#3cc280]">যাত্রী:</strong> ৭ কোচের কাজ শেষ করো, সিসিটিভি দেখো এবং চোরকে ভোট দাও।
                </p>
                <p>
                  <strong className="text-[#5da3eb]">পরিদর্শক:</strong> ৩ বার সন্দেহভাজনের টিকেট চেক (Q) করে আসল-নকল যাচাই করো।
                </p>
                <p>
                  <strong className="text-[#e86b5e]">চোর (ফেক টিকেট):</strong> একা পেলে ব্যাগ চুরি (Q), সাবোটাজ (F) ও ভেন্ট (V) ব্যবহার করো।
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-2.5 border-t border-[#2e313a] text-[11px] sm:text-xs text-[#d5d1c8]">
                <div className="flex items-center justify-between bg-[#111214] px-2.5 py-1.5 rounded-lg border border-[#2e313a]">
                  <span>চলাফেরা</span>
                  <kbd className="font-mono-num text-[#e59e24]">WASD</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#111214] px-2.5 py-1.5 rounded-lg border border-[#2e313a]">
                  <span>কাজ / ব্যবহার</span>
                  <kbd className="font-mono-num text-[#e59e24]">E / Space</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#111214] px-2.5 py-1.5 rounded-lg border border-[#2e313a]">
                  <span>চুরি / চেক</span>
                  <kbd className="font-mono-num text-[#e59e24]">Q</kbd>
                </div>
                <div className="flex items-center justify-between bg-[#111214] px-2.5 py-1.5 rounded-lg border border-[#2e313a]">
                  <span>রিপোর্ট / ম্যাপ</span>
                  <kbd className="font-mono-num text-[#e59e24]">R / M</kbd>
                </div>
              </div>
            </div>

            <div className="px-4 py-2.5 sm:px-5 sm:py-3 border-t border-[#2e313a] bg-[#15161a] shrink-0">
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="w-full py-2.5 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm cursor-pointer shadow-[0_3px_0_#9a650b] active:translate-y-[1px] active:shadow-[0_2px_0_#9a650b]"
              >
                বুঝেছি
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Corner PLAY Flow Modal — Tactile Station Dispatch Cards */}
      {overlay === 'play' && !room && (
        <div
          className="fixed inset-0 z-30 bg-[#0a0b0d]/82 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Solid Console Title Header (no AI gradient stripe) */}
            <div className="px-4 py-2.5 sm:px-5 sm:py-3 bg-[#212329] border-b border-[#343741] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {playStep !== 'select' ? (
                  <button
                    type="button"
                    onClick={() => setPlayStep('select')}
                    className="w-7 h-7 rounded-lg bg-[#2a2d35] hover:bg-[#353944] border border-[#3c404d] text-[#f3efe6] flex items-center justify-center cursor-pointer shrink-0"
                    aria-label="পেছনে যাও"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="w-1 h-4 rounded-xs bg-[#e59e24] shrink-0" aria-hidden="true" />
                )}
                <h2 className="text-sm sm:text-base font-bold text-[#f3efe6] truncate">
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
                className="w-7 h-7 rounded-lg bg-[#2a2d35] hover:bg-[#353944] border border-[#3c404d] text-[#d5d1c8] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                aria-label="বন্ধ করো"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-3.5 sm:p-5 overflow-y-auto metro-scroll flex-1 min-h-0">
              {playStep === 'select' && (
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setPlayStep('public')}
                    className="w-full p-3 sm:p-3.5 rounded-lg bg-[#23252b] hover:bg-[#2b2e36] border border-[#343741] border-l-4 border-l-[#2d9f68] text-left flex items-center gap-3 transition-all cursor-pointer shadow-[0_3px_0_#0e0f12] active:translate-y-[1px] active:shadow-[0_2px_0_#0e0f12]"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#16171b] border border-[#30333c] flex items-center justify-center text-[#3cc280] shrink-0">
                      <Globe className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#f3efe6]">মাল্টিপ্লেয়ার</div>
                      <div className="text-[11px] sm:text-xs text-[#a19e96] mt-0.5 truncate">
                        অনলাইনে অটো-ম্যাচ (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#a19e96] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlayStep('private')}
                    className="w-full p-3 sm:p-3.5 rounded-lg bg-[#23252b] hover:bg-[#2b2e36] border border-[#343741] border-l-4 border-l-[#e59e24] text-left flex items-center gap-3 transition-all cursor-pointer shadow-[0_3px_0_#0e0f12] active:translate-y-[1px] active:shadow-[0_2px_0_#0e0f12]"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#16171b] border border-[#30333c] flex items-center justify-center text-[#e59e24] shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#f3efe6]">টিম / প্রাইভেট রুম</div>
                      <div className="text-[11px] sm:text-xs text-[#a19e96] mt-0.5 truncate">
                        রুম কোড দিয়ে বন্ধুদের সাথে খেলো (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#a19e96] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setPlayStep('offline')}
                    className="w-full p-3 sm:p-3.5 rounded-lg bg-[#23252b] hover:bg-[#2b2e36] border border-[#343741] border-l-4 border-l-[#d9483b] text-left flex items-center gap-3 transition-all cursor-pointer shadow-[0_3px_0_#0e0f12] active:translate-y-[1px] active:shadow-[0_2px_0_#0e0f12]"
                  >
                    <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#16171b] border border-[#30333c] flex items-center justify-center text-[#e86b5e] shrink-0">
                      <Bot className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#f3efe6]">বট মোড</div>
                      <div className="text-[11px] sm:text-xs text-[#a19e96] mt-0.5 truncate">
                        অফলাইনে স্মার্ট এআই বটদের সাথে খেলো (৪–{bn(MAX_PLAYERS)} জন)
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#a19e96] shrink-0" />
                  </button>
                </div>
              )}

              {playStep === 'public' && (
                <div className="space-y-3.5">
                  <p className="text-xs text-[#d5d1c8] leading-relaxed">
                    পাবলিক অটো-ম্যাচে ৪ জন হলেই অথবা ২০ সেকেন্ড পর খালি সিটে বট সহ ম্যাচ শুরু হবে (সর্বোচ্চ {bn(MAX_PLAYERS)} জন)।
                  </p>

                  <div className="grid grid-cols-3 divide-x divide-[#2e313a] border-y border-[#2e313a] py-2.5 text-center text-xs bg-[#141519] rounded-lg">
                    <div>
                      <div className="text-[#a19e96]">প্লেয়ার</div>
                      <div className="font-bold text-[#f3efe6] mt-0.5 tabular-nums">৪–{bn(MAX_PLAYERS)} জন</div>
                    </div>
                    <div>
                      <div className="text-[#a19e96]">ম্যাচ</div>
                      <div className="font-bold text-[#f3efe6] mt-0.5 tabular-nums">১৫০ সে.</div>
                    </div>
                    <div>
                      <div className="text-[#a19e96]">মিটিং</div>
                      <div className="font-bold text-[#e59e24] mt-0.5 tabular-nums">{bn(DISCUSS_TIME)} সে.</div>
                    </div>
                  </div>

                  {netError && <div className="text-xs font-semibold text-[#e86b5e]">{netError}</div>}

                  <button
                    type="button"
                    onClick={onQuickplay}
                    className="w-full py-3 rounded-lg bg-[#2d9f68] hover:bg-[#34b376] text-white font-bold text-sm sm:text-base shadow-[0_3px_0_#1a6340] active:translate-y-[1px] active:shadow-[0_2px_0_#1a6340] cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>ম্যাচে প্রবেশ করো</span>
                  </button>
                </div>
              )}

              {playStep === 'private' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-1 bg-[#111214] p-1 rounded-lg border border-[#2e313a]">
                    <button
                      type="button"
                      onClick={() => setPrivateTab('create')}
                      className={`py-1.5 sm:py-2 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                        privateTab === 'create'
                          ? 'bg-[#e59e24] text-[#111214]'
                          : 'text-[#a19e96] hover:text-[#f3efe6]'
                      }`}
                    >
                      রুম তৈরি করো
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrivateTab('join')}
                      className={`py-1.5 sm:py-2 rounded-md text-xs font-bold cursor-pointer whitespace-nowrap ${
                        privateTab === 'join'
                          ? 'bg-[#e59e24] text-[#111214]'
                          : 'text-[#a19e96] hover:text-[#f3efe6]'
                      }`}
                    >
                      কোড দিয়ে ঢোকো
                    </button>
                  </div>

                  {privateTab === 'create' ? (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="block text-[11px] font-semibold text-[#a19e96]">
                          টিমের নাম (ঐচ্ছিক)
                        </label>
                        <input
                          type="text"
                          maxLength={18}
                          value={teamNameInput}
                          onChange={(e) => setTeamNameInput(e.target.value)}
                          placeholder="যেমন: টিম ঢাকা"
                          className="w-full px-3 py-2 rounded-lg bg-[#111214] border border-[#343741] text-[#f3efe6] text-sm font-medium focus:outline-none focus:border-[#e59e24]"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 border-y border-[#2e313a] py-2.5">
                        <span className="text-xs font-semibold text-[#d5d1c8]">
                          কয়জন খেলবে? ({bn(MIN_PLAYERS)}–{bn(MAX_PLAYERS)})
                        </span>
                        <div className="flex items-center gap-1 bg-[#111214] p-1 rounded-lg border border-[#2e313a]">
                          {PLAYER_COUNT_OPTIONS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setPrivateMax(n)}
                              className={`w-7 h-7 rounded text-xs font-bold tabular-nums cursor-pointer ${
                                privateMax === n
                                  ? 'bg-[#e59e24] text-[#111214]'
                                  : 'text-[#d5d1c8] hover:text-white hover:bg-white/5'
                              }`}
                            >
                              {bn(n)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between text-xs text-[#d5d1c8] cursor-pointer py-0.5">
                        <span>খালি সিটে বট বসাও</span>
                        <input
                          type="checkbox"
                          checked={fillBots}
                          onChange={(e) => setFillBots(e.target.checked)}
                          className="w-4 h-4 accent-[#e59e24] cursor-pointer"
                        />
                      </label>

                      {netError && <div className="text-xs font-semibold text-[#e86b5e]">{netError}</div>}

                      <button
                        type="button"
                        onClick={() =>
                          onCreatePrivate(fillBots, Math.min(MAX_PLAYERS, privateMax), teamNameInput)
                        }
                        className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm sm:text-base shadow-[0_3px_0_#9a650b] active:translate-y-[1px] active:shadow-[0_2px_0_#9a650b] cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
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
                        className="w-full px-4 py-2.5 rounded-lg bg-[#111214] border border-[#343741] text-center text-[#f3efe6] font-mono-num font-bold tracking-[0.35em] uppercase text-base sm:text-lg focus:outline-none focus:border-[#e59e24]"
                      />
                      {netError && <div className="text-xs font-semibold text-[#e86b5e]">{netError}</div>}
                      <button
                        type="button"
                        disabled={joinCode.trim().length < 4}
                        onClick={() => onJoinPrivate(joinCode)}
                        className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] disabled:opacity-45 text-[#111214] font-bold text-sm sm:text-base shadow-[0_3px_0_#9a650b] cursor-pointer whitespace-nowrap"
                      >
                        রুমে প্রবেশ করো
                      </button>
                    </div>
                  )}
                </div>
              )}

              {playStep === 'offline' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 border-y border-[#2e313a] py-2.5">
                    <span className="text-xs font-semibold text-[#d5d1c8]">
                      কয়জন খেলবে? ({bn(MIN_PLAYERS)}–{bn(MAX_PLAYERS)})
                    </span>
                    <div className="flex items-center gap-1 bg-[#111214] p-1 rounded-lg border border-[#2e313a]">
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
                              ? 'bg-[#e59e24] text-[#111214]'
                              : 'text-[#d5d1c8] hover:text-white hover:bg-white/5'
                          }`}
                        >
                          {bn(n)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#d5d1c8]">ম্যাচে চোর কয়জন?</span>
                    <div className="flex items-center gap-1 bg-[#111214] p-1 rounded-lg border border-[#2e313a]">
                      <button
                        type="button"
                        onClick={() => onChangeConfig({ ...config, fakers: 1 })}
                        className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer whitespace-nowrap ${
                          config.fakers === 1
                            ? 'bg-[#d9483b] text-white'
                            : 'text-[#a19e96] hover:text-[#f3efe6]'
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
                            ? 'bg-[#d9483b] text-white'
                            : 'text-[#a19e96] hover:text-[#f3efe6]'
                        }`}
                      >
                        ২ জন
                      </button>
                    </div>
                  </div>

                  <div className="text-[11px] text-[#a19e96] text-center">
                    ৩৩% সমান র‍্যান্ডম রোল · মিটিং সময় {bn(DISCUSS_TIME)} সেকেন্ড
                  </div>

                  <button
                    type="button"
                    onClick={onStartOffline}
                    className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm sm:text-base shadow-[0_3px_0_#9a650b] active:translate-y-[1px] active:shadow-[0_2px_0_#9a650b] cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
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
