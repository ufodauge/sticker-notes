import { ArrowLeft } from "lucide-react";
import { useReducer, useRef, type CSSProperties, type PointerEvent } from "react";
import { snsDisplay } from "../../core/sns.ts";
import { stickerStore, type StoredSticker } from "../../data/sticker-store.ts";
import common from "../common.module.css";
import { Dialog } from "../Dialog.tsx";
import { useCloseDialog } from "../dialog-context.ts";
import { feedback } from "../feedback.ts";
import { t } from "../messages.ts";
import { Backing } from "../Backing.tsx";
import { StickerView } from "../StickerView.tsx";
import { jumble } from "./jumble.ts";
import { pagePosition } from "./page-position.ts";
import { paperSound } from "./paper-sound.ts";
import styles from "./PocketDialog.module.css";

type Props = {
  readonly stickers: readonly StoredSticker[];
  readonly pageIds: readonly string[];
  readonly onClose: () => void;
};

export function PocketDialog({ stickers, pageIds, onClose }: Props) {
  return (
    <Dialog label={t.pocket.dialog} onClose={onClose} className={styles.dialog}>
      <PocketBody stickers={stickers} pageIds={pageIds} />
    </Dialog>
  );
}

function PocketBody({ stickers, pageIds }: Omit<Props, "onClose">) {
  // the sticker itself, not its id: it stays in the hand while the dialog closes after placing
  const [inHand, hold] = useReducer((_: StoredSticker | null, s: StoredSticker | null) => s, null);
  if (inHand) {
    return <Hand key={inHand.id} sticker={inHand} pageIds={pageIds} onBack={() => hold(null)} />;
  }
  return (
    <div className={styles.pile}>
      {stickers.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={styles.pick}
          aria-label={t.pocket.pick(snsDisplay(s.sticker.snsKind, s.sticker.snsId))}
          style={
            {
              "--i": i,
              "--r": `${jumble(s.id, 34)}deg`,
              "--dy": `${jumble(s.id, 18, 10)}px`,
            } as CSSProperties
          }
          onClick={() => hold(s)}
        >
          <Backing sticker={s} small />
        </button>
      ))}
    </div>
  );
}

const PEEL_PX = 56;
const PLACED_SCALE = 2;
const DOTS = 36;

type Peel = {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly detached: boolean;
};

function paperAt(x: number, y: number) {
  const papers = [...document.querySelectorAll<HTMLElement>("[data-scroller] [data-paper]")];
  const hit = papers
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .find(({ r }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  if (!hit) return undefined;
  return {
    pageId: hit.el.closest<HTMLElement>("[data-page]")?.dataset.page ?? "",
    x: (x - hit.r.left) / hit.r.width,
    y: (y - hit.r.top) / hit.r.height,
  };
}

// How big the sticker will be once it is on the page, relative to how big it is in the hand.
function carriedScale(art: HTMLElement): number {
  const paper = document.querySelector<HTMLElement>("[data-scroller] [data-paper]");
  const own = art.getBoundingClientRect().width;
  if (!paper || own === 0) return 1;
  return ((paper.getBoundingClientRect().width / 300) * DOTS * PLACED_SCALE) / own;
}

function Hand({
  sticker,
  pageIds,
  onBack,
}: {
  readonly sticker: StoredSticker;
  readonly pageIds: readonly string[];
  readonly onBack: () => void;
}) {
  const close = useCloseDialog();
  const peel = useRef<Peel | null>(null);
  const rotation = jumble(sticker.id, 16);
  const who = snsDisplay(sticker.sticker.snsKind, sticker.sticker.snsId);

  const stickNear = async () => {
    paperSound.wake();
    paperSound.peel();
    await stickerStore.place(sticker.id, { near: pageIds[pagePosition.get()] });
    feedback.landed(sticker.id, "lifted", null);
    close();
  };

  const reset = (el: HTMLElement) => {
    el.removeAttribute("data-detached");
    el.closest("dialog")?.removeAttribute("data-carrying");
    ["--peel", "--dx", "--dy"].forEach((k) => el.style.removeProperty(k));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (peel.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    paperSound.wake();
    peel.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, detached: false };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = peel.current;
    if (!p || p.pointer !== e.pointerId) return;
    const el = e.currentTarget;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (p.detached) {
      el.style.setProperty("--dx", `${dx}px`);
      el.style.setProperty("--dy", `${dy}px`);
      return;
    }
    const k = Math.min(1, Math.hypot(dx, dy) / PEEL_PX);
    el.style.setProperty("--peel", String(k));
    el.style.setProperty("--dx", `${dx * 0.3}px`);
    el.style.setProperty("--dy", `${dy * 0.3}px`);
    if (k < 1) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--left", `${r.left - dx * 0.3}px`);
    el.style.setProperty("--top", `${r.top - dy * 0.3}px`);
    el.style.setProperty("--carry", String(carriedScale(el)));
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);
    el.setAttribute("data-detached", "");
    el.closest("dialog")?.setAttribute("data-carrying", "");
    peel.current = { ...p, detached: true };
    paperSound.peel();
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = peel.current;
    if (!p || p.pointer !== e.pointerId) return;
    peel.current = null;
    const el = e.currentTarget;
    const target = p.detached ? paperAt(e.clientX, e.clientY) : undefined;
    if (!target) {
      reset(el);
      return;
    }
    el.setAttribute("data-dropped", "");
    void stickerStore
      .place(sticker.id, {
        pageId: target.pageId,
        change: { x: target.x, y: target.y, scale: PLACED_SCALE, rotation },
      })
      .then(() => feedback.landed(sticker.id, "lifted", null));
    close();
  };

  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    peel.current = null;
    reset(e.currentTarget);
  };

  return (
    <div className={styles.hand}>
      <Backing sticker={sticker} className={styles.wide}>
        <span className={styles.hollow}>
          <div
            className={styles.peelable}
            role="img"
            aria-label={t.pocket.inHand(who)}
            data-peel=""
            style={{ "--r": `${rotation}deg` } as CSSProperties}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <StickerView sticker={sticker.sticker} scale={0} label="" decorative />
          </div>
        </span>
      </Backing>
      <div className={styles.actions}>
        <button type="button" className={common.button} onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={18} strokeWidth={1.5} />
          {t.pocket.back}
        </button>
        <button type="button" className={common.primary} onClick={() => void stickNear()}>
          {t.pocket.stick}
        </button>
      </div>
    </div>
  );
}
