import type { Frame } from "../../core/surface.ts";

// A surface element as it lies on the screen: its centre (the same however it is turned), its
// size before it is turned, and its turn (`data-angle`, degrees).
export function frameOf(el: HTMLElement): Frame {
  const r = el.getBoundingClientRect();
  return {
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
    w: el.offsetWidth,
    h: el.offsetHeight,
    angle: Number(el.dataset.angle ?? 0) || 0,
  };
}
