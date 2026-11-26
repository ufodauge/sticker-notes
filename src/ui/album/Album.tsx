import { ImagePlus, Trash2 } from "lucide-react";
import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { slotCenter, sortedPages } from "../../core/album.ts";
import { stickerStore, type Ready } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import styles from "./Album.module.css";
import { carry } from "./carry.ts";
import {
  beginCurl,
  endCurl,
  isWide,
  leavesOf,
  spreadsOf,
  turnShown,
  type Side,
  type Turning,
} from "./book.ts";
import { pagePosition } from "./page-position.ts";
import { PageCanvas } from "./PageCanvas.tsx";
import { paperSound } from "./paper-sound.ts";

type Props = {
  readonly dark: boolean;
  readonly snap: Ready;
  readonly selected: string | null;
  readonly highlight: Highlight | null;
  readonly leaving: string | null;
  readonly onSelect: (placementId: string | null) => void;
  readonly onLeft: () => void;
  readonly onCreate: () => void;
};

const WHEEL_PAGE_MS = 300;
const DECIDE_PX = 10;
// a turn goes through once the held point has been brought this close to the spine (page widths)
const COMMIT_SHARE = 0.3;
const FLICK_PX_PER_MS = 0.6;

// A page turn or a slide that follows the finger.
type Turn =
  | { readonly kind: "undecided" }
  | { readonly kind: "flip"; readonly turning: Turning; readonly direction: -1 | 1 }
  | { readonly kind: "slide"; readonly direction: -1 | 1 }
  | { readonly kind: "none" };

type Track = {
  readonly pointer: number;
  readonly x0: number;
  readonly y0: number;
  readonly last: { readonly x: number; readonly t: number };
  readonly speed: number;
  readonly turn: Turn;
};

