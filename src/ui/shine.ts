// Where the light falls on shiny stickers: `--shine-x` and `--shine-y` (-1..1) on the root, from
// how the phone is tilted (relative to how it is held) or where the pointer is.

const TILT_RANGE_DEG = 25;
const SETTLE = 0.02;

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export function listenForShine(signal: AbortSignal): void {
  const root = document.documentElement;
  const state = { x: 0, y: 0, frame: 0, rest: null as { beta: number; gamma: number } | null };
  const write = () => {
    state.frame = 0;
    root.style.setProperty("--shine-x", state.x.toFixed(3));
    root.style.setProperty("--shine-y", state.y.toFixed(3));
  };
  const set = (x: number, y: number) => {
    state.x = clamp(x);
    state.y = clamp(y);
    if (!state.frame) state.frame = requestAnimationFrame(write);
  };
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    },
    { passive: true, signal },
  );
  // The way the phone is held drifts slowly into "level", so only turning it moves the light.
  window.addEventListener(
    "deviceorientation",
    (e) => {
      if (e.beta === null || e.gamma === null) return;
      const rest = (state.rest ??= { beta: e.beta, gamma: e.gamma });
      rest.beta += (e.beta - rest.beta) * SETTLE;
      rest.gamma += (e.gamma - rest.gamma) * SETTLE;
      set((e.gamma - rest.gamma) / TILT_RANGE_DEG, (e.beta - rest.beta) / TILT_RANGE_DEG);
    },
    { passive: true, signal },
  );
  signal.addEventListener("abort", () => cancelAnimationFrame(state.frame));
}
