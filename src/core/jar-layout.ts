import { mulberry32 } from "./prng.ts";

export type JarSize = { readonly width: number; readonly height: number };
export type BlockPose = { readonly x: number; readonly y: number; readonly angle: number };

const FILL = 0.7;
const GAP = 0.04;
const SIDE_HYSTERESIS = 1;
export const MIN_SIDE = 16;
export const MAX_SIDE = 88;

// Square blocks that fill about half of the jar when settled.
export function blockSide(count: number, jar: JarSize): number {
  const raw = Math.sqrt((FILL * jar.width * jar.height) / Math.max(1, count));
  return Math.round(Math.min(MAX_SIDE, Math.max(MIN_SIDE, raw)));
}

// Adding or removing one block moves the ideal side by a pixel at most: keep the current side
// then, so the pile is only rescaled when the change is noticeable.
export function fitSide(current: number, count: number, jar: JarSize): number {
  const ideal = blockSide(count, jar);
  return Math.abs(ideal - current) <= SIDE_HYSTERESIS ? current : ideal;
}

function columnsFor(jar: JarSize, side: number): { columns: number; cell: number; margin: number } {
  const cell = side * (1 + GAP);
  const columns = Math.max(1, Math.floor((jar.width - side) / cell));
  return { columns, cell, margin: (jar.width - columns * cell) / 2 };
}

// Deterministic resting pose: rows packed from the floor up with a little jitter
// (used for the static reduced-motion view).
export function initialPile(count: number, jar: JarSize, side: number): BlockPose[] {
  const r = mulberry32(count);
  const gap = side * GAP;
  const { columns, cell, margin } = columnsFor(jar, side);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    return {
      x: margin + cell * (col + 0.5) + (r() - 0.5) * gap * 2,
      y: jar.height - side * 0.5 - cell * row - r() * gap,
      angle: (r() - 0.5) * 0.16,
    };
  });
}

const SPAWN_ROWS = 4;

// Where the n-th block to drop in starts: above the jar rim, cycling over the columns and a few
// rows so blocks spawned in the same frame do not overlap.
export function dropPose(slot: number, jar: JarSize, side: number): BlockPose {
  const { columns, cell, margin } = columnsFor(jar, side);
  const col = slot % columns;
  const row = Math.floor(slot / columns) % SPAWN_ROWS;
  const r = mulberry32(slot + 1);
  return {
    x: margin + cell * (col + 0.5 + (r() - 0.5) * 0.3),
    y: -side * (0.7 + row * 1.15),
    angle: (r() - 0.5) * 0.6,
  };
}

// Keeps a pile when the jar or the block size changes: distances from the floor and from the
// jar's centre line scale with the block, then the pose is clamped inside the new jar.
export function rescalePose(
  pose: BlockPose,
  from: JarSize,
  to: JarSize,
  fromSide: number,
  toSide: number,
): BlockPose {
  const f = toSide / fromSide;
  const half = toSide / 2;
  const x = to.width / 2 + (pose.x - from.width / 2) * f;
  const y = to.height - (from.height - pose.y) * f;
  return {
    x: Math.min(to.width - half, Math.max(half, x)),
    y: Math.min(to.height - half, y),
    angle: pose.angle,
  };
}
