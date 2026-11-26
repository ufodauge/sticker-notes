import { events } from "../data/events.ts";
import { feedback } from "./feedback.ts";

// What the album does in answer to what happens in it (beyond the thing itself): someone new is
// met with a stamp.
export function react(signal: AbortSignal): void {
  const off = events.on((e) => {
    if (e.type === "sticker.received" && e.met !== undefined) feedback.stamp(e.met);
  });
  signal.addEventListener("abort", off, { once: true });
}
