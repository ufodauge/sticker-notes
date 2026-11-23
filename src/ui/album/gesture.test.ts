import { expect, test } from "vite-plus/test";
import { addPointer, begin, point, removePointer, settle, turn } from "./gesture.ts";

const box = { left: 0, top: 0, width: 300, height: 400 };
const start = { x: 0.5, y: 0.5, scale: 2, rotation: 0 };

test("one finger drags in page units", () => {
  const g = settle(point(begin("p", box, start, 1, { x: 100, y: 100 }), 1, { x: 130, y: 60 }), box);
  expect(g.live.x).toBeCloseTo(0.6);
  expect(g.live.y).toBeCloseTo(0.4);
  expect(g.moved).toBe(true);
});

test("tiny movement stays a tap", () => {
  const g = point(begin("p", box, start, 1, { x: 100, y: 100 }), 1, { x: 102, y: 101 });
  expect(g.moved).toBe(false);
});

test("the album scrolling under a still finger moves the sticker along the page", () => {
  const g0 = begin("p", box, start, 1, { x: 100, y: 100 });
  const g1 = settle(g0, { ...box, left: -60 });
  expect(g1.live.x).toBeCloseTo(0.7);
});

test("two fingers pinch and rotate around their centroid", () => {
  const g0 = addPointer(begin("p", box, start, 1, { x: 100, y: 200 }), 2, { x: 200, y: 200 }, box);
  const g1 = point(point(g0, 2, { x: 150, y: 350 }), 1, { x: 150, y: 150 });
  const g2 = settle(g1, box);
  expect(g2.live.scale).toBeCloseTo(4);
  expect(g2.live.rotation).toBeCloseTo(90);
  expect(g2.live.x).toBeCloseTo(0.5);
});

test("lifting a finger rebases instead of jumping", () => {
  const g0 = addPointer(begin("p", box, start, 1, { x: 100, y: 200 }), 2, { x: 200, y: 200 }, box);
  const g1 = removePointer(settle(point(g0, 2, { x: 300, y: 200 }), box), 2, box);
  const before = g1.live;
  expect(settle(point(g1, 1, { x: 100, y: 200 }), box).live).toEqual(before);
});

test("handle: quarter turn and double distance", () => {
  const r = turn(start, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 20 });
  expect(r.rotation).toBeCloseTo(90);
  expect(r.scale).toBeCloseTo(4);
});
