import { describe, expect, test } from "vite-plus/test";
import { JAR3D, cameraPosition, innerProfile, outerProfile, spawnPose } from "./jar3d.ts";

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
