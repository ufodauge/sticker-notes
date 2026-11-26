import { useRef, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { stickerStore, type StoredSticker } from "../../data/sticker-store.ts";
import { feedback, type Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { carry, dropTarget, pageStickerSize } from "./carry.ts";
import { jumble } from "./jumble.ts";
import { paperSound } from "./paper-sound.ts";
import styles from "./Pocket.module.css";

type Props = {
  readonly dark: boolean;
  readonly stickers: readonly StoredSticker[];
  readonly highlight: Highlight | null;
  readonly onOpen: () => void;
};

const PEEKING = 3;
const PULL_PX = 14;
const PLACED_SCALE = 2;

type Pull = {
  readonly pointer: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly sticker: StoredSticker;
  readonly out: boolean;
};

// The pocket: tap it to look inside, or pull a sticker straight out of it onto a page.
export function Pocket({ dark, stickers, highlight, onOpen }: Props) {
  const pull = useRef<Pull | null>(null);
  const pulled = useRef(false);
  // an empty pocket stays, so a sticker can always be put back into it
  const hit = highlight && stickers.some((s) => s.id === highlight.stickerId) ? highlight : null;

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (pull.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const peekId = (e.target as Element).closest<HTMLElement>("[data-peek]")?.dataset.peek;
    const sticker = stickers.find((s) => s.id === peekId) ?? stickers[0];
    if (!sticker) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    paperSound.wake();
    pulled.current = false;
    pull.current = {
      pointer: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      sticker,
      out: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const cur = pull.current;
    if (!cur || cur.pointer !== e.pointerId) return;
    if (cur.out) {
      carry.move(e.clientX, e.clientY);
      return;
    }
    if (Math.hypot(e.clientX - cur.from.x, e.clientY - cur.from.y) < PULL_PX) return;
    paperSound.peel();
    carry.pickUp(
      {
        stickerId: cur.sticker.id,
        sticker: cur.sticker.sticker,
        size: pageStickerSize(PLACED_SCALE),
        rotation: jumble(cur.sticker.id, 16),
      },
      e.clientX,
      e.clientY,
    );
    pulled.current = true;
    pull.current = { ...cur, out: true };
  };

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const cur = pull.current;
    if (!cur || cur.pointer !== e.pointerId) return;
    pull.current = null;
    if (!cur.out) return;
    const target = cancelled ? undefined : dropTarget(e.clientX, e.clientY);
    carry.putDown();
    if (target?.kind !== "page") return;
    const id = cur.sticker.id;
    paperSound.stick();
    void stickerStore
      .place(id, {
        pageId: target.pageId ?? "",
        change: { x: target.x, y: target.y, scale: PLACED_SCALE, rotation: jumble(id, 16) },
      })
      .then(() => feedback.landed(id, "lifted", null));
  };

  // a pull ends in a click on the pocket too; only a plain tap opens it
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (pulled.current) {
      pulled.current = false;
      e.preventDefault();
      return;
    }
    if (stickers.length > 0) onOpen();
  };

  return (
    <button
      type="button"
      className={styles.pocket}
      aria-label={t.pocket.open(stickers.length)}
      title={t.pocket.dialog}
      data-dark={dark || undefined}
      data-pocket=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onClick={onClick}
    >
      <span key={hit?.nonce ?? 0} className={styles.body} data-effect={hit?.effect}>
        {stickers.slice(0, PEEKING).map((s, i) => (
          <span
            key={s.id}
            className={styles.peek}
            data-peek={s.id}
            style={
              {
                "--i": i,
                "--r": `${jumble(s.id, 50)}deg`,
                "--dx": `${jumble(s.id, 16, 10)}px`,
              } as CSSProperties
            }
          >
            <StickerView sticker={s.sticker} scale={0} label="" decorative />
          </span>
        ))}
        <span className={styles.film} />
      </span>
      {stickers.length > 0 && (
        <span className={styles.count} aria-hidden="true">
          {stickers.length}
        </span>
      )}
    </button>
  );
}
