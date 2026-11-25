import { ImagePlus, Plus, Trash2 } from "lucide-react";
import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { slotCenter, sortedPages, type Page } from "../../core/album.ts";
import { stickerStore, type Ready } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import styles from "./Album.module.css";
import { carry } from "./carry.ts";
import { pagePosition, showPage } from "./page-position.ts";
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

type Face =
  | { readonly kind: "page"; readonly page: Page; readonly index: number }
  | { readonly kind: "new"; readonly index: number }
  | { readonly kind: "empty"; readonly index: number };

const WHEEL_PAGE_MS = 420;
const DECIDE_PX = 10;
const COMMIT_SHARE = 0.38;
const FLICK_PX_PER_MS = 0.6;
const BEND_PER_SPEED = 9;
const MAX_BEND_DEG = 10;

// A page turn or a slide that follows the finger.
type Turn =
  | { readonly kind: "undecided" }
  | { readonly kind: "flip"; readonly leaf: HTMLElement; readonly direction: -1 | 1 }
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

function pairs<T>(items: readonly T[]): (readonly [T, T | undefined])[] {
  return Array.from({ length: Math.ceil(items.length / 2) }, (_, k) => [
    items[k * 2] as T,
    items[k * 2 + 1],
  ]);
}

const isWide = (el: HTMLElement) => getComputedStyle(el).getPropertyValue("--wide").trim() === "1";

