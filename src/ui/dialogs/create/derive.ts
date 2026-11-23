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
  readonly sticker: Sticker;
};

function baseImage(s: EditState): Rgba {
  const { rgba, art } = s.source;
  if (art) return art.image;
  if (rgba.width === 32 && rgba.height === 32) return rgba;
  return resizeTo32(rgba, s.crop, "area");
}

export function derive(s: EditState): Derived {
  const base = baseImage(s);
  const exactMatch = exactPaletteMatch(base);
  const ranked = rankPalettes(base);
  const paletteId = s.paletteId ?? exactMatch?.paletteId ?? ranked[0]?.paletteId ?? 0;
  const palette = PALETTES[paletteId] ?? PALETTES[0];
  if (!palette) throw new Error("no palettes");
  const candidate = ranked.find((c) => c.paletteId === paletteId);

  const imageHasAlpha = hasTransparency(base);
  const transparentOn = s.transparentOn ?? imageHasAlpha;
  const transparentIndex = !transparentOn
    ? null
    : s.transparentPick?.paletteId === paletteId
      ? s.transparentPick.index
      : (candidate?.transparentIndex ?? palette.transparentDefault);

  const pixels =
    quantizeDistinct(base, palette, transparentIndex)?.indices ??
    quantize(base, palette, transparentIndex).indices;

  const snsId = normalizeSnsInput(s.snsKind, s.snsInput);
  const snsValid = isValidSnsId(s.snsKind, snsId);
  const sticker: Sticker = { paletteId, transparentIndex, snsKind: s.snsKind, snsId, pixels };

  return {
    base,
    exact: exactMatch?.paletteId === paletteId,
    ranked,
    paletteId,
    imageHasAlpha,
    transparentIndex,
    snsId,
    snsValid,
    sticker,
  };
}
