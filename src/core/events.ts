// What happens in the album, as one stream: where each thing is done, it says so here, and
// whatever reacts to it (the tutorial, the stamp for someone new, the debug flow view) listens.

export type AppEvent =
  // a sticker taken off a page, the desk or the pocket, into the hand
  | { readonly type: "sticker.peeled"; readonly stickerId: string }
  // a sticker put down on a page or the desk (from the hand or the pocket)
  | { readonly type: "sticker.placed"; readonly stickerId: string }
  // a sticker put back into the pocket
  | { readonly type: "sticker.pocketed"; readonly stickerId: string }
  // a leaf turned over (or back): the spread now open
  | { readonly type: "page.turned"; readonly spread: number }
  // a sticker received by a link; `met` counts the people met when it is the first from someone
  | { readonly type: "sticker.received"; readonly stickerId: string; readonly met?: number }
  // the dialog for making a sticker opened (and put away again), and a sticker made
  | { readonly type: "create.opened" }
  | { readonly type: "create.closed" }
  | { readonly type: "sticker.created"; readonly stickerId: string }
  // one's own QR put away (shown to someone, or not)
  | { readonly type: "qr.closed" }
  // the tutorial's last card put away
  | { readonly type: "tutorial.finish" };

export type EventType = AppEvent["type"];

export const EVENT_TYPES: readonly EventType[] = [
  "sticker.peeled",
  "sticker.placed",
  "sticker.pocketed",
  "page.turned",
  "sticker.received",
  "create.opened",
  "create.closed",
  "sticker.created",
  "qr.closed",
  "tutorial.finish",
];
