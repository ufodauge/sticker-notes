// The room's brightness, where the browser can tell (the Generic Sensor `AmbientLightSensor`:
// behind a flag in Chrome, absent on iOS). Calls back with whether the room is dark, with some
// hysteresis so a reading near the edge does not flicker. Does nothing where unsupported.

type Sensor = EventTarget & { readonly illuminance?: number; start(): void; stop(): void };
type SensorClass = new (options?: { frequency?: number }) => Sensor;

const DARK_LUX = 6;
const LIGHT_LUX = 30;

export function watchAmbientLight(onDark: (dark: boolean) => void, signal: AbortSignal): void {
  const Ctor = (globalThis as { AmbientLightSensor?: SensorClass }).AmbientLightSensor;
  if (!Ctor) return;
  try {
    const sensor = new Ctor({ frequency: 1 });
    const state = { dark: false };
    sensor.addEventListener(
      "reading",
      () => {
        const lux = sensor.illuminance;
        if (lux === undefined) return;
        const dark = state.dark ? lux < LIGHT_LUX : lux < DARK_LUX;
        if (dark === state.dark) return;
        state.dark = dark;
        onDark(dark);
      },
      { signal },
    );
    sensor.addEventListener("error", () => sensor.stop(), { signal });
    signal.addEventListener("abort", () => sensor.stop());
    sensor.start();
  } catch {
    // blocked by permissions policy or the user: the switch still works by hand
  }
}
