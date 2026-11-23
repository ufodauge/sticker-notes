export type Pt = { readonly x: number; readonly y: number };
export type Live = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
};
export type Box = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type Gesture = {
  readonly placementId: string;
  readonly start: Live;
  readonly base: Live;
  readonly origin: ReadonlyMap<number, Pt>;
  readonly originBox: Box;
  readonly pointers: ReadonlyMap<number, Pt>;
  readonly live: Live;
  readonly moved: boolean;
};

const TAP_SLOP = 6;
const MIN_LIVE_SCALE = 0.6;
const MAX_LIVE_SCALE = 4.4;

export function begin(
  placementId: string,
  box: Box,
  start: Live,
  pointerId: number,
  p: Pt,
): Gesture {
  const pointers = new Map([[pointerId, p]]);
  return {
    placementId,
    start,
    base: start,
    origin: pointers,
    originBox: box,
    pointers,
    live: start,
    moved: false,
  };
}

function rebase(g: Gesture, pointers: ReadonlyMap<number, Pt>, box: Box): Gesture {
  return { ...g, base: g.live, origin: pointers, originBox: box, pointers };
}

export function addPointer(g: Gesture, id: number, p: Pt, box: Box): Gesture {
  if (g.pointers.size >= 2) return g;
  return rebase(g, new Map([...g.pointers, [id, p]]), box);
}

export function removePointer(g: Gesture, id: number, box: Box): Gesture {
  return rebase(g, new Map([...g.pointers].filter(([k]) => k !== id)), box);
}

export function point(g: Gesture, id: number, p: Pt): Gesture {
  if (!g.pointers.has(id)) return g;
  const pointers = new Map(g.pointers);
  pointers.set(id, p);
  const o = g.origin.get(id) ?? p;
  const moved = g.moved || pointers.size > 1 || Math.hypot(p.x - o.x, p.y - o.y) > TAP_SLOP;
  return { ...g, pointers, moved };
}

const centroid = (ps: readonly Pt[]): Pt => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
});

export function settle(g: Gesture, box: Box): Gesture {
  const ids = [...g.pointers.keys()];
  const now = ids.flatMap((k) => {
    const p = g.pointers.get(k);
    return p ? [p] : [];
  });
  const then = ids.flatMap((k) => {
    const p = g.origin.get(k) ?? g.pointers.get(k);
    return p ? [p] : [];
  });
  if (now.length === 0) return g;
  const c1 = centroid(now);
  const c0 = centroid(then);
  const pinch = (() => {
    const [a0, b0] = then;
    const [a1, b1] = now;
    if (!a0 || !b0 || !a1 || !b1) return { ratio: 1, angle: 0 };
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    const angle =
      (Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) *
      (180 / Math.PI);
    return { ratio: d0 > 0 ? d1 / d0 : 1, angle };
  })();
  const dx = c1.x - box.left - (c0.x - g.originBox.left);
  const dy = c1.y - box.top - (c0.y - g.originBox.top);
  return {
    ...g,
    live: {
      x: g.base.x + dx / box.width,
      y: g.base.y + dy / box.height,
      scale: Math.min(MAX_LIVE_SCALE, Math.max(MIN_LIVE_SCALE, g.base.scale * pinch.ratio)),
      rotation: g.base.rotation + pinch.angle,
    },
  };
}

export function turn(start: Live, center: Pt, from: Pt, to: Pt): Live {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x);
  const a1 = Math.atan2(to.y - center.y, to.x - center.x);
  const d0 = Math.hypot(from.x - center.x, from.y - center.y);
  const d1 = Math.hypot(to.x - center.x, to.y - center.y);
  return {
    ...start,
    rotation: start.rotation + ((a1 - a0) * 180) / Math.PI,
    scale: Math.min(
      MAX_LIVE_SCALE,
      Math.max(MIN_LIVE_SCALE, d0 > 0 ? (start.scale * d1) / d0 : start.scale),
    ),
  };
}
