import type { Fit } from "../../../core/pixelart.ts";
import type { CropRect, Rgba } from "../../../core/quantize.ts";
import type { MaterialKind } from "../../../core/material.ts";

export type Source = {
  readonly file: Blob;
  readonly url: string;
  readonly rgba: Rgba;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly art: Fit | undefined;
};

export type EditState = {
  readonly step: "edit";
  readonly source: Source;
  readonly crop: CropRect;
  readonly paletteId: number | null;
  readonly transparentOn: boolean | null;
  readonly dither: boolean;
  readonly transparentPick: { readonly paletteId: number; readonly index: number } | null;
  readonly material: MaterialKind;
  // the colour that turns to foil; null: the most used colour
  readonly foilTone: number | null;
  readonly saving: boolean;
  readonly failed: boolean;
};

export type CreateState =
  | { readonly step: "pick"; readonly loading: boolean; readonly failed: boolean }
  | EditState;

export type CreateAction =
  | { readonly type: "loading" }
  | { readonly type: "load-failed" }
  | { readonly type: "loaded"; readonly source: Source }
  | { readonly type: "crop-commit"; readonly crop: CropRect }
  | { readonly type: "palette"; readonly paletteId: number }
  | { readonly type: "dither"; readonly on: boolean }
  | { readonly type: "transparent-on"; readonly on: boolean }
  | { readonly type: "transparent-pick"; readonly paletteId: number; readonly index: number }
  | { readonly type: "material"; readonly kind: MaterialKind }
  | { readonly type: "foil-tone"; readonly tone: number }
  | { readonly type: "saving" }
  | { readonly type: "save-failed" }
  | { readonly type: "reset" };

export const INITIAL: CreateState = { step: "pick", loading: false, failed: false };

function defaultCrop(w: number, h: number): CropRect {
  const size = Math.min(w, h);
  return { x: (w - size) / 2, y: (h - size) / 2, size };
}

export function createReducer(state: CreateState, action: CreateAction): CreateState {
  if (action.type === "reset") return INITIAL;
  if (state.step === "pick") {
    switch (action.type) {
      case "loading":
        return { step: "pick", loading: true, failed: false };
      case "load-failed":
        return { step: "pick", loading: false, failed: true };
      case "loaded":
        return {
          step: "edit",
          source: action.source,
          crop: defaultCrop(action.source.rgba.width, action.source.rgba.height),
          paletteId: null,
          transparentOn: null,
          dither: false,
          transparentPick: null,
          material: "matte",
          foilTone: null,
          saving: false,
          failed: false,
        };
      default:
        return state;
    }
  }
  switch (action.type) {
    case "crop-commit":
      return { ...state, crop: action.crop };
    case "palette":
      return { ...state, paletteId: action.paletteId };
    case "dither":
      return { ...state, dither: action.on };
    case "transparent-on":
      return { ...state, transparentOn: action.on };
    case "transparent-pick":
      return {
        ...state,
        transparentOn: true,
        transparentPick: { paletteId: action.paletteId, index: action.index },
      };
    case "material":
      return { ...state, material: action.kind };
    case "foil-tone":
      return { ...state, foilTone: action.tone };
    case "saving":
      return { ...state, saving: true, failed: false };
    case "save-failed":
      return { ...state, saving: false, failed: true };
    default:
      return state;
  }
}
