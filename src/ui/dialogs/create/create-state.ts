import type { Fit } from "../../../core/pixelart.ts";
import type { CropRect, Rgba } from "../../../core/quantize.ts";
import type { SnsKind } from "../../../core/sns.ts";

type Point = { readonly x: number; readonly y: number };

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
  readonly cropPos: Point;
  readonly zoom: number;
  readonly crop: CropRect;
  readonly paletteId: number | null;
  readonly transparentOn: boolean | null;
  readonly dither: boolean;
  readonly transparentPick: { readonly paletteId: number; readonly index: number } | null;
  readonly snsKind: SnsKind;
  readonly snsInput: string;
  readonly snsTouched: boolean;
  readonly saving: boolean;
  readonly failed: boolean;
};

export type CreateState =
  | { readonly step: "pick"; readonly loading: boolean; readonly failed: boolean }
  | EditState;

export type CreateAction =
  | { readonly type: "loading" }
  | { readonly type: "load-failed" }
  | {
      readonly type: "loaded";
      readonly source: Source;
      readonly sns: { readonly kind: SnsKind; readonly id: string } | null;
    }
  | { readonly type: "crop-move"; readonly pos: Point }
  | { readonly type: "zoom"; readonly zoom: number }
  | { readonly type: "crop-commit"; readonly crop: CropRect }
  | { readonly type: "palette"; readonly paletteId: number }
  | { readonly type: "dither"; readonly on: boolean }
  | { readonly type: "transparent-on"; readonly on: boolean }
  | { readonly type: "transparent-pick"; readonly paletteId: number; readonly index: number }
  | { readonly type: "sns-kind"; readonly kind: SnsKind }
  | { readonly type: "sns-input"; readonly value: string }
  | { readonly type: "sns-blur" }
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
          cropPos: { x: 0, y: 0 },
          zoom: 1,
          crop: defaultCrop(action.source.rgba.width, action.source.rgba.height),
          paletteId: null,
          transparentOn: null,
          dither: false,
          transparentPick: null,
          snsKind: action.sns?.kind ?? 1,
          snsInput: action.sns?.id ?? "",
          snsTouched: false,
          saving: false,
          failed: false,
        };
      default:
        return state;
    }
  }
  switch (action.type) {
    case "crop-move":
      return { ...state, cropPos: action.pos };
    case "zoom":
      return { ...state, zoom: action.zoom };
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
    case "sns-kind":
      return { ...state, snsKind: action.kind };
    case "sns-input":
      return { ...state, snsInput: action.value };
    case "sns-blur":
      return { ...state, snsTouched: true };
    case "saving":
      return { ...state, saving: true, failed: false, snsTouched: true };
    case "save-failed":
      return { ...state, saving: false, failed: true };
    default:
      return state;
  }
}
