type Listener = () => void;
const state: { index: number; listeners: Set<Listener> } = { index: 0, listeners: new Set() };

function set(index: number): void {
  if (index === state.index) return;
  state.index = index;
  state.listeners.forEach((l) => l());
}

export const pagePosition = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): number => state.index,
};

export function trackPages(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined;
  const listening = new AbortController();
  const frame = { id: 0 };
  const measure = () => {
    frame.id = 0;
    const centre = el.scrollLeft + el.clientWidth / 2;
    const sections = [...el.querySelectorAll<HTMLElement>("[data-page], [data-new-page]")];
    const nearest = sections.reduce(
      (best, s, i) => {
        const d = Math.abs(s.offsetLeft + s.offsetWidth / 2 - centre);
        return d < best.d ? { d, i } : best;
      },
      { d: Number.POSITIVE_INFINITY, i: 0 },
    );
    set(nearest.i);
  };
  el.addEventListener(
    "scroll",
    () => {
      if (!frame.id) frame.id = requestAnimationFrame(measure);
    },
    { passive: true, signal: listening.signal },
  );
  measure();
  return () => {
    listening.abort();
    cancelAnimationFrame(frame.id);
  };
}

export function showPage(index: number): void {
  const scroller = document.querySelector<HTMLElement>("[data-scroller]");
  const target = scroller?.querySelectorAll<HTMLElement>("[data-page], [data-new-page]")[index];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target?.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    inline: "center",
    block: "nearest",
  });
}
