export type ReceiveOutcome = "invalid" | "added" | "duplicate";

export type ReceiveToastInput = {
  readonly outcome: ReceiveOutcome;
  readonly ownCount: number;
  readonly invitationShown: boolean;
};

export type ReceiveToastPlan = {
  readonly invite: boolean;
  readonly persistent: boolean;
};

export function planReceiveToast(input: ReceiveToastInput): ReceiveToastPlan {
  const invite = input.outcome === "added" && input.ownCount === 0;
  return { invite, persistent: invite && !input.invitationShown };
}
