import { Check, Pointer, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { FLOWS, stateOf } from "../../core/flows.ts";
import type { TutorialFlow } from "../../core/tutorial.ts";
import common from "../common.module.css";
import { t } from "../messages.ts";
import styles from "./Tutorial.module.css";
import { tutorial } from "./tutorial-store.ts";

// The first time through. It opens with a card saying what is about to happen, then a line at a
// time with a ghostly finger doing it on the real thing (a sticker's edge, the page's edge, the
// pocket, the create button), a tick as each is done, and a card at the end saying what is next.
// It can be closed at any time.

type Point = { readonly x: number; readonly y: number };
type Motion = { readonly from: Point; readonly to: Point; readonly tap: boolean } | null;

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();

// where the finger goes for a state, found on the screen as it is now
function motionOf(flow: TutorialFlow, stateId: string): Motion {
  const sticker = box("[data-facing] [data-grab]");
  const book = box("[data-open]");
  const create = box('nav [aria-label="画像からステッカーを作る"]');
  const pocket = box("[data-pocket]");
  const paper = box("[data-facing] [data-paper]");
  if (stateId === "peel" && sticker) {
    const from = { x: sticker.left + sticker.width * 0.12, y: sticker.top + sticker.height * 0.55 };
    return { from, to: { x: from.x - 40, y: from.y - 60 }, tap: false };
  }
  if (stateId === "turn" && book) {
    const right = Math.min(book.right, innerWidth) - 14;
    const y = book.top + book.height * 0.4;
    return {
      from: { x: right, y },
      to: { x: right - Math.min(220, book.width * 0.4), y },
      tap: false,
    };
  }
  if (stateId === "create" && create) {
    const c = centre(create);
    return { from: c, to: c, tap: true };
  }
  if (flow === "tutorial.received" && stateId === "place" && pocket && paper) {
    return { from: centre(pocket), to: centre(paper), tap: false };
  }
  return null;
}

// The finger: measured where it is put on the screen, and again when the screen changes.
function Finger({ flow, stateId }: { readonly flow: TutorialFlow; readonly stateId: string }) {
  const place = (el: HTMLElement | null) => {
    if (!el) return undefined;
    const measure = () => {
      const m = motionOf(flow, stateId);
      el.hidden = m === null;
      if (!m) return;
      el.toggleAttribute("data-tap", m.tap);
      el.style.setProperty("--x0", `${m.from.x}px`);
      el.style.setProperty("--y0", `${m.from.y}px`);
      el.style.setProperty("--x1", `${m.to.x}px`);
      el.style.setProperty("--y1", `${m.to.y}px`);
    };
    // the album and the desk lay out after this paints
    const frame = requestAnimationFrame(measure);
    const stop = new AbortController();
    addEventListener("resize", measure, { signal: stop.signal });
    addEventListener("scroll", measure, { signal: stop.signal, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      stop.abort();
    };
  };
  return (
    <span ref={place} className={styles.finger} hidden>
      <Pointer aria-hidden="true" size={28} strokeWidth={1.5} />
    </span>
  );
}

// the steps of a flow (its states between the intro and the outro)
const stepsOf = (flow: TutorialFlow) =>
  FLOWS[flow].states.filter((s) => s.id !== "intro" && s.id !== "outro" && s.id !== "done");

export function Tutorial() {
  const s = useSyncExternalStore(tutorial.subscribe, tutorial.get);
  if (!s || "done" in s) return null;
  const state = stateOf(s);
  if (!state) return null;
  const words = t.tutorial[s.flow];

  if (state.id === "intro" || state.id === "outro") {
    const card = state.id === "intro" ? words.intro : words.outro;
    return (
      <div className={styles.layer}>
        <section
          className={styles.card}
          role="dialog"
          aria-label={card.title}
          data-tutorial={`${s.flow}:${state.id}`}
        >
          <h2 className={styles.title}>{card.title}</h2>
          <p className={styles.text}>{card.text}</p>
          <div className={common.row}>
            {state.id === "intro" ? (
              <>
                <button type="button" className={common.primary} onClick={tutorial.begin}>
                  {words.intro.go}
                </button>
                <button type="button" className={common.button} onClick={tutorial.close}>
                  {t.tutorial.later}
                </button>
              </>
            ) : (
              <button type="button" className={common.primary} onClick={tutorial.finish}>
                {words.outro.go}
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  const steps = stepsOf(s.flow);
  const n = steps.findIndex((x) => x.id === state.id);
  return (
    <div className={styles.layer}>
      <p className={styles.caption} role="status" data-tutorial={`${s.flow}:${state.id}`}>
        {n > 0 && (
          // a tick for the step just done, fading as the next one is shown
          <span key={n} className={styles.done} aria-label={t.tutorial.done}>
            <Check aria-hidden="true" size={16} strokeWidth={2.5} />
          </span>
        )}
        <span className={styles.count}>{t.tutorial.count(n + 1, steps.length)}</span>
        <span>{words.steps[state.id as keyof typeof words.steps]}</span>
        <button
          type="button"
          className={`${common.icon} ${styles.close}`}
          aria-label={t.tutorial.close}
          title={t.tutorial.close}
          onClick={tutorial.close}
        >
          <X aria-hidden="true" size={18} strokeWidth={1.5} />
        </button>
      </p>
      <Finger key={`${s.flow}:${state.id}`} flow={s.flow} stateId={state.id} />
    </div>
  );
}
