import { describe, expect, test } from "vite-plus/test";
import { planReceiveToast, type ReceiveOutcome } from "./receive-toast.ts";

const plan = (outcome: ReceiveOutcome, ownCount: number, invitationShown: boolean) =>
  planReceiveToast({ outcome, ownCount, invitationShown });

describe("planReceiveToast", () => {
  test("the first receive without an own sticker invites and stays", () => {
    expect(plan("added", 0, false)).toEqual({ invite: true, persistent: true });
  });

  test("later receives without an own sticker still invite but fade", () => {
    expect(plan("added", 0, true)).toEqual({ invite: true, persistent: false });
  });

  test("an own sticker removes the invitation", () => {
    expect(plan("added", 1, false)).toEqual({ invite: false, persistent: false });
  });

  test.for(["invalid", "duplicate"] as const)("%s never invites", (outcome) => {
    expect(plan(outcome, 0, false)).toEqual({ invite: false, persistent: false });
  });
});
