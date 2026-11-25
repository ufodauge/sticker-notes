import { ImagePlus, Plus, Trash2 } from "lucide-react";
import {
  type RefObject,
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
import { startCurl, type Curl } from "./curl.ts";
import { paintFace, type FaceArt } from "./page-paint.ts";
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
// a turn goes through once the held point has been brought this close to the spine (page widths)
const COMMIT_SHARE = 0.3;
// paper is taken hold of at its free edge: this outer share of the page (or off the page)
const EDGE_SHARE = 0.25;
const FLICK_PX_PER_MS = 0.6;
// room above and below the page for a corner lifted past its edge
const CURL_MARGIN = 0.18;

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

// A leaf on its way over: hidden while its picture curls on the canvas above the book.
type Turning = {
  readonly leaf: HTMLElement;
  readonly curl: Curl;
  readonly origin: { readonly x: number; readonly y: number };
  // how far out from the spine a point on screen is, on the turning page's side
  readonly outward: (x: number) => number;
  readonly width: number;
};

function facesOf(pages: readonly Page[]): Face[] {
  return pages.length === 0
    ? [{ kind: "empty", index: 0 }]
    : [
        ...pages.map((page, index) => ({ kind: "page" as const, page, index })),
        { kind: "new", index: pages.length },
      ];
}

function artOf(face: Face | undefined, snap: Ready): FaceArt {
  if (!face || face.kind === "empty") return { kind: "blank" };
  if (face.kind === "new") return { kind: "new" };
  const id = face.page.id;
  return {
    kind: "page",
    placements: snap.placements.filter((p) => p.pageId === id),
    stickers: new Map(snap.stickers.map((s) => [s.id, s.sticker])),
  };
}

function pairs<T>(items: readonly T[]): (readonly [T, T | undefined])[] {
  return Array.from({ length: Math.ceil(items.length / 2) }, (_, k) => [
    items[k * 2] as T,
    items[k * 2 + 1],
  ]);
}

const isWide = (el: HTMLElement) => getComputedStyle(el).getPropertyValue("--wide").trim() === "1";

type CurlRefs = {
  readonly book: RefObject<HTMLDivElement | null>;
  readonly canvas: RefObject<HTMLCanvasElement | null>;
  readonly busy: RefObject<boolean>;
};

// Lays the leaf's two sides on the canvas and hides the leaf itself. The page is held where the
// finger took it (`at`, on screen); without a finger, near the bottom of its free edge. Undefined
// when there is no leaf to turn, or the finger is not at the page's free edge, where paper can be
// taken hold of.
function beginCurl(
  refs: CurlRefs,
  dark: boolean,
  direction: -1 | 1,
  at: { readonly x: number; readonly y: number } | undefined,
): Turning | undefined {
  const el = refs.book.current;
  const canvas = refs.canvas.current;
  const current = stickerStore.getSnapshot();
  if (!el || !canvas || current.status !== "ready") return undefined;
  const k = direction > 0 ? pagePosition.get().flipped : pagePosition.get().flipped - 1;
  const leaf = el.querySelector<HTMLElement>(`[data-leaf="${k}"]`);
  const pair = pairs(facesOf(sortedPages(current.pages)))[k];
  if (!leaf || !pair) return undefined;
  const r = el.getBoundingClientRect();
  const w = r.width / 2;
  const h = r.height;
  const grip = at
    ? { x: (at.x - (r.left + w)) * direction, y: at.y - r.top }
    : { x: w, y: h * 0.72 };
  const offPage = grip.y < 0 || grip.y > h;
  if (at && !offPage && grip.x < w * (1 - EDGE_SHARE)) return undefined;
  const margin = h * CURL_MARGIN;
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round((h + margin * 2) * dpr);
  canvas.style.top = `${-margin}px`;
  canvas.style.height = `${h + margin * 2}px`;
  const [front, back] = pair;
  const shown = direction > 0 ? front : back;
  const hidden = direction > 0 ? back : front;
  const curl = startCurl({
    canvas,
    spineX: w,
    top: margin,
    w,
    h,
    outward: direction,
    front: paintFace(artOf(shown, current), w, h, dpr, direction > 0 ? "left" : "right", dark),
    back: paintFace(artOf(hidden, current), w, h, dpr, direction > 0 ? "right" : "left", dark),
    grip: {
      x: Math.min(w, Math.max(w * (1 - EDGE_SHARE), grip.x)),
      y: Math.min(h, Math.max(0, grip.y)),
    },
    dpr,
  });
  el.setAttribute("data-flipping", "");
  leaf.setAttribute("data-curling", "");
  canvas.setAttribute("data-on", "");
  refs.busy.current = true;
  return {
    leaf,
    curl,
    origin: { x: r.left, y: r.top - margin },
    outward: (x: number) => (x - (r.left + w)) * direction,
    width: w,
  };
}

// once the book has taken its new place, the real leaf comes back and the picture goes
function endCurl(refs: CurlRefs, t: Turning): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      t.leaf.removeAttribute("data-curling");
      refs.book.current?.removeAttribute("data-flipping");
      refs.canvas.current?.removeAttribute("data-on");
      refs.busy.current = false;
    }),
  );
}

// a turn asked for without a finger (wheel, page track, a sticker held at the edge)
function turnShown(refs: CurlRefs, direction: -1 | 1, apply: () => void): boolean {
  if (refs.busy.current) return false;
  const dark = refs.book.current?.closest("[data-dusk]") !== null;
  const t = beginCurl(refs, dark, direction, undefined);
  if (!t) return false;
  paperSound.flip();
  t.curl.release(true, () => {
    apply();
    endCurl(refs, t);
  });
  return true;
}

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
  const faces = facesOf(pages);
  const leaves = pairs(faces);
  const count = pages.length === 0 ? 1 : pages.length + 1;

  const addPage = async () => {
    await stickerStore.addPage();
    showPage(pages.length);
  };

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
      if (flipped >= leaves.length) return { kind: "none" };
      const turning = beginCurl({ book, canvas: curlCanvas, busy }, dark, 1, at);
      return turning ? { kind: "flip", turning, direction: 1 } : { kind: "none" };
    }
    if (flipped === 0) return { kind: "none" };
    if (!wide && side === "right") return { kind: "slide", direction: -1 };
    const turning = beginCurl({ book, canvas: curlCanvas, busy }, dark, -1, at);
    return turning ? { kind: "flip", turning, direction: -1 } : { kind: "none" };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    torch(e);
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

  // one torch for the whole spread: each open page is lit where the pointer is, on it or not
  const torch = (e: PointerEvent<HTMLDivElement>) => {
    if (!dark) return;
    e.currentTarget.querySelectorAll<HTMLElement>("[data-facing] [data-paper]").forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--torch-x", `${((e.clientX - r.left) / r.width) * 100}%`);
      el.style.setProperty("--torch-y", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    torch(e);
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
        <canvas ref={curlCanvas} className={styles.curl} aria-hidden="true" />
      </div>
    </div>
  );
}
