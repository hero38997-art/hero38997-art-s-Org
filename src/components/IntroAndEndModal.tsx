import React, { useEffect, useState } from 'react';
import {
  Eye,
  HeartCrack,
  RotateCcw,
  SearchCheck,
  ShieldAlert,
  Ticket,
  TrainFront,
  Trophy,
  User,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { seatLabel } from '../game/mapData';
import { GameWorld, Role } from '../game/types';

function roleMeta(role: Role) {
  if (role === 'faker') {
    return {
      Icon: ShieldAlert,
      title: 'ফেক টিকেটধারক (চোর)',
      color: '#ef5350',
      desc: 'তোমার কাছে ভুয়া টিকেট। একা পাওয়া যাত্রীর ব্যাগ চুরি করো (Q), সাবোটাজ করো (F) এবং এসি ভেন্ট (V) দিয়ে পালিয়ে যাও। কেউ দেখে ফেললে ধরা পড়বে!',
    };
  }
  if (role === 'inspector') {
    return {
      Icon: SearchCheck,
      title: 'টিকেট পরিদর্শক',
      color: '#4da3ff',
      desc: 'কাছের যাত্রীর টিকেট চেক (Q) করে জানতে পারো সে বৈধ না ভুয়া। কাজগুলোও শেষ করো এবং চোরকে ধরিয়ে দাও!',
    };
  }
  return {
    Icon: User,
    title: 'সাধারণ যাত্রী',
    color: '#43c07a',
    desc: '৭টি কোচের সব কাজ শেষ করো, সিসিটিভি ও রাডার ব্যবহার করো, সন্দেহজনক ব্যাগ দেখলে রিপোর্ট করো এবং চোরকে ভোট দাও!',
  };
}

export const IntroModal: React.FC<{ world: GameWorld; onBegin: () => void }> = ({
  world,
  onBegin,
}) => {
  const [revealed, setRevealed] = useState(Boolean(world.isOnline));
  const me = world.me;
  const info = roleMeta(me.role);
  const RoleIcon = info.Icon;
  const allies = world.players.filter((p) => p.role === 'faker' && p !== me);

  useEffect(() => {
    if (!revealed) return;
    const tm = setTimeout(onBegin, world.isOnline ? 3200 : 15000);
    return () => clearTimeout(tm);
  }, [revealed, onBegin, world.isOnline]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-2.5 sm:p-4 bg-[#040812]/88 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#080f20]/96 border border-[#f5b73d]/30 rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex flex-col">
        <div className="h-1 bg-gradient-to-r from-[#1f9d63] via-[#f5b73d] to-[#1f9d63] shrink-0" />

        <div className="p-4 sm:p-6 text-center space-y-3 sm:space-y-4 overflow-y-auto metro-scroll flex-1 min-h-0">
          {!revealed ? (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-[#f5b73d]/85 border-b border-slate-800 pb-2">
                <span>DHAKA METRO PASS</span>
                <span>CONFIDENTIAL</span>
              </div>
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-[#0c162d] border border-[#f5b73d]/35 mx-auto flex items-center justify-center">
                <Ticket className="w-7 h-7 sm:w-9 sm:h-9 text-[#f5b73d]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-white">তোমার গোপন টিকেট</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  স্টেশনে ওঠার সময় তোমার গোপন ভূমিকা নির্ধারিত হয়েছে। অন্য কেউ যেন স্ক্রিন না দেখে।
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.sfx('role');
                  setRevealed(true);
                }}
                className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e] font-bold text-sm sm:text-base cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <Eye className="w-5 h-5" />
                <span>রোল দেখো</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-slate-400 border-b border-slate-800 pb-2">
                <span>BOARDING CLEARANCE</span>
                <span className="text-[#f5b73d] font-semibold">{seatLabel(me.seat)}</span>
              </div>
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl mx-auto flex items-center justify-center border"
                style={{
                  backgroundColor: `${info.color}1c`,
                  borderColor: `${info.color}55`,
                }}
              >
                <RoleIcon className="w-7 h-7 sm:w-9 sm:h-9" style={{ color: info.color }} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold" style={{ color: info.color }}>
                  {info.title}
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{info.desc}</p>
              </div>
              {me.role === 'faker' && allies.length > 0 && (
                <div className="py-2 border-y border-[#ef5350]/30 text-xs sm:text-sm text-[#ef5350] font-semibold">
                  সঙ্গী চোর: {allies.map((a) => a.name).join(', ')}
                </div>
              )}
              <button
                type="button"
                onClick={onBegin}
                className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e] font-bold text-sm sm:text-base cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <TrainFront className="w-5 h-5" />
                <span>ট্রেন ছাড়ুক</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const EndGameModal: React.FC<{
  world: GameWorld;
  canReturnTeamLobby?: boolean;
  isTeamRoom?: boolean;
  onPlayAgain: () => void;
  onReturnTeamLobby?: () => void;
  onBackToMenu: () => void;
}> = ({
  world,
  canReturnTeamLobby = false,
  isTeamRoom = false,
  onPlayAgain,
  onReturnTeamLobby,
  onBackToMenu,
}) => {
  const me = world.me;
  const fakersWon = world.endWinner === 'fakers';
  const iWin = fakersWon === (me.role === 'faker');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-[#040812]/88 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-md max-h-[calc(100dvh-24px)] bg-[#080f20]/96 border border-[#f5b73d]/30 rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex flex-col">
        <div
          className={`h-1 shrink-0 bg-gradient-to-r ${
            fakersWon
              ? 'from-[#ef5350] via-[#f5b73d] to-[#ef5350]'
              : 'from-[#1f9d63] via-[#f5b73d] to-[#1f9d63]'
          }`}
        />

        <div className="p-5 text-center space-y-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-slate-400 border-b border-slate-800 pb-2 shrink-0">
            <span>FINAL ARRIVAL LOG</span>
            <span className={iWin ? 'text-[#43c07a] font-bold' : 'text-[#ef5350] font-bold'}>
              {iWin ? 'VICTORY' : 'DEFEAT'}
            </span>
          </div>

          <div
            className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center border shrink-0 ${
              iWin ? 'bg-[#1f9d63]/15 border-[#43c07a]/45' : 'bg-[#ef5350]/15 border-[#ef5350]/45'
            }`}
          >
            {iWin ? (
              <Trophy className="w-7 h-7 text-[#f5b73d]" />
            ) : (
              <HeartCrack className="w-7 h-7 text-[#ef5350]" />
            )}
          </div>

          <div className="space-y-0.5 shrink-0">
            <h2 className="text-xl font-bold text-white flex items-center justify-center gap-2">
              {fakersWon ? (
                <>
                  <ShieldAlert className="w-5 h-5 text-[#ef5350]" />
                  <span>চোরেরা জিতেছে!</span>
                </>
              ) : (
                <>
                  <TrainFront className="w-5 h-5 text-[#43c07a]" />
                  <span>যাত্রীরা জিতেছে!</span>
                </>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300">{world.endReason}</p>
            <div className={`text-xs sm:text-sm font-bold pt-0.5 ${iWin ? 'text-[#43c07a]' : 'text-[#ef5350]'}`}>
              {iWin ? 'অভিনন্দন! তুমি জিতেছো!' : 'এবার তুমি হেরেছো।'}
            </div>
          </div>

          <div className="border-y border-slate-800 divide-y divide-slate-800/80 text-left overflow-y-auto metro-scroll min-h-0">
            {world.players.map((p) => {
              const rm = roleMeta(p.role);
              const PIcon = rm.Icon;
              return (
                <div key={p.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 font-semibold text-slate-100 truncate">
                    {p.name}
                    {p.isMe ? ' (তুমি)' : ''}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap"
                    style={{ color: rm.color }}
                  >
                    <PIcon className="w-3.5 h-3.5" />
                    <span>{rm.title.split(' (')[0]}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 shrink-0">
            {!world.isOnline && (
              <button
                type="button"
                onClick={onPlayAgain}
                className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e] font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>আবার খেলো</span>
              </button>
            )}

            {world.isOnline && canReturnTeamLobby && onReturnTeamLobby && (
              <button
                type="button"
                onClick={onReturnTeamLobby}
                className="w-full py-3 rounded-xl bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e] font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>একই টিমে আবার খেলো</span>
              </button>
            )}

            {world.isOnline && isTeamRoom && !canReturnTeamLobby && (
              <div className="text-[11px] text-slate-400 pb-0.5">
                টিম লিডার চাইলে সবাইকে একসাথে টিম লবিতে ফেরাতে পারবে…
              </div>
            )}

            <button
              type="button"
              onClick={onBackToMenu}
              className={`w-full py-3 rounded-xl font-bold text-sm cursor-pointer transition-colors ${
                world.isOnline && !canReturnTeamLobby
                  ? 'bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e]'
                  : 'bg-[#101c36] hover:bg-[#18284a] border border-slate-700/80 text-slate-200'
              }`}
            >
              {world.isOnline ? 'লবি মেনুতে যাও' : 'মেনুতে ফিরে যাও'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
