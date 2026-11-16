export type SfxName =
  | 'click'
  | 'step'
  | 'err'
  | 'role'
  | 'task'
  | 'steal'
  | 'check'
  | 'alarm'
  | 'sabotage'
  | 'vent'
  | 'doorlock'
  | 'dooropen'
  | 'scan'
  | 'swipe'
  | 'wire'
  | 'vote'
  | 'chime'
  | 'doorbeep'
  | 'whoosh'
  | 'stun'
  | 'haste'
  | 'win'
  | 'lose';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private rumbleNode: AudioBufferSourceNode | null = null;
  private rumbleGain: GainNode | null = null;
  private clackTimer: number | null = null;
  private lastStepAt = 0;
  public enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem('tm_snd') !== '0';
    } catch {
      this.enabled = true;
    }
  }

  public init(): void {
    if (!this.ctx) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setEnabled(v: boolean, inPlay: boolean): void {
    this.enabled = v;
    try {
      localStorage.setItem('tm_snd', v ? '1' : '0');
    } catch {
      // ignore
    }
    if (v) {
      this.init();
      if (inPlay) this.setRumble(true);
    } else {
      this.setRumble(false);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.11,
    delay = 0,
    slide?: number
  ): void {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol: number, f0: number, f1: number, delay = 0): void {
    if (!this.enabled || !this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const dt = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dt[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(c.destination);
    s.start(t);
  }

  public playFootstep(): void {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastStepAt < 250) return;
    this.lastStepAt = now;
    // Soft muffled metro floor step
    this.noise(0.045, 0.032, 340, 110);
    this.tone(95 + Math.random() * 18, 0.04, 'sine', 0.028, 0, 52);
  }

  public sfx(name: SfxName): void {
    if (!this.enabled || !this.ctx) return;
    switch (name) {
      case 'click':
        this.tone(540, 0.045, 'triangle', 0.04);
        break;
      case 'step':
        this.playFootstep();
        break;
      case 'err':
        this.tone(185, 0.16, 'triangle', 0.085);
        this.tone(138, 0.18, 'sine', 0.08, 0.07);
        break;
      case 'role':
        this.noise(0.4, 0.08, 280, 2200);
        this.tone(440, 0.22, 'triangle', 0.1, 0.24);
        this.tone(554, 0.22, 'triangle', 0.1, 0.38);
        this.tone(659, 0.4, 'triangle', 0.12, 0.52);
        break;
      case 'task':
        this.tone(587, 0.11, 'triangle', 0.1);
        this.tone(880, 0.2, 'triangle', 0.11, 0.08);
        break;
      case 'swipe':
        this.noise(0.12, 0.05, 1600, 700);
        this.tone(1120, 0.08, 'sine', 0.08, 0.08);
        break;
      case 'wire':
        this.noise(0.06, 0.055, 2400, 600);
        this.tone(740, 0.07, 'triangle', 0.06);
        break;
      case 'steal':
        this.tone(210, 0.26, 'sawtooth', 0.1, 0, 58);
        this.noise(0.2, 0.1, 900, 110);
        break;
      case 'check':
        this.tone(820, 0.07, 'sine', 0.085);
        this.tone(1140, 0.1, 'sine', 0.09, 0.07);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) {
          this.tone(780, 0.16, 'triangle', 0.085, i * 0.36);
          this.tone(540, 0.16, 'triangle', 0.08, i * 0.36 + 0.18);
        }
        break;
      case 'sabotage':
        this.tone(410, 0.2, 'sawtooth', 0.075, 0, 260);
        this.tone(410, 0.2, 'sawtooth', 0.075, 0.25, 260);
        break;
      case 'vent':
        this.noise(0.14, 0.085, 1200, 280);
        this.tone(175, 0.12, 'triangle', 0.08, 0, 88);
        break;
      case 'doorlock':
        this.noise(0.22, 0.1, 680, 140);
        this.tone(108, 0.18, 'triangle', 0.09);
        break;
      case 'dooropen':
        this.noise(0.26, 0.06, 1800, 420);
        break;
      case 'scan':
        this.tone(520, 0.3, 'sine', 0.07, 0, 780);
        this.tone(780, 0.3, 'sine', 0.07, 0.32, 520);
        break;
      case 'vote':
        this.tone(480, 0.055, 'triangle', 0.065);
        this.tone(720, 0.075, 'triangle', 0.065, 0.055);
        break;
      case 'chime':
        this.tone(784, 0.28, 'sine', 0.09);
        this.tone(587, 0.42, 'sine', 0.09, 0.24);
        break;
      case 'doorbeep':
        for (let i = 0; i < 3; i++) this.tone(1320, 0.07, 'sine', 0.045, i * 0.14);
        break;
      case 'whoosh':
        this.noise(2.2, 0.14, 220, 2000);
        break;
      case 'stun':
        this.noise(0.18, 0.08, 3200, 480);
        this.tone(680, 0.09, 'sawtooth', 0.075, 0, 210);
        this.tone(420, 0.12, 'sawtooth', 0.06, 0.07, 150);
        break;
      case 'haste':
        this.tone(520, 0.09, 'triangle', 0.065, 0, 780);
        this.tone(780, 0.12, 'sine', 0.07, 0.06, 1040);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, k) => this.tone(f, 0.26, 'triangle', 0.1, k * 0.12));
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((f, k) => this.tone(f, 0.3, 'triangle', 0.1, k * 0.15));
        break;
    }
  }

  public setRumble(on: boolean): void {
    if (!this.ctx) return;
    if (on && this.enabled) {
      if (this.rumbleNode) return;
      const c = this.ctx;
      const len = c.sampleRate * 2;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 120;
      const g = c.createGain();
      g.gain.value = 0.036; // Subtle, balanced train ambient hum
      s.connect(f);
      f.connect(g);
      g.connect(c.destination);
      s.start();
      this.rumbleNode = s;
      this.rumbleGain = g;
      this.clackTimer = window.setInterval(() => {
        this.noise(0.045, 0.024, 900, 180);
      }, 820);
    } else {
      if (this.rumbleNode) {
        try {
          this.rumbleNode.stop();
        } catch {
          // ignore
        }
        this.rumbleNode = null;
        this.rumbleGain = null;
      }
      if (this.clackTimer !== null) {
        window.clearInterval(this.clackTimer);
        this.clackTimer = null;
      }
    }
  }
}

export const soundEngine = new SoundEngine();
