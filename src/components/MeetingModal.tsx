import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Check,
  MapPin,
  MessageSquare,
  Search,
  Send,
  SkipForward,
  Sparkles,
  Vote,
  X,
} from 'lucide-react';
import { COACH_SHORT, bn, coachOf } from '../game/mapData';
import { GameWorld } from '../game/types';

interface MeetingModalProps {
  world: GameWorld;
  onSendChat: (text: string) => void;
  onSuspect?: (targetId: number) => void;
  onCastVote: (targetId: number) => void;
}

export const MeetingModal: React.FC<MeetingModalProps> = ({
  world,
  onSendChat,
  onSuspect,
  onCastVote,
}) => {
  const m = world.m;
  const me = world.me;
  const [draft, setDraft] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [m?.chatLog.length]);

  if (!m) return null;

  const StageIcon =
    m.stage === 'discuss' ? MessageSquare : m.stage === 'vote' ? Vote : BarChart3;
  const stageTitle =
    m.stage === 'discuss' ? 'আলোচনা' : m.stage === 'vote' ? 'ভোট দাও' : 'ভোটের ফলাফল';
  const stageDesc =
    m.stage === 'vote'
      ? 'সন্দেহজনক জনকে ভোট দাও'
      : m.stage === 'discuss'
      ? 'কে কোন কোচে ছিল?'
      : '';

  const cnt: Record<number, number> = {};
  let skipCount = 0;
  Object.values(m.votes).forEach((t) => {
    if (t < 0) skipCount++;
    else cnt[t] = (cnt[t] || 0) + 1;
  });
  const tallyRows = world.players
    .filter((p) => p.alive)
    .map((p) => ({ p, c: cnt[p.id] || 0 }))
    .sort((a, b) => b.c - a.c);
  const maxVotes = tallyRows.length ? tallyRows[0].c : 0;

  const canChat = m.stage !== 'result' && me.alive;
  const canQuick = (m.stage === 'discuss' || (world.isOnline && m.stage === 'vote')) && me.alive;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-1.5 sm:p-4 bg-[#040812]/88 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-4xl h-full max-h-[calc(100dvh-12px)] bg-[#080f20]/96 border border-[#f5b73d]/30 rounded-xl sm:rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.75)] flex flex-col">
        <div className="h-1 bg-gradient-to-r from-[#ef5350] via-[#f5b73d] to-[#1f9d63] shrink-0" />

        {/* Compact Single-Line Header */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <StageIcon className="w-4 h-4 text-[#f5b73d] shrink-0" />
            <span className="text-sm sm:text-base font-bold text-slate-100 whitespace-nowrap">
              {stageTitle}
            </span>
            {stageDesc && (
              <span className="hidden min-[420px]:inline text-xs text-slate-400 truncate">
                · {stageDesc}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 hidden sm:inline">
              TIME LEFT
            </span>
            <span className="text-lg sm:text-xl font-mono-num font-bold text-[#f5b73d] tabular-nums leading-none">
              {bn(Math.max(0, Math.ceil(m.t)))}সে
            </span>
          </div>
        </div>

        {/* Single-Screen Responsive Body: 2-column side-by-side on Landscape/Tablet/Desktop, compact 1-screen stack on Portrait */}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)_auto] min-[520px]:grid-rows-1 min-[520px]:grid-cols-12 overflow-hidden">
          {/* Left Pane: Chat Log + Popover Quick Chat + Input */}
          <div className="min-[520px]:col-span-6 flex flex-col min-h-0 border-b min-[520px]:border-b-0 min-[520px]:border-r border-slate-800 relative">
            <div
              ref={chatRef}
              className="flex-1 min-h-[58px] overflow-y-auto bg-[#050914]/90 px-3 py-2 space-y-1 text-xs sm:text-sm metro-scroll select-text"
            >
              {m.chatLog.map((item) => (
                <div
                  key={item.id}
                  className={item.sys ? 'text-[#f5b73d] font-semibold leading-snug' : 'text-slate-200 leading-snug'}
                >
                  {!item.sys && item.name && (
                    <span className="font-bold mr-1" style={{ color: item.color }}>
                      {item.name}:
                    </span>
                  )}
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Expandable Quick-Chat Drawer (Hidden unless toggled so screen stays clean) */}
            {quickOpen && canQuick && (
              <div className="absolute left-2 right-2 bottom-11 z-20 bg-[#0b152c]/98 border border-[#f5b73d]/45 rounded-xl p-2 shadow-2xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#f5b73d]">
                  <span>দ্রুত বার্তা পাঠাও</span>
                  <button
                    type="button"
                    onClick={() => setQuickOpen(false)}
                    className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                    aria-label="বন্ধ করো"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSendChat(`আমি ${COACH_SHORT[coachOf(me.x)]}-এ ছিলাম।`);
                      setQuickOpen(false);
                    }}
                    className="px-2 py-1 rounded-lg bg-[#101c36] hover:bg-[#17284b] border border-slate-700/70 text-[11px] font-semibold text-slate-100 cursor-pointer flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3 text-[#f5b73d]" />
                    <span>আমি {COACH_SHORT[coachOf(me.x)]}-এ ছিলাম</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSendChat('আমি সন্দেহজনক কিছু দেখিনি।');
                      setQuickOpen(false);
                    }}
                    className="px-2 py-1 rounded-lg bg-[#101c36] hover:bg-[#17284b] border border-slate-700/70 text-[11px] font-semibold text-slate-100 cursor-pointer"
                  >
                    কিছু দেখিনি
                  </button>
                  {world.players.map((p) =>
                    p.alive && p !== me ? (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (onSuspect) onSuspect(p.id);
                          else onSendChat(`${p.name}-কে আমার সন্দেহ হচ্ছে!`);
                          setQuickOpen(false);
                        }}
                        className="px-2 py-1 rounded-lg bg-[#151830] hover:bg-[#1e2447] border border-[#f5b73d]/35 text-[11px] font-semibold text-slate-100 cursor-pointer flex items-center gap-1"
                      >
                        <Search className="w-3 h-3 text-[#f5b73d]" />
                        <span>সন্দেহ: {p.name}</span>
                      </button>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {canChat && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) {
                    onSendChat(draft);
                    setDraft('');
                  }
                }}
                className="p-1.5 sm:p-2 border-t border-slate-800 bg-[#070e1f] flex items-center gap-1.5 shrink-0"
              >
                {canQuick && (
                  <button
                    type="button"
                    onClick={() => setQuickOpen((v) => !v)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                      quickOpen
                        ? 'bg-[#f5b73d] border-[#f5b73d] text-[#060b16]'
                        : 'bg-[#101c36] border-slate-700 text-[#f5b73d] hover:border-[#f5b73d]'
                    }`}
                    title="দ্রুত বার্তা"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">দ্রুত</span>
                  </button>
                )}
                <input
                  type="text"
                  maxLength={80}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="বার্তা লেখো…"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#040812] border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:border-[#f5b73d]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#f5b73d] hover:bg-[#ffc34d] text-[#08101e] font-bold text-xs sm:text-sm cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">পাঠাও</span>
                </button>
              </form>
            )}
          </div>

          {/* Right Pane: Compact 7-Player Vote Grid / Vote Result (Fits 100% without scroll) */}
          <div className="min-[520px]:col-span-6 p-2 sm:p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden bg-[#080f20]">
            {m.stage !== 'result' ? (
              <>
                <div className="grid grid-cols-2 gap-1.5 content-start">
                  {world.players.map((p) => {
                    const votedMe = m.votes[me.id] === p.id;
                    const hasVoted = m.votes[p.id] !== undefined && p.alive;
                    const disabled =
                      m.stage !== 'vote' || !me.alive || !p.alive || m.votes[me.id] !== undefined;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onCastVote(p.id)}
                        className={`relative px-2.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:cursor-default flex items-center gap-2 min-w-0 ${
                          !p.alive ? 'opacity-35' : ''
                        } ${
                          votedMe
                            ? 'border-[#43c07a] bg-[#1f9d63]/20'
                            : p.isMe
                            ? 'border-[#f5b73d]/60 bg-[#101c36]'
                            : 'border-slate-800 bg-[#0d162c] hover:bg-[#142240]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="truncate text-slate-100 flex-1 text-left">{p.name}</span>
                        {hasVoted && (
                          <Check className="w-3.5 h-3.5 text-[#43c07a] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {m.stage === 'vote' && me.alive ? (
                  <button
                    type="button"
                    disabled={m.votes[me.id] !== undefined}
                    onClick={() => onCastVote(-1)}
                    className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer flex items-center justify-center gap-1.5 transition-colors shrink-0 ${
                      m.votes[me.id] === -1
                        ? 'border-[#43c07a] bg-[#1f9d63]/20 text-white'
                        : 'border-slate-700/80 bg-[#0d162c] text-slate-300 hover:text-white hover:bg-[#142240]'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>কাউকে নয় (Skip Vote)</span>
                  </button>
                ) : (
                  <div className="text-[11px] text-slate-400 text-center py-1 shrink-0">
                    {m.stage === 'discuss'
                      ? 'আলোচনা শেষে ভোট শুরু হবে…'
                      : !me.alive
                      ? 'ভূত অবস্থায় ভোট দেওয়া যাবে না'
                      : ''}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col justify-between h-full text-xs space-y-2 min-h-0">
                <div className="flex items-center justify-between shrink-0">
                  <span className="font-bold text-sm text-[#f5b73d]">ভোটের হিসাব</span>
                  {skipCount > 0 && (
                    <span className="text-slate-400 tabular-nums">Skip: {bn(skipCount)} জন</span>
                  )}
                </div>
                <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto metro-scroll pr-0.5">
                  {tallyRows.map((r) => (
                    <div key={r.p.id}>
                      <div className="flex justify-between text-slate-300">
                        <span className="truncate">{r.p.name}</span>
                        <span className="tabular-nums shrink-0">{bn(r.c)} ভোট</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-[#ef5350]"
                          style={{ width: `${(r.c / Math.max(1, maxVotes)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-slate-800 font-bold text-xs sm:text-sm shrink-0">
                  {m.out ? (
                    <span className="text-white">
                      {m.out.name}-কে নামানো হচ্ছে ·{' '}
                      <span className={m.out.role === 'faker' ? 'text-[#43c07a]' : 'text-[#ef5350]'}>
                        {m.out.role === 'faker' ? 'ফেক টিকেটধারক (চোর)' : 'নিরীহ যাত্রী'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[#f5b73d]">ভোট সমান বা Skip বেশি হওয়ায় কেউ নামছে না।</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
