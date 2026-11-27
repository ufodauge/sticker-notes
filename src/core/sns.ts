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

// No SNS: a sticker that names no one (kind 0 with an empty ID). One's own stickers are kept this
// way, and get the maker's SNS (one setting for all of them) put in when their QR is made.
export const NO_SNS = 0;
export type SnsOrNone = SnsKind | typeof NO_SNS;

// whether a kind and an ID go together: a known service with a valid ID, or none with none
export function isValidSns(kind: number, id: string): boolean {
  return kind === NO_SNS ? id === "" : isSnsKind(kind) && isValidSnsId(kind, id);
}

export function isSnsKind(n: number): n is SnsKind {
  return Object.hasOwn(SNS, n);
}

// Each service's pattern is plain ASCII, so control, zero-width and direction-changing characters
// never get through (the tests check this for every service).
const idSchema = (kind: SnsKind) =>
  v.pipe(v.string(), v.minBytes(1), v.maxBytes(MAX_ID_BYTES), v.regex(SNS[kind].pattern));

export function isValidSnsId(kind: SnsKind, id: string): boolean {
  return v.is(idSchema(kind), id);
}

export function normalizeSnsInput(kind: SnsKind, raw: string): string {
  const trimmed = raw.trim().replace(/^@/, "");
  return SNS[kind].lowercase ? trimmed.toLowerCase() : trimmed;
}

export function snsProfileUrl(kind: SnsOrNone, id: string): string | undefined {
  if (kind === NO_SNS) return undefined;
  const make: ((id: string) => string) | null = SNS[kind].profileUrl;
  return make && isValidSnsId(kind, id) ? make(id) : undefined;
}

// how an SNS is written ("X @id"); none for no SNS
export function snsDisplay(kind: SnsOrNone, id: string): string | undefined {
  if (kind === NO_SNS) return undefined;
  return `${SNS[kind].label} ${kind === 3 ? id : `@${id}`}`;
}
