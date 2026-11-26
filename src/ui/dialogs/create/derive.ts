import type { Material } from "../../../core/material.ts";
import { PALETTES } from "../../../core/palette.ts";
import type { Sticker } from "../../../core/payload.ts";
import {
  exactPaletteMatch,
  hasTransparency,
  quantize,
  quantizeDistinct,
  rankPalettes,
  resizeTo32,
  type PaletteCandidate,
  type Rgba,
} from "../../../core/quantize.ts";
import { isValidSnsId, normalizeSnsInput } from "../../../core/sns.ts";
import type { EditState } from "./create-state.ts";

export type Derived = {
  readonly base: Rgba;
  readonly exact: boolean;
  readonly ranked: readonly PaletteCandidate[];
  readonly paletteId: number;
  readonly imageHasAlpha: boolean;
  readonly transparentIndex: number | null;
  readonly snsId: string;
  readonly snsValid: boolean;
  // the colours the art uses, most used first (foil can only be one of these)
  readonly used: readonly number[];
  readonly sticker: Sticker;
};

function usedColours(pixels: Uint8Array, transparentIndex: number | null): number[] {
  const counts = pixels.reduce((c, p) => {
    if (p !== transparentIndex) c[p] = (c[p] ?? 0) + 1;
    return c;
  }, new Array<number>(16).fill(0));
  return counts
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n > 0)
    .toSorted((a, b) => b.n - a.n)
    .map(({ i }) => i);
}

function materialOf(s: EditState, used: readonly number[]): Material | undefined {
  if (s.material === "matte") return undefined;
  if (s.material !== "foil") return { kind: s.material, tone: 0 };
  const tone = s.foilTone !== null && used.includes(s.foilTone) ? s.foilTone : used[0];
  return tone === undefined ? undefined : { kind: "foil", tone };
}

// The image itself, shrunk to the sticker and measured against every palette: the costly part,
// which depends only on the picture and its crop (not on the choices made after).
export type Analysis = {
  readonly base: Rgba;
  readonly exactMatch: ReturnType<typeof exactPaletteMatch>;
  readonly ranked: readonly PaletteCandidate[];
  readonly imageHasAlpha: boolean;
};

export function analyze(source: EditState["source"], crop: EditState["crop"]): Analysis {
  const { rgba, art } = source;
  const base = art
    ? art.image
    : rgba.width === 32 && rgba.height === 32
      ? rgba
      : resizeTo32(rgba, crop, "area");
  return {
    base,
    exactMatch: exactPaletteMatch(base),
    ranked: rankPalettes(base),
    imageHasAlpha: hasTransparency(base),
  };
}

export function derive(s: EditState, image: Analysis): Derived {
  const { base, exactMatch, ranked, imageHasAlpha } = image;
  const paletteId = s.paletteId ?? exactMatch?.paletteId ?? ranked[0]?.paletteId ?? 0;
  const palette = PALETTES[paletteId] ?? PALETTES[0];
  if (!palette) throw new Error("no palettes");
  const candidate = ranked.find((c) => c.paletteId === paletteId);

  const transparentOn = s.transparentOn ?? imageHasAlpha;
  const transparentIndex = !transparentOn
    ? null
    : s.transparentPick?.paletteId === paletteId
      ? s.transparentPick.index
      : (candidate?.transparentIndex ?? palette.transparentDefault);

  const pixels =
    quantizeDistinct(base, palette, transparentIndex)?.indices ??
    quantize(base, palette, transparentIndex, undefined, s.dither && !s.source.art).indices;

  const snsId = normalizeSnsInput(s.snsKind, s.snsInput);
  const snsValid = isValidSnsId(s.snsKind, snsId);
  const used = usedColours(pixels, transparentIndex);
  const material = materialOf(s, used);
  const sticker: Sticker = {
    paletteId,
    transparentIndex,
    snsKind: s.snsKind,
    snsId,
    pixels,
    ...(material ? { material } : {}),
  };

  return {
    base,
    exact: exactMatch?.paletteId === paletteId,
    ranked,
    paletteId,
    imageHasAlpha,
    transparentIndex,
    snsId,
    snsValid,
    used,
    sticker,
  };
}
