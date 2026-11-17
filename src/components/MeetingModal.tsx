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
    <div className="fixed inset-0 z-30 flex items-center justify-center p-1.5 sm:p-4 bg-[#0a0b0d]/85 backdrop-blur-sm overflow-hidden">
      <div className="w-full max-w-4xl h-full max-h-[calc(100dvh-12px)] bg-[#1a1b1f] border border-[#343741] rounded-xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col">
        {/* Compact Single-Line Intercom Header */}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-[#212329] border-b border-[#343741] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1 h-4 rounded-xs bg-[#d9483b] shrink-0" aria-hidden="true" />
            <StageIcon className="w-4 h-4 text-[#e59e24] shrink-0" />
            <span className="text-sm sm:text-base font-bold text-[#f3efe6] whitespace-nowrap">
              {stageTitle}
            </span>
            {stageDesc && (
              <span className="hidden min-[420px]:inline text-xs text-[#a19e96] truncate">
                · {stageDesc}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#a19e96] hidden sm:inline">
              TIME LEFT
            </span>
            <span className="text-lg sm:text-xl font-mono-num font-bold text-[#e59e24] tabular-nums leading-none">
              {bn(Math.max(0, Math.ceil(m.t)))}সে
            </span>
          </div>
        </div>

        {/* Single-Screen Responsive Body */}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[minmax(0,1fr)_auto] min-[520px]:grid-rows-1 min-[520px]:grid-cols-12 overflow-hidden">
          {/* Left Pane: Chat Log + Popover Quick Chat + Input */}
          <div className="min-[520px]:col-span-6 flex flex-col min-h-0 border-b min-[520px]:border-b-0 min-[520px]:border-r border-[#2e313a] relative">
            <div
              ref={chatRef}
              className="flex-1 min-h-[58px] overflow-y-auto bg-[#111214] px-3 py-2 space-y-1 text-xs sm:text-sm metro-scroll select-text"
            >
              {m.chatLog.map((item) => (
                <div
                  key={item.id}
                  className={item.sys ? 'text-[#e59e24] font-semibold leading-snug' : 'text-[#f3efe6] leading-snug'}
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

            {/* Expandable Quick-Chat Drawer */}
            {quickOpen && canQuick && (
              <div className="absolute left-2 right-2 bottom-11 z-20 bg-[#1a1b1f] border border-[#3c404d] rounded-lg p-2 shadow-2xl space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#e59e24]">
                  <span>দ্রুত বার্তা পাঠাও</span>
                  <button
                    type="button"
                    onClick={() => setQuickOpen(false)}
                    className="p-0.5 text-[#a19e96] hover:text-white cursor-pointer"
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
                    className="px-2 py-1 rounded-md bg-[#23252b] hover:bg-[#2d3039] border border-[#343741] text-[11px] font-semibold text-[#f3efe6] cursor-pointer flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3 text-[#e59e24]" />
                    <span>আমি {COACH_SHORT[coachOf(me.x)]}-এ ছিলাম</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSendChat('আমি সন্দেহজনক কিছু দেখিনি।');
                      setQuickOpen(false);
                    }}
                    className="px-2 py-1 rounded-md bg-[#23252b] hover:bg-[#2d3039] border border-[#343741] text-[11px] font-semibold text-[#f3efe6] cursor-pointer"
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
                        className="px-2 py-1 rounded-md bg-[#25221d] hover:bg-[#312c24] border border-[#e59e24]/40 text-[11px] font-semibold text-[#f3efe6] cursor-pointer flex items-center gap-1"
                      >
                        <Search className="w-3 h-3 text-[#e59e24]" />
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
                className="p-1.5 sm:p-2 border-t border-[#2e313a] bg-[#16171b] flex items-center gap-1.5 shrink-0"
              >
                {canQuick && (
                  <button
                    type="button"
                    onClick={() => setQuickOpen((v) => !v)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-semibold cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
                      quickOpen
                        ? 'bg-[#e59e24] border-[#e59e24] text-[#111214]'
                        : 'bg-[#23252b] border-[#343741] text-[#e59e24] hover:border-[#e59e24]'
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
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#111214] border border-[#343741] text-xs sm:text-sm text-[#f3efe6] focus:outline-none focus:border-[#e59e24]"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#e59e24] hover:bg-[#f0ae35] text-[#111214] font-bold text-xs sm:text-sm cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">পাঠাও</span>
                </button>
              </form>
            )}
          </div>

          {/* Right Pane: Compact 7-Player Vote Grid / Vote Result */}
          <div className="min-[520px]:col-span-6 p-2 sm:p-3 flex flex-col justify-between gap-2 min-h-0 overflow-hidden bg-[#1a1b1f]">
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
                            ? 'border-[#3cc280] bg-[#2d9f68]/20'
                            : p.isMe
                            ? 'border-[#e59e24]/65 bg-[#25231f]'
                            : 'border-[#2e313a] bg-[#22242a] hover:bg-[#2b2e36]'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="truncate text-[#f3efe6] flex-1 text-left">{p.name}</span>
                        {hasVoted && (
                          <Check className="w-3.5 h-3.5 text-[#3cc280] shrink-0" />
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
                        ? 'border-[#3cc280] bg-[#2d9f68]/20 text-white'
                        : 'border-[#343741] bg-[#22242a] text-[#d5d1c8] hover:text-white hover:bg-[#2b2e36]'
                    }`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>কাউকে নয় (Skip Vote)</span>
                  </button>
                ) : (
                  <div className="text-[11px] text-[#a19e96] text-center py-1 shrink-0">
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
                  <span className="font-bold text-sm text-[#e59e24]">ভোটের হিসাব</span>
                  {skipCount > 0 && (
                    <span className="text-[#a19e96] tabular-nums">Skip: {bn(skipCount)} জন</span>
                  )}
                </div>
                <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto metro-scroll pr-0.5">
                  {tallyRows.map((r) => (
                    <div key={r.p.id}>
                      <div className="flex justify-between text-[#d5d1c8]">
                        <span className="truncate">{r.p.name}</span>
                        <span className="tabular-nums shrink-0">{bn(r.c)} ভোট</span>
                      </div>
                      <div className="h-1.5 bg-[#2a2d35] rounded-full overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-[#d9483b]"
                          style={{ width: `${(r.c / Math.max(1, maxVotes)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-[#2e313a] font-bold text-xs sm:text-sm shrink-0">
                  {m.out ? (
                    <span className="text-[#f3efe6]">
                      {m.out.name}-কে নামানো হচ্ছে ·{' '}
                      <span className={m.out.role === 'faker' ? 'text-[#3cc280]' : 'text-[#e86b5e]'}>
                        {m.out.role === 'faker' ? 'ফেক টিকেটধারক (চোর)' : 'নিরীহ যাত্রী'}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[#e59e24]">ভোট সমান বা Skip বেশি হওয়ায় কেউ নামছে না।</span>
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
