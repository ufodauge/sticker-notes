export type JarSize = { readonly width: number; readonly height: number };
export type BlockPose = { readonly x: number; readonly y: number; readonly angle: number };

const FILL = 0.4;
export const MIN_SIDE = 16;
export const MAX_SIDE = 88;

// Square blocks that fill about half of the jar when settled.
export function blockSide(count: number, jar: JarSize): number {
  const raw = Math.sqrt((FILL * jar.width * jar.height) / Math.max(1, count));
  return Math.round(Math.min(MAX_SIDE, Math.max(MIN_SIDE, raw)));
}

function mulberry(seed: number): () => number {
  const state = new Uint32Array([seed]);
  return () => {
    state[0] = (state[0] ?? 0) + 0x6d2b79f5;
    const s = state[0] ?? 0;
    const t1 = Math.imul(s ^ (s >>> 15), s | 1);
    const t2 = (t1 + Math.imul(t1 ^ (t1 >>> 7), t1 | 61)) ^ t1;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic start pose: rows packed from the floor up with a little jitter, `lift` above that.
// With lift = 0 this is already close to the resting pile (used for the static reduced-motion view).
export function initialPile(count: number, jar: JarSize, side: number, lift: number): BlockPose[] {
  const r = mulberry(count);
  const gap = side * 0.04;
  const cell = side + gap;
  const columns = Math.max(1, Math.floor((jar.width - side) / cell));
  const margin = (jar.width - columns * cell) / 2;
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    return {
      x: margin + cell * (col + 0.5) + (r() - 0.5) * gap * 2,
      y: jar.height - side * 0.5 - cell * row - lift - r() * gap,
      angle: (r() - 0.5) * 0.16,
    };
  });
}