export function Album(props: Props) {
  const { dark, snap, selected, highlight, leaving, onSelect, onLeft, onCreate } = props;
  const viewport = useRef<HTMLDivElement | null>(null);
  const book = useRef<HTMLDivElement | null>(null);
  const track = useRef<Track | null>(null);
  const lastWheel = useRef(0);
  const curlCanvas = useRef<HTMLCanvasElement | null>(null);
  const busy = useRef(false);
  const pos = useSyncExternalStore(pagePosition.subscribe, pagePosition.get);
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  const pages = sortedPages(snap.pages);
  const spreads = spreadsOf(pages);
  const leaves = leavesOf(spreads);
  // the halves there are, two to a spread (the "+" spread at the end included)
  const count = (pages.length === 0 ? 1 : pages.length + 1) * 2;

  // the page count and the screen's width decide where steps go; the identity must follow count
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      viewport.current = el;
      if (!el) return undefined;
      const measure = () => pagePosition.configure(count, isWide(el));
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      measure();
      const release = carry.onEdge((d) => pagePosition.step(d));
      const stopTurning = pagePosition.onTurn((d, apply) =>
        turnShown({ book, canvas: curlCanvas, busy }, d, apply),
      );
      return () => {
        observer.disconnect();
        release();
        stopTurning();
      };
    },
    [count],
  );

  const decide = (dx: number, wide: boolean, at: { x: number; y: number }): Turn => {
    const { flipped, side } = pos;
    if (busy.current) return { kind: "none" };
    if (dx < 0) {
      if (!wide && side === "left") return { kind: "slide", direction: 1 };
      if (flipped >= leaves.length - 1) return { kind: "none" };
      const turning = beginCurl({ book, canvas: curlCanvas, busy }, dark, 1, at);
      return turning ? { kind: "flip", turning, direction: 1 } : { kind: "none" };
    }
    if (flipped === 0) return { kind: "none" };
    if (!wide && side === "right") return { kind: "slide", direction: -1 };
    const turning = beginCurl({ book, canvas: curlCanvas, busy }, dark, -1, at);
    return turning ? { kind: "flip", turning, direction: -1 } : { kind: "none" };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (track.current || carry.held()) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    track.current = {
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      last: { x: e.clientX, t: e.timeStamp },
      speed: 0,
      turn: { kind: "undecided" },
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const cur = track.current;
    if (!cur || cur.pointer !== e.pointerId) return;
    const dx = e.clientX - cur.x0;
    const dt = Math.max(1, e.timeStamp - cur.last.t);
    const speed = cur.speed * 0.6 + ((e.clientX - cur.last.x) / dt) * 0.4;
    const last = { x: e.clientX, t: e.timeStamp };
    if (cur.turn.kind === "undecided") {
      const dy = e.clientY - cur.y0;
      if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
      const el = viewport.current;
      const turn: Turn =
        Math.abs(dy) > Math.abs(dx) || !el
          ? { kind: "none" }
          : decide(dx, isWide(el), { x: cur.x0, y: cur.y0 });
      if (turn.kind !== "none") e.currentTarget.setPointerCapture(e.pointerId);
      if (turn.kind === "flip") paperSound.wake();
      if (turn.kind === "slide") book.current?.setAttribute("data-live", "");
      track.current = { ...cur, turn, last, speed };
      return;
    }
    track.current = { ...cur, last, speed };
    if (cur.turn.kind === "flip") {
      const { curl, origin } = cur.turn.turning;
      curl.follow(e.clientX - origin.x, e.clientY - origin.y);
    }
    if (cur.turn.kind === "slide") book.current?.style.setProperty("--drag", `${dx}px`);
  };

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const cur = track.current;
    if (!cur || cur.pointer !== e.pointerId) return;
    track.current = null;
    const turn = cur.turn;
    if (turn.kind !== "flip" && turn.kind !== "slide") return;
    const dx = e.clientX - cur.x0;
    const width = (book.current?.getBoundingClientRect().width ?? 600) / 2;
    const flick = -cur.speed * turn.direction > FLICK_PX_PER_MS;
    const far =
      turn.kind === "flip"
        ? turn.turning.outward(e.clientX) < turn.turning.width * COMMIT_SHARE
        : (-dx * turn.direction) / width > 0.38;
    const through = far || flick;
    if (turn.kind === "slide") {
      book.current?.removeAttribute("data-live");
      book.current?.style.removeProperty("--drag");
      if (through) pagePosition.step(turn.direction);
      return;
    }
    if (through) paperSound.flip();
    const t = turn.turning;
    t.curl.release(through, () => {
      if (through) pagePosition.step(turn.direction, true);
      endCurl({ book, canvas: curlCanvas, busy }, t);
    });
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 4 || e.timeStamp - lastWheel.current < WHEEL_PAGE_MS) return;
    lastWheel.current = e.timeStamp;
    pagePosition.step(delta > 0 ? 1 : -1);
  };

  // One half of a spread, on one side of a leaf. The spread is drawn whole, and the side shows
  // its half of it, so a sticker over the spine is on both. `facing`: this side looks up at the
  // reader (the other lies face down).
  const side = (sd: Side | undefined, back: boolean, facing: boolean) => {
    const cls = `${styles.face} ${back ? styles.back : styles.front}`;
    if (!sd) return <div className={`${cls} ${styles.blank}`} />;
    const { spread, half } = sd;
    const face = spread.index * 2 + half;
    // no page yet: the first spread (showing where to start), or the blank one after the last
    // page, which becomes a page as soon as a sticker is put on it
    if (spread.kind !== "page") {
      const first = slotCenter(0);
      return (
        <section
          className={cls}
          data-page={half === 0 && spread.kind === "empty" ? "" : undefined}
          data-spread=""
          data-face={face}
          data-facing={facing || undefined}
        >
          <div className={styles.half} data-half={half}>
            <PageCanvas
              dark={dark}
              half={half}
              pageId=""
              placements={[]}
              stickers={byId}
              selected={null}
              highlight={null}
              leaving={null}
              onLeft={onLeft}
              onSelect={onSelect}
            >
              {half === 0 && spread.kind === "empty" && (
                <button
                  type="button"
                  className={styles.slot}
                  style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
                  aria-label={t.album.createFirst}
                  onClick={onCreate}
                >
                  <ImagePlus aria-hidden="true" size={28} strokeWidth={1.25} />
                </button>
              )}
            </PageCanvas>
          </div>
        </section>
      );
    }
    const id = spread.page.id;
    const onPage = snap.placements.filter((p) => p.pageId === id);
    return (
      <section
        key={`${id}-${half}`}
        className={cls}
        data-page={half === 0 ? id : undefined}
        data-spread={id}
        data-face={face}
        data-facing={facing || undefined}
        aria-label={half === 0 ? t.album.pageLabel(spread.index + 1) : undefined}
      >
        <div className={styles.half} data-half={half}>
          <PageCanvas
            dark={dark}
            half={half}
            pageId={id}
            placements={onPage}
            stickers={byId}
            selected={selected}
            highlight={highlight}
            leaving={leaving}
            onLeft={onLeft}
            onSelect={onSelect}
          >
            {half === 0 && onPage.length === 0 && pages.length > 1 && (
              <button
                type="button"
                className={styles.removePage}
                aria-label={t.album.removePage.label(spread.index + 1)}
                title={t.album.removePage.tooltip}
                onClick={() => void stickerStore.deletePage(id)}
              >
                <Trash2 aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            )}
          </PageCanvas>
        </div>
      </section>
    );
  };

  return (
    <div
      ref={attach}
      className={styles.viewport}
      data-album=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onWheel={onWheel}
    >
      <div
        ref={book}
        className={styles.book}
        data-side={pos.side}
        data-open={pos.flipped}
        data-moved={pagePosition.moved() || undefined}
      >
        <div
          className={styles.leaf}
          style={{ zIndex: 0 }}
          data-leaf="cover"
          data-turned=""
          data-shown={pos.flipped <= 1 || undefined}
          data-near={pos.flipped === 0 || undefined}
        >
          <div className={styles.sheet}>
            {side(spreads[0] && { spread: spreads[0], half: 0 }, true, true)}
          </div>
        </div>
        {leaves.map(({ front, back }, k) => {
          const turned = k < pos.flipped;
          const shown = k >= pos.flipped - 2 && k <= pos.flipped + 1;
          const near = k === pos.flipped - 1 || k === pos.flipped;
          return (
            <div
              key={k}
              className={styles.leaf}
              data-leaf={k}
              data-turned={turned || undefined}
              data-shown={shown || undefined}
              data-near={near || undefined}
              style={{ zIndex: turned ? k + 1 : leaves.length * 2 - k }}
            >
              <div className={styles.sheet}>
                {side(front, false, !turned)}
                {side(back, true, turned)}
              </div>
            </div>
          );
        })}
        <canvas ref={curlCanvas} className={styles.curl} aria-hidden="true" />
      </div>
    </div>
  );
}
