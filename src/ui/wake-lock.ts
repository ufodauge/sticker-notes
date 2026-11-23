/**
 * Ref callback that keeps the screen on while the element is mounted (React 19 ref cleanup).
 * Module-level, so its identity never changes. Silently ignored where unsupported.
 */
export function holdWakeLock(el: HTMLElement | null): (() => void) | undefined {
  if (!el || !("wakeLock" in navigator)) {
    return undefined;
  }
  const lifetime = new AbortController();
  const held: { sentinel?: WakeLockSentinel } = {};
  const acquire = async () => {
    if (document.visibilityState !== "visible") {
      return;
    }
    const s = await navigator.wakeLock.request("screen").catch(() => undefined);
    if (lifetime.signal.aborted) {
      void s?.release();
    } else {
      held.sentinel = s;
    }
  };
  document.addEventListener("visibilitychange", () => void acquire(), { signal: lifetime.signal });
  void acquire();
  return () => {
    lifetime.abort();
    void held.sentinel?.release();
  };
}
