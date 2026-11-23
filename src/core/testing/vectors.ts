export const VECTOR_APP_BASE = "https://example.github.io/s/";

export type Vector = {
  readonly name: string;
  readonly input: {
    readonly paletteId: number;
    readonly transparentIndex: number | null;
    readonly snsKind: number;
    readonly snsId: string;
    readonly pixels: string;
  };
  readonly bodyHex: string;
  readonly stickerId: string;
  readonly url: string;
};
