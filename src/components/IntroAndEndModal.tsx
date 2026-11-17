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
    <div className="fixed inset-0 z-30 flex items-center justify-center p-2.5 sm:p-4 bg-[#0a0b0d]/85 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-md max-h-[calc(100dvh-20px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col">
        <div className="p-4 sm:p-6 text-center space-y-3 sm:space-y-4 overflow-y-auto metro-scroll flex-1 min-h-0">
          {!revealed ? (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-[#e59e24] border-b border-[#2e313a] pb-2">
                <span>DHAKA METRO PASS</span>
                <span>CONFIDENTIAL</span>
              </div>
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-[#23252b] border border-[#3c404d] mx-auto flex items-center justify-center">
                <Ticket className="w-7 h-7 sm:w-9 sm:h-9 text-[#e59e24]" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-bold text-[#f3efe6]">তোমার গোপন টিকেট</h2>
                <p className="text-xs sm:text-sm text-[#d5d1c8] leading-relaxed">
                  স্টেশনে ওঠার সময় তোমার গোপন ভূমিকা নির্ধারিত হয়েছে। অন্য কেউ যেন স্ক্রিন না দেখে।
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.sfx('role');
                  setRevealed(true);
                }}
                className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm sm:text-base cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-[0_3px_0_#9a650b]"
              >
                <Eye className="w-5 h-5" />
                <span>রোল দেখো</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-[#a19e96] border-b border-[#2e313a] pb-2">
                <span>BOARDING CLEARANCE</span>
                <span className="text-[#e59e24] font-semibold">{seatLabel(me.seat)}</span>
              </div>
              <div
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl mx-auto flex items-center justify-center border"
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
                <p className="text-xs sm:text-sm text-[#d5d1c8] leading-relaxed">{info.desc}</p>
              </div>
              {me.role === 'faker' && allies.length > 0 && (
                <div className="py-2 border-y border-[#d9483b]/35 text-xs sm:text-sm text-[#e86b5e] font-semibold">
                  সঙ্গী চোর: {allies.map((a) => a.name).join(', ')}
                </div>
              )}
              <button
                type="button"
                onClick={onBegin}
                className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm sm:text-base cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-[0_3px_0_#9a650b]"
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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-[#0a0b0d]/85 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-md max-h-[calc(100dvh-24px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col">
        <div
          className={`h-1.5 shrink-0 ${fakersWon ? 'bg-[#d9483b]' : 'bg-[#2d9f68]'}`}
        />

        <div className="p-5 text-center space-y-3 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between text-[11px] font-mono tracking-wider uppercase text-[#a19e96] border-b border-[#2e313a] pb-2 shrink-0">
            <span>FINAL ARRIVAL LOG</span>
            <span className={iWin ? 'text-[#3cc280] font-bold' : 'text-[#e86b5e] font-bold'}>
              {iWin ? 'VICTORY' : 'DEFEAT'}
            </span>
          </div>

          <div
            className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center border shrink-0 ${
              iWin ? 'bg-[#2d9f68]/15 border-[#3cc280]/45' : 'bg-[#d9483b]/15 border-[#d9483b]/45'
            }`}
          >
            {iWin ? (
              <Trophy className="w-7 h-7 text-[#e59e24]" />
            ) : (
              <HeartCrack className="w-7 h-7 text-[#e86b5e]" />
            )}
          </div>

          <div className="space-y-0.5 shrink-0">
            <h2 className="text-xl font-bold text-[#f3efe6] flex items-center justify-center gap-2">
              {fakersWon ? (
                <>
                  <ShieldAlert className="w-5 h-5 text-[#e86b5e]" />
                  <span>চোরেরা জিতেছে!</span>
                </>
              ) : (
                <>
                  <TrainFront className="w-5 h-5 text-[#3cc280]" />
                  <span>যাত্রীরা জিতেছে!</span>
                </>
              )}
            </h2>
            <p className="text-xs sm:text-sm text-[#d5d1c8]">{world.endReason}</p>
            <div className={`text-xs sm:text-sm font-bold pt-0.5 ${iWin ? 'text-[#3cc280]' : 'text-[#e86b5e]'}`}>
              {iWin ? 'অভিনন্দন! তুমি জিতেছো!' : 'এবার তুমি হেরেছো।'}
            </div>
          </div>

          <div className="border-y border-[#2e313a] divide-y divide-[#282a32] text-left overflow-y-auto metro-scroll min-h-0">
            {world.players.map((p) => {
              const rm = roleMeta(p.role);
              const PIcon = rm.Icon;
              return (
                <div key={p.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 font-semibold text-[#f3efe6] truncate">
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
                className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-[0_3px_0_#9a650b]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>আবার খেলো</span>
              </button>
            )}

            {world.isOnline && canReturnTeamLobby && onReturnTeamLobby && (
              <button
                type="button"
                onClick={onReturnTeamLobby}
                className="w-full py-3 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-[0_3px_0_#9a650b]"
              >
                <RotateCcw className="w-4 h-4" />
                <span>একই টিমে আবার খেলো</span>
              </button>
            )}

            {world.isOnline && isTeamRoom && !canReturnTeamLobby && (
              <div className="text-[11px] text-[#a19e96] pb-0.5">
                টিম লিডার চাইলে সবাইকে একসাথে টিম লবিতে ফেরাতে পারবে…
              </div>
            )}

            <button
              type="button"
              onClick={onBackToMenu}
              className={`w-full py-3 rounded-lg font-bold text-sm cursor-pointer transition-colors ${
                world.isOnline && !canReturnTeamLobby
                  ? 'bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] shadow-[0_3px_0_#9a650b]'
                  : 'bg-[#23252b] hover:bg-[#2d3038] border border-[#363943] text-[#f3efe6]'
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
