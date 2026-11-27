import type { Sticker } from "../core/payload.ts";
import { snsDisplay } from "../core/sns.ts";
import { t } from "./messages.ts";

// What a sticker is called in labels: who it names ("X @id"), or just a sticker.
export const nameOf = (s: Pick<Sticker, "snsKind" | "snsId">): string =>
  snsDisplay(s.snsKind, s.snsId) ?? t.noName;
