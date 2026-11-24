import {
  JAR_SOUND,
  SURFACE_CLASS,
  dbToGain,
  impactVoice,
  plopVoice,
  rattleTicks,
  voiceAllowed,
  type Surface,
  type Voice,
  type VoiceClass,
} from "../../core/jar-sound.ts";

// The jar's sound, synthesized with Web Audio (no audio files). The context is created lazily,
// from a user gesture (`unlock`), and closed when the jar is left or the page is hidden, so a
// jar nobody is looking at is silent and costs nothing.

type Graph = { readonly ctx: AudioContext; readonly master: GainNode; readonly noise: AudioBuffer };
type WithWebkit = { webkitAudioContext?: typeof AudioContext };

const state = {
  enabled: true,
  graph: null as Graph | null,
  active: 0,
  last: { clack: -1e9, tonk: -1e9, thud: -1e9, plop: -1e9, tick: -1e9 } as Record<
    VoiceClass,
    number
  >,
  watch: null as AbortController | null,
};

const REDUCED = "(prefers-reduced-motion: reduce)";

const contextClass = (): typeof AudioContext | undefined =>
  window.AudioContext ?? (window as unknown as WithWebkit).webkitAudioContext;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.25), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  data.forEach((_, i) => {
    data[i] = Math.random() * 2 - 1;
  });
  return buffer;
}

function buildGraph(Ctx: typeof AudioContext): Graph {
  const ctx = new Ctx({ latencyHint: "interactive" });
  const master = ctx.createGain();
  master.gain.value = dbToGain(JAR_SOUND.masterDb);
  // a gentle limiter: the voices are summed here, and it never lets the sum clip
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 10;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);
  // older iOS only unlocks on a sound started inside the gesture: one silent sample
  const wake = ctx.createBufferSource();
  wake.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  wake.connect(ctx.destination);
  wake.start();
  return { ctx, master, noise: noiseBuffer(ctx) };
}

// The page going to the background silences the jar; coming back wakes it again.
function watchVisibility(graph: Graph) {
  state.watch?.abort();
  const watch = new AbortController();
  state.watch = watch;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") void graph.ctx.suspend().catch(() => {});
      else void graph.ctx.resume().catch(() => {});
    },
    { signal: watch.signal },
  );
}

function play(graph: Graph, voice: Voice, delaySec: number) {
  const { ctx, master, noise } = graph;
  const at = ctx.currentTime + delaySec;
  const end = at + voice.duration;
  const body = ctx.createGain();
  body.gain.setValueAtTime(0, at);
  body.gain.linearRampToValueAtTime(voice.gain / Math.sqrt(voice.freqs.length), at + 0.0015);
  body.gain.exponentialRampToValueAtTime(0.0001, end);
  body.connect(master);
  const oscillators = voice.freqs.map((hz) => {
    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.setValueAtTime(hz, at);
    if (voice.drop !== 1) osc.frequency.exponentialRampToValueAtTime(hz * voice.drop, end);
    osc.connect(body);
    osc.start(at);
    osc.stop(end + 0.02);
    return osc;
  });
  const burstEnd = at + voice.noiseSec;
  const burst = ctx.createGain();
  burst.gain.setValueAtTime(voice.noise * voice.gain, at);
  burst.gain.exponentialRampToValueAtTime(0.0001, burstEnd);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = voice.noiseHz;
  band.Q.value = 0.9;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.connect(band).connect(burst).connect(master);
  source.start(at, Math.random() * 0.15);
  source.stop(burstEnd + 0.01);

  state.active++;
  const last = oscillators.at(-1);
  if (last) {
    last.onended = () => {
      state.active--;
      body.disconnect();
      burst.disconnect();
    };
  }
}

// Plays the voice now if the class's gap and the voice ceiling allow it.
function admit(cls: VoiceClass, now: number): Graph | null {
  const graph = state.graph;
  if (!graph || graph.ctx.state !== "running") return null;
  if (!voiceAllowed(cls, state.last[cls], now, state.active)) return null;
  state.last[cls] = now;
  return graph;
}

export const jarSound = {
  // From a user gesture: creates the context on first use and wakes it if the browser (iOS
  // above all) left it suspended. Does nothing when the sound is off or motion is reduced.
  unlock: (): void => {
    const Ctx = contextClass();
    if (!state.enabled || !Ctx || matchMedia(REDUCED).matches) return;
    const graph = (state.graph ??= buildGraph(Ctx));
    if (!state.watch) watchVisibility(graph);
    if (graph.ctx.state !== "running" && document.visibilityState === "visible") {
      void graph.ctx.resume().catch(() => {});
    }
  },

  // The jar is left (or the sound turned off): stop everything and let the hardware go.
  release: (): void => {
    state.watch?.abort();
    state.watch = null;
    const graph = state.graph;
    state.graph = null;
    state.active = 0;
    if (graph) void graph.ctx.close().catch(() => {});
  },

  setEnabled: (on: boolean): void => {
    state.enabled = on;
    if (!on) jarSound.release();
  },

  // Cheap check before any collision work: is anything audible possible right now?
  listening: (): boolean => state.graph?.ctx.state === "running",

  hit: (surface: Surface, speed: number, side: number): void => {
    const graph = admit(SURFACE_CLASS[surface], performance.now());
    if (!graph) return;
    const voice = impactVoice({ surface, speed, side, jitter: Math.random() });
    if (voice) play(graph, voice, 0);
  },

  plop: (side: number): void => {
    const graph = admit("plop", performance.now());
    if (graph) play(graph, plopVoice(side, Math.random()), 0);
  },

  // One shake pulse: a dense run of quick ticks, as many as the voice ceiling leaves room for.
  rattle: (amp: number): void => {
    const graph = state.graph;
    if (!graph || graph.ctx.state !== "running") return;
    const jitters = Array.from({ length: 24 }, () => Math.random());
    rattleTicks(amp, jitters).forEach((tick) => {
      if (state.active < JAR_SOUND.maxVoices) play(graph, tick.voice, tick.at);
    });
  },
};
