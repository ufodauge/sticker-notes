import type { Placement } from "../../core/album.ts";
import { DEFAULT_OUTLINE, edgeDepth, outlinePath } from "../../core/render.ts";
import type { StoredSticker } from "../../data/sticker-store.ts";
import type { Box, Pt } from "./gesture.ts";

// Where a sticker on the page can be touched, and where it can be lifted.

// only this close to its outline (in dots of the 36-dot sticker) can a sticker be lifted
// (a fingertip covers more of it than a mouse pointer)
const EDGE_DOTS = { fine: 6, coarse: 9 } as const;
// the touchable shape reaches this many dots beyond the sticker's outline, so an edge is easy to
// catch with a finger
export const GRACE_DOTS = 3;

const depths = new Map<string, ReturnType<typeof edgeDepth>>();
const depthOf = (s: StoredSticker) => {
  const known = depths.get(s.id);
  if (known) return known;
  const d = edgeDepth(s.sticker);
  depths.set(s.id, d);
  return d;
};

// Whether a point on screen lies on the sticker's edge, where a fingernail can get under it.
// `dots`: how wide the paper is in sticker dots (a page's spread is 600).
export function onEdge(
  s: StoredSticker,
  p: Placement,
  box: Box,
  at: Pt,
  pointer: string,
  dots = 600,
): boolean {
  const size = (box.width / dots) * 36 * p.scale;
  const dx = at.x - (box.left + p.x * box.width);
  const dy = at.y - (box.top + p.y * box.height);
  const r = (-p.rotation * Math.PI) / 180;
  const u = (dx * Math.cos(r) - dy * Math.sin(r)) / size + 0.5;
  const v = (dx * Math.sin(r) + dy * Math.cos(r)) / size + 0.5;
  const { size: cells, depth } = depthOf(s);
  const cx = Math.floor(u * cells);
  const cy = Math.floor(v * cells);
  // just outside the outline (where the grace lets a finger land) counts as the edge
  if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) return true;
  const d = depth[cy * cells + cx] ?? 0;
  return d <= (pointer === "mouse" ? EDGE_DOTS.fine : EDGE_DOTS.coarse);
}

// The touchable shape: the outline grown by the grace, as a clip path (empty: the whole box).
export const touchShape = (s: StoredSticker): string =>
  outlinePath(s.sticker, DEFAULT_OUTLINE + GRACE_DOTS);
