import type { RefObject } from "react";
import { sortedPages, type Page } from "../../core/album.ts";
import { stickerStore, type Ready } from "../../data/sticker-store.ts";
import { startCurl, type Curl } from "./curl.ts";
import { paintFace, type FaceArt } from "./page-paint.ts";
import { pagePosition } from "./page-position.ts";
import { paperSound } from "./paper-sound.ts";

// The notebook's paper: which half of which spread lies on each side of each leaf, and turning a
// leaf over (drawn curling on a canvas while it goes).

// a page is taken hold of at its free edge: this outer share of the page (or off the page)
const EDGE_SHARE = 0.25;
// room above and below the page for a corner lifted past its edge
const CURL_MARGIN = 0.18;

// A page of the album is a spread; a side of a leaf carries one half of a spread.
export type Spread =
  | { readonly kind: "page"; readonly page: Page; readonly index: number }
  // after the last page, a blank spread that becomes a page when a sticker is put on it
  | { readonly kind: "new"; readonly index: number }
  | { readonly kind: "empty"; readonly index: number };

export type Side = { readonly spread: Spread; readonly half: 0 | 1 };

// Leaf k carries the right half of spread k on its front and the left half of the next spread
// on its back; the left half of the first spread lies on the inside of the cover.
export type Leaf = { readonly front: Side; readonly back: Side | undefined };

// A leaf on its way over: hidden while its picture curls on the canvas above the book.
export type Turning = {
  readonly leaf: HTMLElement;
  readonly curl: Curl;
  readonly origin: { readonly x: number; readonly y: number };
  // how far out from the spine a point on screen is, on the turning page's side
  readonly outward: (x: number) => number;
  readonly width: number;
};

export function spreadsOf(pages: readonly Page[]): Spread[] {
  return pages.length === 0
    ? [{ kind: "empty", index: 0 }]
    : [
        ...pages.map((page, index) => ({ kind: "page" as const, page, index })),
        { kind: "new", index: pages.length },
      ];
}

export function leavesOf(spreads: readonly Spread[]): Leaf[] {
  return spreads.map((spread, k) => {
    const next = spreads[k + 1];
    return { front: { spread, half: 1 }, back: next ? { spread: next, half: 0 } : undefined };
  });
}

function artOf(side: Side | undefined, snap: Ready): FaceArt {
  if (!side || side.spread.kind !== "page") return { kind: "blank" };
  const id = side.spread.page.id;
  return {
    kind: "page",
    half: side.half,
    placements: snap.placements.filter((p) => p.pageId === id),
    stickers: new Map(snap.stickers.map((st) => [st.id, st.sticker])),
  };
}

export const isWide = (el: HTMLElement) =>
  getComputedStyle(el).getPropertyValue("--wide").trim() === "1";

export type CurlRefs = {
  readonly book: RefObject<HTMLDivElement | null>;
  readonly canvas: RefObject<HTMLCanvasElement | null>;
  readonly busy: RefObject<boolean>;
};

// Lays the leaf's two sides on the canvas and hides the leaf itself. The page is held where the
// finger took it (`at`, on screen); without a finger, near the bottom of its free edge. Undefined
// when there is no leaf to turn, or the finger is not at the page's free edge, where paper can be
// taken hold of.
export function beginCurl(
  refs: CurlRefs,
  direction: -1 | 1,
  at: { readonly x: number; readonly y: number } | undefined,
): Turning | undefined {
  const el = refs.book.current;
  const canvas = refs.canvas.current;
  const current = stickerStore.getSnapshot();
  if (!el || !canvas || current.status !== "ready") return undefined;
  const k = direction > 0 ? pagePosition.get().flipped : pagePosition.get().flipped - 1;
  const leaf = el.querySelector<HTMLElement>(`[data-leaf="${k}"]`);
  const pair = leavesOf(spreadsOf(sortedPages(current.pages)))[k];
  if (!leaf || !pair) return undefined;
  const r = el.getBoundingClientRect();
  const w = r.width / 2;
  const h = r.height;
  const grip = at
    ? { x: (at.x - (r.left + w)) * direction, y: at.y - r.top }
    : { x: w, y: h * 0.72 };
  const offPage = grip.y < 0 || grip.y > h;
  if (at && !offPage && grip.x < w * (1 - EDGE_SHARE)) return undefined;
  const margin = h * CURL_MARGIN;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round((h + margin * 2) * dpr);
  canvas.style.top = `${-margin}px`;
  canvas.style.height = `${h + margin * 2}px`;
  const shown = direction > 0 ? pair.front : pair.back;
  const hidden = direction > 0 ? pair.back : pair.front;
  const curl = startCurl({
    canvas,
    spineX: w,
    top: margin,
    w,
    h,
    outward: direction,
    front: paintFace(artOf(shown, current), w, h, dpr, direction > 0 ? "left" : "right"),
    back: paintFace(artOf(hidden, current), w, h, dpr, direction > 0 ? "right" : "left"),
    grip: {
      x: Math.min(w, Math.max(w * (1 - EDGE_SHARE), grip.x)),
      y: Math.min(h, Math.max(0, grip.y)),
    },
    dpr,
  });
  el.setAttribute("data-flipping", "");
  leaf.setAttribute("data-curling", "");
  canvas.setAttribute("data-on", "");
  refs.busy.current = true;
  return {
    leaf,
    curl,
    origin: { x: r.left, y: r.top - margin },
    outward: (x: number) => (x - (r.left + w)) * direction,
    width: w,
  };
}

// once the book has taken its new place, the real leaf comes back and the picture goes
export function endCurl(refs: CurlRefs, t: Turning): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      t.leaf.removeAttribute("data-curling");
      refs.book.current?.removeAttribute("data-flipping");
      refs.canvas.current?.removeAttribute("data-on");
      refs.busy.current = false;
    }),
  );
}

// a turn asked for without a finger (wheel, page track, a sticker held at the edge)
export function turnShown(refs: CurlRefs, direction: -1 | 1, apply: () => void): boolean {
  if (refs.busy.current) return false;
  const t = beginCurl(refs, direction, undefined);
  if (!t) return false;
  paperSound.flip();
  t.curl.release(true, () => {
    apply();
    endCurl(refs, t);
  });
  return true;
}