export function Album(props: Props) {
  const { dark, snap, selected, highlight, leaving, onSelect, onLeft, onCreate } = props;
  const viewport = useRef<HTMLDivElement | null>(null);
  const book = useRef<HTMLDivElement | null>(null);
  const track = useRef<Track | null>(null);
  const lastWheel = useRef(0);
  const pos = useSyncExternalStore(pagePosition.subscribe, pagePosition.get);
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  const pages = sortedPages(snap.pages);
  const faces: Face[] =
    pages.length === 0
      ? [{ kind: "empty", index: 0 }]
      : [
          ...pages.map((page, index) => ({ kind: "page" as const, page, index })),
          { kind: "new", index: pages.length },
        ];
  const leaves = pairs(faces);
  const count = faces.length;

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
      return () => {
        observer.disconnect();
        release();
      };
    },
    [count],
  );

  const addPage = async () => {
    await stickerStore.addPage();
    showPage(pages.length);
  };

  const pageWidth = () => (book.current?.getBoundingClientRect().width ?? 600) / 2;

  const decide = (dx: number, wide: boolean): Turn => {
    const { flipped, side } = pos;
    if (dx < 0) {
      if (!wide && side === "left") return { kind: "slide", direction: 1 };
      const leaf = book.current?.querySelector<HTMLElement>(`[data-leaf="${flipped}"]`);
      return leaf && flipped < leaves.length
        ? { kind: "flip", leaf, direction: 1 }
        : { kind: "none" };
    }
    if (flipped === 0) return { kind: "none" };
    if (!wide && side === "right") return { kind: "slide", direction: -1 };
    const leaf = book.current?.querySelector<HTMLElement>(`[data-leaf="${flipped - 1}"]`);
    return leaf ? { kind: "flip", leaf, direction: -1 } : { kind: "none" };
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
        Math.abs(dy) > Math.abs(dx) || !el ? { kind: "none" } : decide(dx, isWide(el));
      if (turn.kind !== "none") e.currentTarget.setPointerCapture(e.pointerId);
      if (turn.kind === "flip") {
        turn.leaf.setAttribute("data-live", "");
        book.current?.setAttribute("data-flipping", "");
        paperSound.wake();
      }
      if (turn.kind === "slide") book.current?.setAttribute("data-live", "");
      track.current = { ...cur, turn, last, speed };
      return;
    }
    track.current = { ...cur, last, speed };
    if (cur.turn.kind === "flip") {
      const { leaf, direction } = cur.turn;
      const share = Math.min(1, Math.max(0, (-dx * direction) / (pageWidth() * 1.6)));
      const turned = direction > 0 ? share : 1 - share;
      const bend = Math.max(-MAX_BEND_DEG, Math.min(MAX_BEND_DEG, speed * BEND_PER_SPEED));
      leaf.style.setProperty("--live", turned.toFixed(4));
      leaf.style.setProperty("--bend", `${bend.toFixed(2)}deg`);
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
    const far = (-dx * turn.direction) / (pageWidth() * 1.6) > COMMIT_SHARE;
    const flick = -cur.speed * turn.direction > FLICK_PX_PER_MS;
    if (turn.kind === "flip") {
      book.current?.removeAttribute("data-flipping");
      turn.leaf.removeAttribute("data-live");
      turn.leaf.style.removeProperty("--live");
      turn.leaf.style.removeProperty("--bend");
    } else {
      book.current?.removeAttribute("data-live");
      book.current?.style.removeProperty("--drag");
    }
    if (far || flick) {
      if (turn.kind === "flip") paperSound.flip();
      pagePosition.step(turn.direction);
    }
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(delta) < 4 || e.timeStamp - lastWheel.current < WHEEL_PAGE_MS) return;
    lastWheel.current = e.timeStamp;
    pagePosition.step(delta > 0 ? 1 : -1);
  };

  // `facing`: this side of the leaf looks up at the reader (the other one lies face down)
  const face = (f: Face | undefined, back: boolean, facing: boolean) => {
    const cls = `${styles.face} ${back ? styles.back : styles.front}`;
    if (!f) return <div className={`${cls} ${styles.blank}`} />;
    if (f.kind === "new") {
      return (
        <section
          className={cls}
          data-new-page=""
          data-face={f.index}
          data-facing={facing || undefined}
        >
          <button
            type="button"
            className={styles.newPage}
            aria-label={t.album.addPage}
            title={t.album.addPage}
            onClick={() => void addPage()}
          >
            <Plus aria-hidden="true" size={32} strokeWidth={1.25} />
          </button>
        </section>
      );
    }
    if (f.kind === "empty") {
      const first = slotCenter(0);
      return (
        <section className={cls} data-page="" data-face={0} data-facing={facing || undefined}>
          <PageCanvas
            dark={dark}
            pageId=""
            placements={[]}
            stickers={byId}
            selected={null}
            highlight={null}
            leaving={null}
            onLeft={onLeft}
            onSelect={onSelect}
          >
            <button
              type="button"
              className={styles.slot}
              style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
              aria-label={t.album.createFirst}
              onClick={onCreate}
            >
              <ImagePlus aria-hidden="true" size={28} strokeWidth={1.25} />
            </button>
          </PageCanvas>
        </section>
      );
    }
    const onPage = snap.placements.filter((p) => p.pageId === f.page.id);
    return (
      <section
        key={f.page.id}
        className={cls}
        data-page={f.page.id}
        data-face={f.index}
        data-facing={facing || undefined}
        aria-label={t.album.pageLabel(f.index + 1)}
      >
        <PageCanvas
          dark={dark}
          pageId={f.page.id}
          placements={onPage}
          stickers={byId}
          selected={selected}
          highlight={highlight}
          leaving={leaving}
          onLeft={onLeft}
          onSelect={onSelect}
        >
          {onPage.length === 0 && pages.length > 1 && (
            <button
              type="button"
              className={styles.removePage}
              aria-label={t.album.removePage.label(f.index + 1)}
              title={t.album.removePage.tooltip}
              onClick={() => void stickerStore.deletePage(f.page.id)}
            >
              <Trash2 aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          )}
        </PageCanvas>
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
        data-moved={pagePosition.moved() || undefined}
      >
        {leaves.map(([front, back], k) => {
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
                {face(front, false, !turned)}
                {face(back, true, turned)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
