import { describe, expect, test } from "vite-plus/test";
import { assignMinCost } from "./assign.ts";
import { rng } from "./testing/fixtures.ts";

function bruteForce(cost: readonly (readonly number[])[]): number {
  const m = cost[0]?.length ?? 0;
  const go = (row: number, taken: ReadonlySet<number>): number => {
    if (row === cost.length) return 0;
    return Array.from({ length: m }, (_, j) => j)
      .filter((j) => !taken.has(j))
      .reduce(
        (best, j) => Math.min(best, (cost[row]?.[j] ?? 0) + go(row + 1, new Set([...taken, j]))),
        Number.POSITIVE_INFINITY,
      );
  };
  return go(0, new Set());
}

const totalOf = (cost: readonly (readonly number[])[], match: readonly number[]) =>
  match.reduce((sum, col, row) => sum + (cost[row]?.[col] ?? 0), 0);

describe("assignMinCost", () => {
  test("no rows → empty assignment", () => {
    expect(assignMinCost([])).toEqual([]);
  });

  test("more rows than columns is a programming error", () => {
    expect(() => assignMinCost([[1], [2]])).toThrow("more rows than columns");
  });

  test("a single row picks its cheapest column", () => {
    expect(assignMinCost([[5, 3, 4]])).toEqual([1]);
    expect(assignMinCost([[0, 3, 4]])).toEqual([0]);
    expect(assignMinCost([[5, 3, 1]])).toEqual([2]);
  });

  test("known optimum", () => {
    expect(
      assignMinCost([
        [4, 1, 3],
        [2, 0, 5],
        [3, 2, 2],
      ]),
    ).toEqual([1, 0, 2]);
  });

  test("rows compete for the same cheap column: the optimum is global, not greedy", () => {
    expect(
      assignMinCost([
        [1, 2],
        [1, 100],
      ]),
    ).toEqual([1, 0]);
  });

  test("random matrices match an exhaustive search and use distinct columns", () => {
    const r = rng(11);
    for (let t = 0; t < 200; t++) {
      const m = 1 + Math.floor(r() * 5);
      const n = 1 + Math.floor(r() * m);
      const cost = Array.from({ length: n }, () =>
        Array.from({ length: m }, () => Math.floor(r() * 20)),
      );
      const match = assignMinCost(cost);
      expect(match).toHaveLength(n);
      expect(new Set(match).size).toBe(n);
      expect(match.every((c) => c >= 0 && c < m)).toBe(true);
      expect(totalOf(cost, match)).toBe(bruteForce(cost));
    }
  });

  test("fractional and negative costs", () => {
    const r = rng(5);
    for (let t = 0; t < 100; t++) {
      const n = 1 + Math.floor(r() * 4);
      const m = n + Math.floor(r() * 2);
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => r() * 10 - 5));
      expect(totalOf(cost, assignMinCost(cost))).toBeCloseTo(bruteForce(cost), 9);
    }
  });
});
