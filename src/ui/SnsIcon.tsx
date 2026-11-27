import { siBluesky, siDiscord, siInstagram, siX } from "simple-icons";
import { NO_SNS, type SnsKind, type SnsOrNone } from "../core/sns.ts";

const PATHS: Record<SnsKind, string> = {
  1: siX.path,
  2: siInstagram.path,
  3: siBluesky.path,
  4: siDiscord.path,
};

export function SnsIcon({ kind, size }: { readonly kind: SnsOrNone; readonly size: number }) {
  if (kind === NO_SNS) return null;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
    >
      <path d={PATHS[kind]} />
    </svg>
  );
}

// an SNS as it is shown: its icon and the ID (nothing for no SNS)
export function SnsHandle({
  kind,
  id,
  size,
}: {
  readonly kind: SnsOrNone;
  readonly id: string;
  readonly size: number;
}) {
  if (kind === NO_SNS) return null;
  return (
    <>
      <SnsIcon kind={kind} size={size} /> {kind === 3 ? id : `@${id}`}
    </>
  );
}
