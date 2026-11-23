import { FRAGMENT_PREFIX } from "../core/payload.ts";
import { hashStore } from "./location-hash.ts";
import { receiveFragment, type Received } from "./receive.ts";

export type Report = (r: Received) => void;

export function listenForStickerLinks(report: Report, signal: AbortSignal): void {
  const take = async () => {
    const hash = window.location.hash;
    if (!hash.startsWith(`#${FRAGMENT_PREFIX}`)) return;
    const r = await receiveFragment(hash);
    if (signal.aborted) return;
    hashStore.clear(hash);
    report(r);
  };
  window.addEventListener("hashchange", () => void take(), { signal });
  void take();
}
