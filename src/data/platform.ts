export type PersistState = "unsupported" | "granted" | "denied";

export async function requestPersist(): Promise<PersistState> {
  if (!navigator.storage?.persist) {
    return "unsupported";
  }
  if (await navigator.storage.persisted()) {
    return "granted";
  }
  return (await navigator.storage.persist()) ? "granted" : "denied";
}

export async function persistState(): Promise<PersistState> {
  if (!navigator.storage?.persisted) return "unsupported";
  return (await navigator.storage.persisted()) ? "granted" : "denied";
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

const RECEIVE_VIBRATION_MS = 20;

export function vibrateReceived(): void {
  if ("vibrate" in navigator) navigator.vibrate(RECEIVE_VIBRATION_MS);
}

export function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function enterFullscreen(el: Element): Promise<void> {
  try {
    await el.requestFullscreen?.({ navigationUI: "hide" });
  } catch {}
}

export function appBaseUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
