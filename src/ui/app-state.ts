type Overlay =
  | { readonly kind: "none" }
  | { readonly kind: "create"; readonly file?: File }
  | { readonly kind: "qr"; readonly stickerId: string }
  | { readonly kind: "print" }
  | { readonly kind: "menu" };

type View = "album" | "jar";

export type AppState = {
  readonly view: View;
  readonly overlay: Overlay;
  readonly selected: string | null;
  readonly leaving: { readonly placementId: string; readonly stickerId: string } | null;
};

export type AppAction =
  | { readonly type: "open"; readonly overlay: Overlay }
  | { readonly type: "close" }
  | { readonly type: "view"; readonly view: View }
  | { readonly type: "select"; readonly placementId: string | null }
  | { readonly type: "leave"; readonly placementId: string; readonly stickerId: string }
  | { readonly type: "left" };

export const INITIAL: AppState = {
  view: "album",
  overlay: { kind: "none" },
  selected: null,
  leaving: null,
};

export function reducer(s: AppState, a: AppAction): AppState {
  switch (a.type) {
    case "open":
      return { ...s, overlay: a.overlay, selected: null };
    case "close":
      return { ...s, overlay: { kind: "none" } };
    case "view":
      return { ...s, view: a.view, selected: null };
    case "select":
      return { ...s, selected: a.placementId };
    case "leave":
      return {
        ...s,
        selected: null,
        leaving: { placementId: a.placementId, stickerId: a.stickerId },
      };
    case "left":
      return { ...s, leaving: null };
  }
}
