import { Pointer, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { STEPS, type Flow, type TutorialEvent } from "../../core/tutorial.ts";
import common from "../common.module.css";
import { t } from "../messages.ts";
import styles from "./Tutorial.module.css";
import { tutorial } from "./tutorial-store.ts";

// The first time through: a line saying what to do, and a ghostly finger doing it on the real
// thing (a sticker's edge, the page's edge, the pocket, the create button), over and over until
// it is done. It can be closed at any time.

type Point = { readonly x: number; readonly y: number };
type Motion = { readonly from: Point; readonly to: Point } | null;

const centre = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();

// where the finger goes for a step, found on the screen as it is now
function motionOf(flow: Flow, step: TutorialEvent): Motion {
  const sticker = box("[data-facing] [data-grab]");
  const book = box("[data-open]");
  const create = box('nav [aria-label="画像からステッカーを作る"]');
  const pocket = box("[data-pocket]");
  const paper = box("[data-facing] [data-paper]");
  if (flow === "start" && step === "peeled" && sticker) {
    const from = { x: sticker.left + sticker.width * 0.12, y: sticker.top + sticker.height * 0.55 };
    return { from, to: { x: from.x - 40, y: from.y - 60 } };
  }
  if (step === "turned" && book) {
    const right = Math.min(book.right, innerWidth) - 14;
    const y = book.top + book.height * 0.4;
    return { from: { x: right, y }, to: { x: right - Math.min(220, book.width * 0.4), y } };
  }
  if ((step === "create" || step === "created") && create) {
    const c = centre(create);
    return { from: c, to: c };
  }
  if (flow === "received" && step === "placed" && pocket && paper) {
    return { from: centre(pocket), to: centre(paper) };
  }
  return null;
}

// The finger: measured where it is put on the screen, and again when the screen changes.
function Finger({ flow, step }: { readonly flow: Flow; readonly step: TutorialEvent }) {
  const place = (el: HTMLElement | null) => {
    if (!el) return undefined;
    const measure = () => {
      const m = motionOf(flow, step);
      el.hidden = m === null;
      if (!m) return;
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
    <span
      ref={place}
      className={styles.finger}
      data-tap={step === "create" || step === "created" || undefined}
      hidden
    >
      <Pointer aria-hidden="true" size={28} strokeWidth={1.5} />
    </span>
  );
}

export function Tutorial() {
  const s = useSyncExternalStore(tutorial.subscribe, tutorial.get);
  if (!s || "done" in s) return null;
  const steps = STEPS[s.flow];
  const step = steps[s.step];
  if (!step) return null;
  return (
    <div className={styles.layer}>
      <p className={styles.caption} role="status" data-tutorial={`${s.flow}:${step}`}>
        <span className={styles.count}>{t.tutorial.count(s.step + 1, steps.length)}</span>
        <span>{t.tutorial[s.flow][step as keyof (typeof t.tutorial)[typeof s.flow]]}</span>
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
      <Finger key={`${s.flow}:${step}`} flow={s.flow} step={step} />
    </div>
  );
}
