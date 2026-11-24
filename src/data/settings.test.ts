import * as v from "valibot";
import { expect, test } from "vite-plus/test";
import { SETTINGS } from "./settings.ts";

test("invitationShown accepts only true", () => {
  expect(v.safeParse(SETTINGS.invitationShown, true).success).toBe(true);
  for (const bad of [false, "true", 1, null, undefined]) {
    expect(v.safeParse(SETTINGS.invitationShown, bad).success).toBe(false);
  }
});
