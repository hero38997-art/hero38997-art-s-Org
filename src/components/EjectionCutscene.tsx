import React, { useEffect, useRef } from 'react';
import { soundEngine } from '../game/audio';
import { STATIONS, hash } from '../game/mapData';
import { drawChar, rr } from '../game/renderer';
import { GameWorld } from '../game/types';

interface EjectionCutsceneProps {
  world: GameWorld;
}

function ease(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
}

export const EjectionCutscene: React.FC<EjectionCutsceneProps> = ({ world }) => {
  const cvRef = useRef<HTMLCanvasElement | null>(null);
  const sfxFlags = useRef({ s1: false, s2: false, s3: false, s4: false });

  useEffect(() => {
    sfxFlags.current = { s1: false, s2: false, s3: false, s4: false };
  }, [world.m?.out?.id]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const m = world.m;
      const cv = cvRef.current;
      if (!m || !m.out || !cv) return;
      const c = cv.getContext('2d');
      if (!c) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }

      const el = m.ejectProgress;
      const out = m.out;

      if (el >= 0.3 && !sfxFlags.current.s1) {
        sfxFlags.current.s1 = true;
        soundEngine.sfx('doorbeep');
      }
      if (el >= 3 && !sfxFlags.current.s2) {
        sfxFlags.current.s2 = true;
        soundEngine.sfx('doorbeep');
      }
      if (el >= 3.9 && !sfxFlags.current.s3) {
        sfxFlags.current.s3 = true;
        soundEngine.sfx('whoosh');
      }
      if (el >= 4.6 && !sfxFlags.current.s4) {
        sfxFlags.current.s4 = true;
        soundEngine.sfx(out.role === 'faker' ? 'win' : 'lose');
      }

      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0a1230');
      g.addColorStop(1, '#22335e');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      c.fillStyle = 'rgba(255,255,255,0.65)';
      for (let i = 0; i < 46; i++) {
        c.fillRect(hash(i * 3.1) * W, hash(i * 7.7) * H * 0.35, 1.7, 1.7);
      }

      for (let i = 0; i < 14; i++) {
        const bw = W / 12;
        const bx = i * bw - 14;
        const bh = H * (0.1 + hash(i * 5.3) * 0.2);
        c.fillStyle = '#0f1830';
        c.fillRect(bx, H * 0.66 - bh, bw - 6, bh);
        c.fillStyle = 'rgba(255,213,120,0.48)';
        for (let r = 0; r < bh / 16 - 1; r++) {
          for (let q = 0; q < 4; q++) {
            if (hash(i * 31 + r * 5.7 + q * 2.3) > 0.55) {
              c.fillRect(bx + 8 + q * (bw / 5), H * 0.66 - bh + 10 + r * 16, 5, 7);
            }
          }
        }
      }

      const open =
        el < 0.3
          ? 0
          : el < 1.2
          ? (el - 0.3) / 0.9
          : el < 3
          ? 1
          : el < 3.8
          ? 1 - (el - 3) / 0.8
          : 0;
      const w = ease((el - 1.2) / 1.8);
      const tx = el < 3.9 ? 0 : -Math.pow((el - 3.9) / 2.7, 2) * W * 3.2;
      const top = H * 0.2;
      const bot = H * 0.74;

      const tg = c.createLinearGradient(0, top, 0, bot);
      tg.addColorStop(0, '#e4e9f0');
      tg.addColorStop(1, '#aeb8c6');
      c.fillStyle = tg;
      c.fillRect(-W * 4, top, W * 9, bot - top);
      c.fillStyle = '#4a5468';
      c.fillRect(-W * 4, top - H * 0.03, W * 9, H * 0.03);
      c.fillStyle = '#1f9d63';
      c.fillRect(-W * 4, H * 0.58, W * 9, H * 0.04);
      c.fillStyle = '#39414f';
      c.fillRect(-W * 4, bot - H * 0.03, W * 9, H * 0.03);

      const dx = W / 2 + tx;
      const dw = Math.min(W * 0.3, H * 0.42);
      for (let i = -8; i <= 8; i++) {
        if (i === 0) continue;
        const wx = dx + i * W * 0.38 - W * 0.09;
        c.fillStyle = '#233656';
        rr(c, wx, H * 0.3, W * 0.18, H * 0.18, 8);
        c.fill();
        c.fillStyle = 'rgba(255,236,170,0.25)';
        rr(c, wx + 4, H * 0.3 + 4, W * 0.18 - 8, H * 0.05, 5);
        c.fill();
      }

      const ig = c.createLinearGradient(0, H * 0.24, 0, bot);
      ig.addColorStop(0, '#fff1c4');
      ig.addColorStop(1, '#d9b86a');
      c.fillStyle = ig;
      c.fillRect(dx - dw / 2, H * 0.24, dw, H * 0.47);
      c.fillStyle = 'rgba(60,40,20,0.25)';
      c.fillRect(dx - dw / 2, H * 0.58, dw, H * 0.13);

      const drawEjectee = () => {
        const s = H * (0.0034 + 0.0008 * w);
        const fx = W / 2 + W * 0.12 * w;
        const fy = H * 0.705 + H * 0.165 * w;
        drawChar(c, fx, fy, {
          s,
          color: out.color,
          skin: out.skin,
          acc: out.acc,
          pants: out.pants,
          hair: out.hair,
          face: 1,
          ph: el * 0.9,
          moving: w > 0 && w < 1,
        });
      };

      if (w <= 0) drawEjectee();

      const pw = (dw / 2) * (1 - open * 0.85);
      c.fillStyle = '#c3ccd8';
      c.fillRect(dx - dw / 2, H * 0.24, pw, H * 0.47);
      c.fillRect(dx + dw / 2 - pw, H * 0.24, pw, H * 0.47);
      c.fillStyle = '#26385e';
      c.fillRect(dx - dw / 2 + pw * 0.15, H * 0.29, pw * 0.7, H * 0.17);
      c.fillRect(dx + dw / 2 - pw * 0.85, H * 0.29, pw * 0.7, H * 0.17);
      c.fillStyle = '#8a95a8';
      c.fillRect(dx - dw / 2 - 3, H * 0.24, 3, H * 0.47);
      c.fillRect(dx + dw / 2, H * 0.24, 3, H * 0.47);
      c.fillStyle = open > 0.1 ? '#43c07a' : '#ef5350';
      c.beginPath();
      c.arc(dx, H * 0.215, 5, 0, Math.PI * 2);
      c.fill();

      const pg = c.createLinearGradient(0, bot, 0, H);
      pg.addColorStop(0, '#2f3648');
      pg.addColorStop(1, '#171b27');
      c.fillStyle = pg;
      c.fillRect(0, bot, W, H - bot);
      c.fillStyle = '#f5b73d';
      c.fillRect(0, bot + H * 0.035, W, 5);
      c.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 10; i++) c.fillRect((i * W) / 9, bot, 2, H - bot);

      if (w > 0) drawEjectee();

      // Station sign board
      c.fillStyle = '#555d70';
      c.fillRect(W / 2 - 100, 0, 4, H * 0.04);
      c.fillRect(W / 2 + 96, 0, 4, H * 0.04);
      c.fillStyle = '#0f6b45';
      rr(c, W / 2 - 130, H * 0.04, 260, H * 0.075, 10);
      c.fill();
      c.fillStyle = '#fff';
      c.font = `700 ${Math.round(H * 0.032)}px "Hind Siliguri", sans-serif`;
      c.textAlign = 'center';
      c.fillText(STATIONS[world.stIdx], W / 2, H * 0.04 + H * 0.05);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [world]);

  const m = world.m;
  if (!m || !m.out) return null;
  const el = m.ejectProgress;
  const out = m.out;
  const isFaker = out.role === 'faker';

  return (
    <div className="fixed inset-0 z-40 bg-[#050810]">
      <canvas ref={cvRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute left-0 right-0 bottom-[9%] text-center px-4 text-xl sm:text-2xl font-bold drop-shadow-[0_2px_8px_#000]">
        {el < 4.6 ? (
          <div>{out.name}-কে ট্রেন থেকে নামিয়ে দেওয়া হচ্ছে…</div>
        ) : (
          <div>
            <div>{out.name} ছিল</div>
            <div className={`text-3xl mt-1 ${isFaker ? 'text-[#43c07a]' : 'text-[#ef5350]'}`}>
              {isFaker
                ? 'ফেক টিকেটধারক (চোর)'
                : out.role === 'inspector'
                ? 'টিকেট পরিদর্শক'
                : 'সাধারণ যাত্রী'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
