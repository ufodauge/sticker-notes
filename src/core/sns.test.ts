import { describe, expect, test } from "vite-plus/test";
import {
  SNS,
  SNS_KINDS,
  isSnsKind,
  isValidSnsId,
  normalizeSnsInput,
  snsDisplay,
  snsProfileUrl,
  type SnsKind,
} from "./sns.ts";

const cases: readonly (readonly [SnsKind, string, boolean])[] = [
  [1, "jack", true],
  [1, "a_b_123", true],
  [1, "x".repeat(15), true],
  [1, "x".repeat(16), false],
  [1, "a.b", false],
  [1, "", false],
  [2, "some.user_01", true],
  [2, "a".repeat(30), true],
  [2, "a".repeat(31), false],
  [2, ".lead", false],
  [2, "trail.", false],
  [2, "dou..ble", false],
  [3, "alice.bsky.social", true],
  [3, "example.com", true],
  [3, "my-name.example.co.jp", true],
  [3, "nodot", false],
  [3, "Upper.bsky.social", false],
  [3, "-bad.bsky.social", false],
  [3, "a.123", false],
  [3, `${"a".repeat(52)}.bsky.social`, true],
  [3, `${"a".repeat(53)}.bsky.social`, false],
  [4, "pixel.trader", true],
  [4, "ab", true],
  [4, "a", false],
  [4, "Upper", false],
  [4, "dou..ble", false],
  [4, "a".repeat(33), false],
];

describe("isValidSnsId", () => {
  test.each(cases)("kind %i %j → %s", (kind, id, ok) => {
    expect(isValidSnsId(kind, id)).toBe(ok);
  });

  test("rejects bidi / zero width everywhere", () => {
    for (const kind of [1, 2, 3, 4] as const) {
      expect(isValidSnsId(kind, "ab‮cd")).toBe(false);
      expect(isValidSnsId(kind, "ab‍cd")).toBe(false);
    }
  });
});

test("normalize", () => {
  expect(normalizeSnsInput(1, " @Jack ")).toBe("Jack");
  expect(normalizeSnsInput(3, "@Alice.BSKY.social")).toBe("alice.bsky.social");
});

test("profile links are built from templates only", () => {
  expect(snsProfileUrl(1, "jack")).toBe("https://x.com/jack");
  expect(snsProfileUrl(2, "a.b")).toBe("https://www.instagram.com/a.b/");
  expect(snsProfileUrl(3, "alice.bsky.social")).toBe("https://bsky.app/profile/alice.bsky.social");
  expect(snsProfileUrl(4, "pixel.trader")).toBeUndefined();
  expect(snsProfileUrl(1, "../evil")).toBeUndefined();
});

describe("Bluesky handle edge cases", () => {
  test.each([
    ["a.bsky.social", true],
    ["a.b", true],
    ["alice.bsky.social_x", false],
    ["x_alice.bsky.social", false],
    ["alice.bsky.social-", false],
  ])("%j → %s", (id, ok) => {
    expect(isValidSnsId(3, id)).toBe(ok);
  });
});

test("only Bluesky input is lowercased", () => {
  expect(normalizeSnsInput(1, "Jack")).toBe("Jack");
  expect(normalizeSnsInput(2, "Some.User")).toBe("Some.User");
  expect(normalizeSnsInput(4, "Pixel.Trader")).toBe("Pixel.Trader");
});

test("table metadata and display strings", () => {
  expect(SNS_KINDS).toEqual([1, 2, 3, 4]);
  expect(SNS_KINDS.map((k) => SNS[k].label)).toEqual(["X", "Instagram", "Bluesky", "Discord"]);
  expect(snsDisplay(1, "jack")).toBe("X @jack");
  expect(snsDisplay(2, "a.b")).toBe("Instagram @a.b");
  expect(snsDisplay(3, "alice.bsky.social")).toBe("Bluesky alice.bsky.social");
  expect(snsDisplay(4, "pixel.trader")).toBe("Discord @pixel.trader");
});

test("kind guard", () => {
  expect([0, 1, 4, 5].map(isSnsKind)).toEqual([false, true, true, false]);
});
