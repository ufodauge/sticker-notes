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

// Only touch devices tilt; desktop browsers have the constructor but never fire the event.
export const tiltAvailable = (): boolean =>
  "DeviceOrientationEvent" in window && matchMedia("(pointer: coarse)").matches;

// Must be called from a user gesture: iOS shows its permission prompt here.
export async function askTilt(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as unknown as WithPermission;
  if (typeof ctor.requestPermission !== "function") return true;
  try {
    return (await ctor.requestPermission()) === "granted";
  } catch {
    return false;
  }
}
