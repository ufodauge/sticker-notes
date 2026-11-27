import type { Sticker } from "../core/payload.ts";
import {
  NO_SNS,
  isValidSnsId,
  normalizeSnsInput,
  type SnsKind,
  type SnsOrNone,
} from "../core/sns.ts";
import { settings } from "../data/sticker-store.ts";

// The maker's SNS: one setting for all of one's own stickers, put in when a QR is made (the
// stickers themselves are kept naming no one). An empty ID: no SNS. What is typed is kept as it
// is; only a valid ID is put in a QR.

type Listener = () => void;
export type MySns = { readonly kind: SnsKind; readonly input: string };

const state: { value: MySns; listeners: Set<Listener> } = {
  value: { kind: 1, input: "" },
  listeners: new Set(),
};

function publish(next: MySns, save: boolean): void {
  state.value = next;
  state.listeners.forEach((l) => l());
  if (save) void settings.set("sns", { kind: next.kind, id: next.input }).catch(() => {});
}

// the saved one; before there was one setting, the SNS of the last sticker made
void Promise.all([settings.get("sns"), settings.get("lastSns")])
  .then(([saved, last]) => {
    const from = saved ?? last;
    if (from) publish({ kind: from.kind, input: from.id }, false);
  })
  .catch(() => {});

// the SNS a QR carries: none when the ID is empty or not valid for the service
export function snsOf(v: MySns): { readonly kind: SnsOrNone; readonly id: string } {
  const id = normalizeSnsInput(v.kind, v.input);
  return id !== "" && isValidSnsId(v.kind, id) ? { kind: v.kind, id } : { kind: NO_SNS, id: "" };
}

// one's own sticker as its QR carries it
export function withMySns(sticker: Sticker, v: MySns): Sticker {
  const sns = snsOf(v);
  return { ...sticker, snsKind: sns.kind, snsId: sns.id };
}

export const mySns = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): MySns => state.value,
  set: (next: MySns): void => publish(next, true),
};
