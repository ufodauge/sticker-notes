import { describe, expect, test } from "vite-plus/test";
import { peopleOf } from "./people.ts";
import type { SnsKind } from "./sns.ts";

const held = (
  id: string,
  kind: SnsKind,
  snsId: string,
  receivedAt: string | null,
  origin: "mine" | "received" = "received",
) => ({ id, origin, receivedAt, sticker: { snsKind: kind, snsId } });

describe("people", () => {
  test("stickers from one person count once; one's own stickers are not people", () => {
    const people = peopleOf([
      held("a", 1, "Alice", "2026-11-20"),
      held("b", 1, "alice", "2026-11-18"),
      held("c", 2, "alice", "2026-11-19"),
      held("d", 1, "me", "2026-11-01", "mine"),
    ]);
    expect(people.map((p) => [p.kind, p.id, p.stickerIds, p.first])).toEqual([
      [1, "Alice", ["a", "b"], "2026-11-18"],
      [2, "alice", ["c"], "2026-11-19"],
    ]);
  });

  test("the earliest first; undated people last, in the order they came", () => {
    const people = peopleOf([
      held("a", 1, "late", "2026-11-25"),
      held("b", 1, "undated1", null),
      held("c", 1, "early", "2026-01-02"),
      held("d", 1, "undated2", null),
    ]);
    expect(people.map((p) => p.id)).toEqual(["early", "late", "undated1", "undated2"]);
  });
});
