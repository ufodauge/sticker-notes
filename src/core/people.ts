import type { StickerOrigin } from "./backup.ts";
import { NO_SNS, type SnsKind, type SnsOrNone } from "./sns.ts";

type Held = {
  readonly id: string;
  readonly origin: StickerOrigin;
  readonly receivedAt: string | null;
  readonly sticker: { readonly snsKind: SnsOrNone; readonly snsId: string };
};

export type Person = {
  readonly key: string;
  readonly kind: SnsKind;
  readonly id: string;
  readonly stickerIds: readonly string[];
  readonly first: string | null;
};

// Only one's own stickers can be shown as a QR, so a received sticker's SNS is the person who
// gave it. IDs differ only in case on most services, so case does not split a person.
export const personKey = (kind: SnsKind, id: string): string => `${kind}:${id.toLowerCase()}`;

const earlier = (a: string | null, b: string | null) =>
  a === null ? b : b === null || a <= b ? a : b;

// The people stickers came from, the earliest first (undated ones last, in the order received).
export function peopleOf(stickers: readonly Held[]): readonly Person[] {
  const byKey = stickers
    // a sticker that names no one is no one's
    .flatMap((s) => {
      const kind = s.sticker.snsKind;
      return s.origin === "received" && kind !== NO_SNS ? [{ ...s, kind }] : [];
    })
    .reduce((map, s) => {
      const key = personKey(s.kind, s.sticker.snsId);
      const known = map.get(key);
      map.set(key, {
        key,
        kind: s.kind,
        id: known?.id ?? s.sticker.snsId,
        stickerIds: [...(known?.stickerIds ?? []), s.id],
        first: known ? earlier(known.first, s.receivedAt) : s.receivedAt,
      });
      return map;
    }, new Map<string, Person>());
  // a stable sort: people first met on the same day stay in the order they came
  return [...byKey.values()].toSorted((a, b) => {
    if (a.first === b.first) return 0;
    if (a.first === null) return 1;
    if (b.first === null) return -1;
    return a.first < b.first ? -1 : 1;
  });
}
