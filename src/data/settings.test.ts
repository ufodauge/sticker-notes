import * as v from "valibot";
import { expect, test } from "vite-plus/test";
import { SETTINGS } from "./settings.ts";

test("the maker's SNS is a known service and an ID (empty: none)", () => {
  expect(v.safeParse(SETTINGS.sns, { kind: 1, id: "" }).success).toBe(true);
  expect(v.safeParse(SETTINGS.sns, { kind: 9, id: "x" }).success).toBe(false);
});
