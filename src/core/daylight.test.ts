import { describe, expect, test } from "vite-plus/test";
import { lightAt, phaseOf, type Light } from "./daylight.ts";

const at = (h: number, m = 0) => h * 60 + m;
const phase = (minutes: number) => phaseOf(lightAt(minutes), minutes);

describe("lightAt", () => {
  test("night: the lamp on, the room dim, no sun", () => {
    const l = lightAt(at(23));
    expect(l.lamp).toBe(1);
    expect(l.sun).toBe(0);
    expect(l.dim).toBeGreaterThan(0.4);
    expect(lightAt(at(3))).toEqual(l);
  });

  test("morning sun comes low from the left; evening sun low from the right, warm", () => {
    const morning = lightAt(at(6, 30));
    expect(morning).toMatchObject({ sun: 1, sunX: -1, lamp: 0 });
    expect(morning.length).toBeGreaterThan(0.8);
    const evening = lightAt(at(17, 30));
    expect(evening).toMatchObject({ sun: 1, sunX: 1, warm: 1, length: 1 });
  });

  test("midday is plain daylight: nothing at all", () => {
    expect(lightAt(at(12))).toEqual({
      sun: 0,
      sunX: 0,
      length: 0,
      warm: 0,
      dim: 0,
      lamp: 0,
    });
  });

  test("the light drifts minute by minute, never jumping, and wraps round midnight", () => {
    const keys: (keyof Light)[] = ["sun", "sunX", "length", "warm", "dim", "lamp"];
    const worst = Array.from({ length: 24 * 60 }, (_, m) => {
      const a = lightAt(m);
      const b = lightAt(m + 1);
      return Math.max(...keys.map((k) => Math.abs(a[k] - b[k])));
    }).reduce((x, y) => Math.max(x, y));
    expect(worst).toBeLessThan(0.025);
    expect(lightAt(-60)).toEqual(lightAt(at(23)));
    expect(lightAt(at(24) + 30)).toEqual(lightAt(30));
  });

  test("every value stays within its range", () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const l = lightAt(m);
      for (const v of [l.sun, l.length, l.warm, l.dim, l.lamp]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(l.sunX)).toBeLessThanOrEqual(1);
    }
  });
});

describe("phaseOf", () => {
  test("names the part of the day", () => {
    expect(phase(at(7))).toBe("morning");
    expect(phase(at(12))).toBe("day");
    expect(phase(at(17, 30))).toBe("evening");
    expect(phase(at(21))).toBe("night");
    expect(phase(at(2))).toBe("night");
  });
});
