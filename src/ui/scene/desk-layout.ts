import { clampSpot, type DeskShape, type Spot, type SurfaceKind } from "../../core/surface.ts";
import { settings } from "../../data/sticker-store.ts";

// Where the things on the desk have been put (each is moved by hand, and stays there).

type Layout = Readonly<Partial<Record<DeskShape, Partial<Record<SurfaceKind, Spot>>>>>;
type Listener = () => void;

const state: { layout: Layout; listeners: Set<Listener> } = { layout: {}, listeners: new Set() };

function publish(layout: Layout): void {
  state.layout = layout;
  state.listeners.forEach((l) => l());
}

void settings
  .get("deskLayout")
  .then((saved) => {
    if (saved) publish(saved);
  })
  .catch(() => {});

export const deskLayout = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): Layout => state.layout,
  put: (shape: DeskShape, kind: SurfaceKind, spot: Spot): void => {
    const layout = {
      ...state.layout,
      [shape]: { ...state.layout[shape], [kind]: clampSpot(spot) },
    };
    publish(layout);
    void settings.set("deskLayout", layout).catch(() => {});
  },
};
