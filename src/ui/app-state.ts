type Overlay =
  | { readonly kind: "none" }
  // `returnTo`: the sticker just received, when this is to give one back for it
  | { readonly kind: "create"; readonly file?: File; readonly returnTo?: string }
  | { readonly kind: "qr"; readonly stickerId: string; readonly returnTo?: string }
  | { readonly kind: "print" }
  | { readonly kind: "menu" }
  | { readonly kind: "pocket" }
  | { readonly kind: "debug" }
  | { readonly kind: "back"; readonly stickerId: string }
  | { readonly kind: "people"; readonly focus?: string };

export type AppState = {
  readonly overlay: Overlay;
  // counts the overlays opened: each one is told apart from the one before, even of one kind
  readonly opened: number;
  readonly selected: string | null;
  readonly leaving: { readonly placementId: string; readonly stickerId: string } | null;
};

export type AppAction =
  | { readonly type: "open"; readonly overlay: Overlay }
  // names the overlay being closed: a dialog finishes closing after its animation, by which time
  // another overlay (even another of the same kind) may already be open, and that one must stay
  | { readonly type: "close"; readonly opened: number }
  | { readonly type: "select"; readonly placementId: string | null }
  | { readonly type: "leave"; readonly placementId: string; readonly stickerId: string }
  | { readonly type: "left" };

export const initialState: AppState = {
  overlay: { kind: "none" },
  opened: 0,
  selected: null,
  leaving: null,
};

export function reducer(s: AppState, a: AppAction): AppState {
  switch (a.type) {
    case "open":
      return { ...s, overlay: a.overlay, opened: s.opened + 1, selected: null };
    case "close":
      return s.opened === a.opened ? { ...s, overlay: { kind: "none" } } : s;
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
