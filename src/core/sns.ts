import * as v from "valibot";

export const MAX_ID_BYTES = 64;

type SnsDef = {
  readonly label: string;
  readonly hint?: string;
  readonly pattern: RegExp;
  readonly lowercase: boolean;
  /** template only: never put an unvalidated ID here */
  readonly profileUrl: ((id: string) => string) | null;
};

export const SNS = {
  1: {
    label: "X",
    hint: undefined,
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    lowercase: false,
    profileUrl: (id) => `https://x.com/${id}`,
  },
  2: {
    label: "Instagram",
    hint: undefined,
    // no leading/trailing "." and no ".."
    pattern: /^(?!\.)(?!.*\.\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/,
    lowercase: false,
    profileUrl: (id) => `https://www.instagram.com/${id}/`,
  },
  3: {
    label: "Bluesky",
    hint: undefined,
    // 2+ labels of [a-z0-9-] (1-63 chars, no edge "-"), TLD starts with a letter
    pattern:
      /^(?=.{3,64}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    lowercase: true,
    profileUrl: (id) => `https://bsky.app/profile/${id}`,
  },
  4: {
    label: "Discord",
    hint: undefined,
    pattern: /^(?!.*\.\.)[a-z0-9._]{2,32}$/,
    lowercase: false,
    profileUrl: null,
  },
} as const satisfies Record<number, SnsDef>;

export type SnsKind = keyof typeof SNS;
export const SNS_KINDS = Object.keys(SNS).map(Number) as readonly SnsKind[];

export function isSnsKind(n: number): n is SnsKind {
  return Object.hasOwn(SNS, n);
}

const DANGEROUS_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2069],
  [0xfeff, 0xfeff],
];

function hasDangerousChars(s: string): boolean {
  return Array.from(s).some((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return DANGEROUS_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
  });
}

const idSchema = (kind: SnsKind) =>
  v.pipe(
    v.string(),
    v.check((s: string) => !hasDangerousChars(s)),
    v.minBytes(1),
    v.maxBytes(MAX_ID_BYTES),
    v.regex(SNS[kind].pattern),
  );

export function isValidSnsId(kind: SnsKind, id: string): boolean {
  return v.is(idSchema(kind), id);
}

export function normalizeSnsInput(kind: SnsKind, raw: string): string {
  const trimmed = raw.trim().replace(/^@/, "");
  return SNS[kind].lowercase ? trimmed.toLowerCase() : trimmed;
}

export function snsProfileUrl(kind: SnsKind, id: string): string | undefined {
  const make: ((id: string) => string) | null = SNS[kind].profileUrl;
  return make && isValidSnsId(kind, id) ? make(id) : undefined;
}

export function snsDisplay(kind: SnsKind, id: string): string {
  return `${SNS[kind].label} ${kind === 3 ? id : `@${id}`}`;
}
