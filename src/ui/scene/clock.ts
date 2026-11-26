import { lightAt, phaseOf, type Light, type Phase } from "../../core/daylight.ts";

// The hour on the device's clock, which alone decides the light on the desk. It moves on by
// itself each minute. Debug builds can set another hour to look at (`debug` only).

export type Daylight = { readonly minutes: number; readonly light: Light; readonly phase: Phase };
type Listener = () => void;

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

const make = (minutes: number): Daylight => {
  const light = lightAt(minutes);
  return { minutes, light, phase: phaseOf(light, minutes) };
};

const state: {
  value: Daylight;
  shifted: number | null;
  listeners: Set<Listener>;
} = { value: make(nowMinutes()), shifted: null, listeners: new Set() };

function publish(): void {
  state.value = make(state.shifted ?? nowMinutes());
  // shiny stickers anywhere (the pocket, dialogs) catch the same light
  const root = document.documentElement.style;
  const { light } = state.value;
  root.setProperty("--light-x", (light.sunX * light.sun).toFixed(3));
  root.setProperty("--glint", Math.max(light.sun, light.lamp * 0.8).toFixed(3));
  root.setProperty("--warm", light.warm.toFixed(3));
  state.listeners.forEach((l) => l());
}

export const daylight = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): Daylight => state.value,
  // debug only: look at another hour (null: the clock again)
  shift: (minutes: number | null): void => {
    state.shifted = minutes;
    publish();
  },
  shifted: (): number | null => state.shifted,
};

export function followClock(signal: AbortSignal): void {
  const timer: { id: ReturnType<typeof setTimeout> | undefined } = { id: undefined };
  const tick = () => {
    publish();
    timer.id = setTimeout(tick, (60 - new Date().getSeconds()) * 1000);
  };
  signal.addEventListener("abort", () => clearTimeout(timer.id), { once: true });
  tick();
}
