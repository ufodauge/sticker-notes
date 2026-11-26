import type { Discarded } from "../data/sticker-store.ts";

export type Highlight = {
  readonly stickerId: string;
  // pocket: dropped into the pocket; lifted: just put on a page, not yet pressed down
  readonly effect: "arrive" | "wiggle" | "pocket" | "lifted" | "pressed";
  readonly nonce: number;
};

export type Undo =
  | { readonly kind: "unreceive"; readonly stickerId: string }
  | { readonly kind: "restore"; readonly discarded: Discarded };

// what the toast's button opens: making one's own sticker, or one's own QR to give back (both
// for the sticker that just came in)
type ToastAction = { readonly kind: "create" | "return"; readonly from: string };

export type Toast = {
  readonly id: number;
  readonly text: string;
  readonly undo: Undo | null;
  readonly action?: ToastAction;
  readonly persistent?: boolean;
};

export type Feedback = { readonly toast: Toast | null; readonly highlight: Highlight | null };

const SHOW_MS = 6000;

type Listener = () => void;
const state: {
  value: Feedback;
  seq: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  listeners: Set<Listener>;
} = {
  value: { toast: null, highlight: null },
  seq: 0,
  timer: undefined,
  listeners: new Set(),
};

function publish(next: Feedback): void {
  state.value = next;
  state.listeners.forEach((l) => l());
}

function showToast(t: Omit<Toast, "id"> | null): Toast | null {
  clearTimeout(state.timer);
  if (!t) return null;
  const toast = { ...t, id: ++state.seq };
  if (!toast.persistent) state.timer = setTimeout(() => feedback.dismiss(toast.id), SHOW_MS);
  return toast;
}

export const feedback = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): Feedback => state.value,

  toast: (t: Omit<Toast, "id"> | null): void => publish({ ...state.value, toast: showToast(t) }),

  landed: (stickerId: string, effect: Highlight["effect"], t: Omit<Toast, "id"> | null): void =>
    publish({
      highlight: { stickerId, effect, nonce: ++state.seq },
      toast: t ? showToast(t) : state.value.toast,
    }),

  dismiss: (id: number): void => {
    if (state.value.toast?.id === id) publish({ ...state.value, toast: null });
  },
};
