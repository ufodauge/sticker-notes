import { expect, test } from "vite-plus/test";
import { initialState, reducer } from "./app-state.ts";

test("a dialog that finishes closing late leaves the one opened after it alone", () => {
  const first = reducer(initialState, { type: "open", overlay: { kind: "create" } });
  const again = reducer(first, { type: "open", overlay: { kind: "create" } });
  expect(reducer(again, { type: "close", opened: first.opened })).toBe(again);
  expect(reducer(again, { type: "close", opened: again.opened }).overlay).toEqual({
    kind: "none",
  });
});

test("opening an overlay lets go of the selected sticker", () => {
  const selected = reducer(initialState, { type: "select", placementId: "p1" });
  expect(reducer(selected, { type: "open", overlay: { kind: "menu" } }).selected).toBeNull();
});
