import { CYLINDERS, CYCLE, LIMIT_RPM, PULSE_DELAY, type EngineState } from '../engine/model';

/**
 * Exhaust note synthesised from the firing model. Each pulse that reaches the
 * collector triggers a short damped thump; uneven arrivals make the rumble.
 *
 * Uses ScriptProcessorNode, which is deprecated but works everywhere. Moving to
 * an AudioWorklet is tracked in docs/ROADMAP.md.
 */
export class ExhaustSynth {
  private ctx: AudioContext | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;

  constructor(private readonly state: EngineState) {}

  static get supported(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  /** Must be called from a click or key press: browsers block audio otherwise. */
  setRunning(on: boolean): boolean {
    if (!this.ctx && !this.start()) return false;
    const { ctx, gain } = this;
    if (!ctx || !gain) return false;
    if (on) void ctx.resume();
    gain.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, on ? 0.08 : 0.06);
    return true;
  }

  /** Open the filter up as revs rise. Call once per frame. */
  update(): void {
    if (!this.ctx || !this.lowpass || !this.state.running) return;
    this.lowpass.frequency.setTargetAtTime(420 + this.state.rpm * 0.32, this.ctx.currentTime, 0.05);
  }

  private start(): boolean {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;

    const ctx = new AC();
    const sampleRate = ctx.sampleRate;
    const node = ctx.createScriptProcessor(1024, 0, 1);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 500;
    lowpass.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const state = this.state;
    const env = [0, 0, 0, 0];
    const age = [0, 0, 0, 0];
    const freq = [100, 100, 100, 100];
    const amp = [1, 1, 1, 1];
    let phase = 0;
    let rpm = state.rpm;

    node.onaudioprocess = (ev) => {
      const out = ev.outputBuffer.getChannelData(0);
      const delay = PULSE_DELAY[state.mode];
      const unequal = state.mode === 'unequal';
      const throttle = state.throttle ? 1 : 0;

      for (let i = 0; i < out.length; i++) {
        rpm += (state.rpm - rpm) * 0.0008;
        const step = (rpm * 6) / sampleRate; // crank degrees per sample
        phase += step;
        if (phase >= CYCLE) phase -= CYCLE;

        const decay = Math.exp(-1 / (Math.max(0.006, 24 / rpm) * sampleRate));
        let s = 0;

        for (let k = 0; k < 4; k++) {
          const c = CYLINDERS[k]!;
          let since = phase - ((c.fireAt + delay[c.n]) % CYCLE);
          if (since < 0) since += CYCLE;
          if (since < step) {
            // A pulse just arrived. The long pipes sound lower and a touch quieter.
            const longPipe = unequal && c.side > 0;
            env[k] = 1;
            age[k] = 0;
            freq[k] = (longPipe ? 74 : unequal ? 108 : 96) * (1 + rpm / 9000);
            amp[k] = longPipe ? 0.8 : 1;
          }
          if (env[k]! > 0.0005) {
            const t = age[k]!;
            const f = freq[k]!;
            s +=
              env[k]! *
              amp[k]! *
              (Math.sin(6.2832 * f * t) +
                0.45 * Math.sin(6.2832 * f * 2.02 * t) +
                (Math.random() * 2 - 1) * (0.18 + 0.3 * throttle));
            env[k]! *= decay;
            age[k]! += 1 / sampleRate;
          }
        }

        s += (Math.random() * 2 - 1) * 0.03 * (rpm / LIMIT_RPM) * (0.4 + throttle);
        out[i] = Math.tanh(s * (0.75 + 0.5 * throttle));
      }
    };

    node.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);
    this.ctx = ctx;
    this.lowpass = lowpass;
    this.gain = gain;
    return true;
  }
}
