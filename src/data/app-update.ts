import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_MS = 30 * 60 * 1000;

export function keepAppUpdated(signal: AbortSignal): void {
  registerSW({
    immediate: true,
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      const check = () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => {});
      };
      check();
      const timer = setInterval(check, UPDATE_CHECK_MS);
      signal.addEventListener("abort", () => clearInterval(timer));
      document.addEventListener("visibilitychange", check, { signal });
    },
  });
}
