import { describe, expect, test } from "vite-plus/test";
import {
  JAR3D,
  cameraPosition,
  downFromBase,
  gravityFromOrientation,
  innerProfile,
  jarCollisionPieces,
  outerProfile,
  outerRadiusAt,
  spawnPose,
} from "./jar3d.ts";

describe("jar profile", () => {
  test("the outer wall rises from the base centre to the lip", () => {
    const outer = outerProfile();
    expect(outer[0]).toEqual([0, 0]);
    expect(outer.at(-1)?.[1]).toBe(JAR3D.height);
    const ys = outer.map(([, y]) => y);
    expect(ys).toEqual(ys.toSorted((a, b) => a - b));
  });

  test("the inner wall stays inside the outer wall and above the base", () => {
    const inner = innerProfile();
    expect(inner.every(([r]) => r <= JAR3D.outerRadius - JAR3D.wall + 1e-9)).toBe(true);
    expect(Math.min(...inner.map(([, y]) => y))).toBeCloseTo(JAR3D.baseThickness);
    expect(Math.max(...inner.map(([r]) => r))).toBeLessThan(JAR3D.outerRadius);
  });

  test("a block fits through the neck", () => {
    expect(Math.hypot(JAR3D.side, JAR3D.side)).toBeLessThan(2 * (JAR3D.neckRadius - JAR3D.wall));
  });
});

describe("camera", () => {
  test("a narrower screen moves the camera back so the jar still fits", () => {
    const wide = cameraPosition(1.6, 0);
    const narrow = cameraPosition(0.5, 0);
    expect(narrow[2]).toBeGreaterThan(wide[2]);
  });

  test("yaw swings the camera around the jar", () => {
    const [x, , z] = cameraPosition(0.6, Math.PI / 2);
    expect(Math.abs(x)).toBeGreaterThan(Math.abs(z));
  });
});

describe("spawn", () => {
  test("new blocks start above the lip and over the neck", () => {
    const pose = spawnPose(0, [0.1, 0.9, 0.5, 0.5]);
    expect(pose.y).toBeGreaterThan(JAR3D.height);
    expect(Math.hypot(pose.x, pose.z)).toBeLessThan(JAR3D.neckRadius);
  });
});

describe("collision pieces", () => {
  test("the wall is a ring of convex pieces and the base is one", () => {
    const pieces = jarCollisionPieces();
    expect(pieces.length).toBeGreaterThan(100);
    expect(pieces.length).toBeLessThan(200);
    expect(pieces.every((p) => p.length % 3 === 0 && p.length >= 12)).toBe(true);
  });

  test("the radius follows the profile and closes at the neck", () => {
    expect(outerRadiusAt(2)).toBeCloseTo(JAR3D.outerRadius);
    expect(outerRadiusAt(JAR3D.height)).toBeCloseTo(JAR3D.neckRadius);
    expect(outerRadiusAt(4.2)).toBeLessThan(JAR3D.outerRadius);
  });
});

describe("gravity from the phone", () => {
  const near = (v: readonly number[], w: readonly number[]) =>
    v.forEach((x, i) => expect(x).toBeCloseTo(w[i] ?? 0, 5));

  test("held upright, things fall to the bottom of the screen", () => {
    near(gravityFromOrientation(90, 0, 0), [0, -1, 0]);
  });

  test("upside down, they fall to the top", () => {
    near(gravityFromOrientation(-90, 0, 0), [0, 1, 0]);
  });

  test("lying face up, they fall away from the viewer", () => {
    near(gravityFromOrientation(0, 0, 0), [0, 0, -1]);
  });

  test("tipped to the right, they slide right", () => {
    const [x, y] = gravityFromOrientation(90, 30, 0);
    expect(y).toBeLessThan(0);
    expect(x).toBeCloseTo(0, 5);
    const [sx] = gravityFromOrientation(60, 30, 0);
    expect(sx).toBeGreaterThan(0);
  });

  test("a landscape screen turns the direction with it", () => {
    near(gravityFromOrientation(0, -90, 90), [0, -1, 0]);
  });
});

describe("tilt relative to the pose at switch-on", () => {
  const near = (v: readonly number[], w: readonly number[]) =>
    v.forEach((x, i) => expect(x).toBeCloseTo(w[i] ?? 0, 5));

  test("the pose at switch-on is upright, whatever it was", () => {
    const flat = gravityFromOrientation(0, 0, 0);
    near(downFromBase(flat, flat), [0, -1, 0]);
    const leaning = gravityFromOrientation(50, 20, 0);
    near(downFromBase(leaning, leaning), [0, -1, 0]);
  });

  test("turning the phone over from there turns gravity over", () => {
    const base = gravityFromOrientation(0, 0, 0);
    near(downFromBase(base, [0, 0, 1]), [0, 1, 0]);
  });

  test("tipping sideways from the start pose tips the jar sideways", () => {
    const base = gravityFromOrientation(90, 0, 0);
    const [x, y] = downFromBase(base, gravityFromOrientation(90, 30, 0));
    expect(Math.abs(x)).toBeLessThan(1e-9);
    expect(y).toBeLessThan(0);
    const [sx] = downFromBase(base, gravityFromOrientation(60, 30, 0));
    expect(sx).toBeGreaterThan(0);
  });

  test("the length of the vector is kept", () => {
    const [x, y, z] = downFromBase([0.6, -0.8, 0], [0, 0, -1]);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
  });
});
