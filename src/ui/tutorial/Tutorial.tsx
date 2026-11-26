import { Check, Pointer, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { stateOf } from "../../core/flows.ts";
import type { TutorialFlow } from "../../core/tutorial.ts";
import common from "../common.module.css";
import { t } from "../messages.ts";
import styles from "./Tutorial.module.css";
import { tutorial } from "./tutorial-store.ts";

// The first time through, shown rather than told. Each step shows itself on the real thing: one
// sample sticker's corner lifting as if it would come off, the page's corner folding over, the
// create button (or the pocket) beating. Only if nothing is done for a while does a ghostly
// finger show how. A tick as each is done; at the end, one card says what comes next. It can be
// put away at any time.

type Point = { readonly x: number; readonly y: number };
type Cue = {
  // what draws attention over the thing (the sticker lifts by itself), a folding page corner, or
  // a beating ring
  readonly mark: "none" | "dogear" | "ring";
  readonly at: DOMRect;
  // the finger's path (a tap when it does not move)
  readonly from: Point;
  readonly to: Point;
};

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const onScreen = (r: DOMRect): boolean => {
  const c = centre(r);
  return r.width > 0 && c.x > 0 && c.x < innerWidth && c.y > 0 && c.y < innerHeight;
};

// the first of these on the screen (not on the half of the album, or the desk, out of view)
const visibleElement = (selector: string): Element | undefined =>
  [...document.querySelectorAll(selector)].find((el) => onScreen(el.getBoundingClientRect()));

const visible = (selector: string): DOMRect | undefined =>
  visibleElement(selector)?.getBoundingClientRect();

// the sample sticker that wants to come off (it lifts a little, now and then: PageCanvas.module.css)
const teased = (): Element | undefined =>
  document.querySelector("[data-tease]") ?? visibleElement("[data-facing] [data-grab]");

function cueOf(flow: TutorialFlow, stateId: string): Cue | null {
  if (stateId === "peel") {
    const el = teased();
    if (!el) return null;
    el.setAttribute("data-tease", "");
    const s = el.getBoundingClientRect();
    // the finger takes it by the edge that lifts (its lower right), and draws it off
    const edge = { x: s.right - s.width * 0.28, y: s.bottom - s.height * 0.28 };
    return { mark: "none", at: s, from: edge, to: { x: edge.x - 40, y: edge.y - 80 } };
  }
  if (stateId === "turn") {
    // the page on the right that is in view: its corner folds, as a page starting to turn
    const page = [...document.querySelectorAll("[data-facing]")]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.right > 0 && r.left < innerWidth)
      .sort((a, b) => b.right - a.right)[0];
    if (!page) return null;
    const right = Math.min(page.right, innerWidth) - 4;
    const bottom = Math.min(page.bottom, innerHeight - 96) - 4;
    // as large as the part of the page in view allows (on a phone, the next page only peeks in)
    const size = Math.max(24, Math.min(56, right - Math.max(page.left, 0)));
    const at = new DOMRect(right - size, bottom - size, size, size);
    return {
      mark: "dogear",
      at,
      from: { x: right - 14, y: bottom - 14 },
      to: { x: right - Math.min(200, page.width * 0.6), y: bottom - 40 },
    };
  }
  if (stateId === "create") {
    const b = visible(`nav [aria-label="${t.app.create.label}"]`);
    if (!b) return null;
    const c = centre(b);
    return { mark: "ring", at: b, from: c, to: c };
  }
  if (flow === "tutorial.received" && stateId === "place") {
    const pocket = visible("[data-pocket]");
    const paper = visible("[data-facing]");
    if (!pocket || !paper) return null;
    return { mark: "ring", at: pocket, from: centre(pocket), to: centre(paper) };
  }
  return null;
}

// The cue for a step: measured where it is on the screen, and again when the screen changes.
function Cue({ flow, stateId }: { readonly flow: TutorialFlow; readonly stateId: string }) {
  const place = (el: HTMLElement | null) => {
    if (!el) return undefined;
    const measure = () => {
      const c = cueOf(flow, stateId);
      el.hidden = c === null;
      if (!c) return;
      el.dataset.mark = c.mark;
      el.toggleAttribute("data-tap", c.from.x === c.to.x && c.from.y === c.to.y);
      const set = (name: string, v: number) => el.style.setProperty(name, `${v}px`);
      set("--mx", c.at.left);
      set("--my", c.at.top);
      set("--mw", c.at.width);
      set("--mh", c.at.height);
      set("--x0", c.from.x);
      set("--y0", c.from.y);
      set("--x1", c.to.x);
      set("--y1", c.to.y);
    };
    // the album and the desk lay out after this paints, and things come and go (a sticker flying
    // into the pocket, a page turning): measured again now and then
    const frame = requestAnimationFrame(measure);
    const again = setInterval(measure, 400);
    const stop = new AbortController();
    addEventListener("resize", measure, { signal: stop.signal });
    addEventListener("scroll", measure, { signal: stop.signal, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      document.querySelector("[data-tease]")?.removeAttribute("data-tease");
      clearInterval(again);
      stop.abort();
    };
  };
  return (
    <div ref={place} className={styles.cue} hidden>
      <span className={styles.mark} />
      {/* the finger: its tip on the point, shown only after a while of nothing done */}
      <span className={styles.finger}>
        <span className={styles.touch} />
        <Pointer className={styles.hand} aria-hidden="true" size={30} strokeWidth={1.5} />
      </span>
    </div>
  );
}

export function Tutorial() {
  const s = useSyncExternalStore(tutorial.subscribe, tutorial.get);
  if (!s || "done" in s) return null;
  const state = stateOf(s);
  if (!state) return null;

  if (state.id === "outro") {
    const card = t.tutorial[s.flow];
    return (
      <div className={styles.layer} data-card="">
        <section
          className={styles.card}
          role="dialog"
          aria-label={card.title}
          data-tutorial={`${s.flow}:${state.id}`}
        >
          <h2 className={styles.title}>{card.title}</h2>
          <p className={styles.text}>{card.text}</p>
          <button type="button" className={common.primary} onClick={tutorial.finish}>
            {card.go}
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.layer} data-tutorial={`${s.flow}:${state.id}`}>
      {s.at > 0 && (
        // a tick for the step just done, popping and fading
        <span key={s.at} className={styles.done} role="img" aria-label={t.tutorial.done}>
          <Check aria-hidden="true" size={18} strokeWidth={2.5} />
        </span>
      )}
      <button
        type="button"
        className={`${common.icon} ${styles.close}`}
        aria-label={t.tutorial.close}
        title={t.tutorial.close}
        onClick={tutorial.close}
      >
        <X aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
      <Cue key={`${s.flow}:${state.id}`} flow={s.flow} stateId={state.id} />
    </div>
  );
}
