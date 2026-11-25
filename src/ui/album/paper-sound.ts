import { soundPref } from "../jar/jar-prefs.ts";

// Peeling a sticker off its backing paper and pressing it onto the page, synthesized with Web
// Audio. The context starts from the first gesture that needs it and pauses with the page.

type WithWebkit = { webkitAudioContext?: typeof AudioContext };

const state: { ctx: AudioContext | null; noise: AudioBuffer | null } = { ctx: null, noise: null };

function context(): AudioContext | null {
  if (!soundPref.get() || matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const Ctx = window.AudioContext ?? (window as unknown as WithWebkit).webkitAudioContext;
  if (!Ctx) return null;
  if (!state.ctx) {
    const ctx = new Ctx({ latencyHint: "interactive" });
    const noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    data.forEach((_, i) => {
      data[i] = Math.random() * 2 - 1;
    });
    state.ctx = ctx;
    state.noise = noise;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void ctx.suspend().catch(() => {});
    });
  }
  if (state.ctx.state !== "running") void state.ctx.resume().catch(() => {});
  return state.ctx;
}

function burst(
  ctx: AudioContext,
  at: number,
  length: number,
  gain: number,
  filter: BiquadFilterType,
  hz: number,
): void {
  if (!state.noise) return;
  const source = ctx.createBufferSource();
  source.buffer = state.noise;
  const band = ctx.createBiquadFilter();
  band.type = filter;
  band.frequency.value = hz;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(band).connect(env).connect(ctx.destination);
  source.start(at, Math.random() * 0.3);
  source.stop(at + length + 0.02);
}

export const paperSound = {
  // From the gesture that starts a peel, so iOS lets the sound play.
  wake: (): void => {
    context();
  },

  // A dry crackle that speeds up as the sticker comes away.
  peel: (): void => {
    const ctx = context();
    if (!ctx) return;
    const now = ctx.currentTime;
    Array.from({ length: 9 }, (_, i) => i).reduce((at, i) => {
      burst(ctx, at, 0.012 + Math.random() * 0.01, 0.16 + i * 0.012, "highpass", 2400);
      return at + 0.034 * (1 - i / 12) + Math.random() * 0.012;
    }, now);
    burst(ctx, now, 0.26, 0.05, "bandpass", 5200);
  },

  // A soft pat: a low thump with a little paper in it.
  stick: (): void => {
    const ctx = context();
    if (!ctx) return;
    const at = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(170, at);
    osc.frequency.exponentialRampToValueAtTime(80, at + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.35, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
    osc.connect(env).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.13);
    burst(ctx, at, 0.035, 0.12, "lowpass", 1400);
  },
};
