/** Short mechanical ticks. The context stays closed until the first gesture. */

export function createSound(target: EventTarget) {
  let ctx: AudioContext | null = null;

  const unlock = (): void => {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  };
  target.addEventListener('pointerdown', unlock);
  target.addEventListener('keydown', unlock);

  const blip = (freq: number, duration: number, gain: number): void => {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  };

  return {
    /** A foot meets the ground. */
    step(): void {
      blip(140 + Math.random() * 30, 0.045, 0.035);
    },
    /** A bite into something that is still there. */
    bite(): void {
      blip(190, 0.05, 0.04);
      window.setTimeout(() => blip(110, 0.05, 0.03), 45);
    },
    /** Something was taken from the world. */
    take(): void {
      blip(420, 0.06, 0.04);
      window.setTimeout(() => blip(260, 0.07, 0.03), 55);
    },
    dispose(): void {
      target.removeEventListener('pointerdown', unlock);
      target.removeEventListener('keydown', unlock);
      void ctx?.close();
    },
  };
}
