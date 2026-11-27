import { expect, test } from "vite-plus/test";
import { teaseGrip } from "./tease-grip.ts";

const art = (size: number, opaque: (x: number, y: number) => boolean) =>
  Array.from({ length: size * size }, (_, i) => (opaque(i % size, Math.floor(i / size)) ? 255 : 0));

test("a disc lifts at its lower right, just inside the outline", () => {
  const n = 20;
  const g = teaseGrip(
    art(n, (x, y) => Math.hypot(x - 9.5, y - 9.5) <= 6),
    n,
  );
  expect(g.x).toBeGreaterThan(11);
  expect(g.y).toBeGreaterThan(11);
  expect(Math.hypot(g.x - 9.5, g.y - 9.5)).toBeLessThan(6);
});

test("a shape off to one side lifts at its own corner, not on empty art", () => {
  const n = 20;
  const g = teaseGrip(
    art(n, (x, y) => x < 6 && y < 6),
    n,
  );
  expect(g.x).toBeGreaterThan(4);
  expect(g.x).toBeLessThan(6);
  expect(g.y).toBeGreaterThan(4);
  expect(g.y).toBeLessThan(6);
});

test("empty art: the middle", () => {
  expect(teaseGrip(new Array(16).fill(0), 4)).toEqual({ x: 1.5, y: 1.5 });
});
