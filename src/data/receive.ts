import { decodeFragment, stickerIdOf, type Sticker } from "../core/payload.ts";
import { stickerStore } from "./sticker-store.ts";

export type Received =
  | { readonly kind: "invalid" }
  | { readonly kind: "added" | "duplicate"; readonly stickerId: string; readonly sticker: Sticker };

const inflight = new Map<string, Promise<Received>>();

export function receiveFragment(fragment: string): Promise<Received> {
  const running = inflight.get(fragment);
  if (running) {
    return running;
  }

  const p = (async (): Promise<Received> => {
    const decoded = decodeFragment(fragment);
    if (!decoded.ok) {
      return { kind: "invalid" };
    }

    const stickerId = await stickerIdOf(decoded.body);
    const r = await stickerStore.add(stickerId, decoded.body, "received");
    return {
      kind: r.kind,
      stickerId,
      sticker: decoded.sticker,
    };
  })();
  inflight.set(fragment, p);
  void p.finally(() => setTimeout(() => inflight.delete(fragment), 1000));
  return p;
}
