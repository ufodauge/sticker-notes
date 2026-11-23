import { siBluesky, siDiscord, siInstagram, siX } from "simple-icons";
import type { SnsKind } from "../core/sns.ts";

const PATHS: Record<SnsKind, string> = {
  1: siX.path,
  2: siInstagram.path,
  3: siBluesky.path,
  4: siDiscord.path,
};

export function SnsIcon({ kind, size }: { readonly kind: SnsKind; readonly size: number }) {
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
