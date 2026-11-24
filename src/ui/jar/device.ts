const REDUCED = "(prefers-reduced-motion: reduce)";

export const reducedMotion = {
  subscribe: (cb: () => void): (() => void) => {
    const mq = matchMedia(REDUCED);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  },
  get: (): boolean => matchMedia(REDUCED).matches,
};

type WithPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

// iOS asks once per page load; remember the answer in memory only.
const tiltPermission = { granted: false };

// Only touch devices tilt; desktop browsers have the constructor but never fire the event.
export const tiltAvailable = (): boolean =>
  "DeviceOrientationEvent" in window && matchMedia("(pointer: coarse)").matches;

// Must be called from a user gesture: iOS shows its permission prompt here.
export async function askTilt(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as unknown as WithPermission;
  if (typeof ctor.requestPermission !== "function" || tiltPermission.granted) return true;
  try {
    tiltPermission.granted = (await ctor.requestPermission()) === "granted";
  } catch {
    tiltPermission.granted = false;
  }
  return tiltPermission.granted;
}

export function webgl2Available(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}
