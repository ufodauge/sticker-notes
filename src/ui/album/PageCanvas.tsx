import { RotateCw } from "lucide-react";
import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { applyChange, type Placement } from "../../core/album.ts";
import { snsDisplay } from "../../core/sns.ts";
import { stickerStore, type StoredSticker } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { StickerView } from "../StickerView.tsx";
import {
  addPointer,
  begin,
  point,
  removePointer,
  settle,
  turn,
  type Box,
  type Gesture,
  type Live,
  type Pt,
} from "./gesture.ts";
import styles from "./PageCanvas.module.css";

type Props = {
  readonly pageId: string;
  readonly placements: readonly Placement[];
  readonly stickers: ReadonlyMap<string, StoredSticker>;
  readonly selected: string | null;
  readonly highlight: Highlight | null;
  readonly leaving: string | null;
  readonly onLeft: () => void;
  readonly onSelect: (placementId: string | null) => void;
  readonly children?: ReactNode;
};

function writeVars(els: readonly HTMLElement[], live: Live, committedScale: number): void {
  els.forEach((el) => {
    el.style.setProperty("--x", String(live.x));
    el.style.setProperty("--y", String(live.y));
    el.style.setProperty("--r", `${live.rotation}deg`);
    el.style.setProperty("--pinch", String(live.scale / committedScale));
  });
}

function writeCommitted(els: readonly HTMLElement[], p: Placement): void {
  writeVars(els, p, p.scale);
  els.forEach((el) => el.style.setProperty("--s", String(p.scale)));
}

const varsOf = (p: Placement): CSSProperties =>
  ({
    "--x": p.x,
    "--y": p.y,
    "--r": `${p.rotation}deg`,
    "--s": p.scale,
    "--pinch": 1,
    zIndex: p.z,
  }) as CSSProperties;

const NUDGE = 0.01;
const EDGE = 56;
const EDGE_SPEED = 14;

const KEY_CHANGES: Readonly<
  Record<string, (p: Placement) => Parameters<typeof stickerStore.update>[1]>
> = {
  ArrowLeft: (p) => ({ x: p.x - NUDGE }),
  ArrowRight: (p) => ({ x: p.x + NUDGE }),
  ArrowUp: (p) => ({ y: p.y - NUDGE }),
  ArrowDown: (p) => ({ y: p.y + NUDGE }),
  "+": (p) => ({ scale: p.scale + 1 }),
  "-": (p) => ({ scale: p.scale - 1 }),
  "[": (p) => ({ rotation: p.rotation - 15 }),
  "]": (p) => ({ rotation: p.rotation + 15 }),
};

const boxOf = (r: DOMRect): Box => ({
  left: r.left,
  top: r.top,
  width: r.width,
  height: r.height,
});

function revealPage(el: HTMLElement | null): void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el?.closest("[data-page]")?.scrollIntoView({
    behavior: reduced ? "auto" : "smooth",
    inline: "center",
    block: "nearest",
  });
}

function edgeSpeed(x: number, box: DOMRect): number {
  if (x < box.left + EDGE) return -EDGE_SPEED * (1 - (x - box.left) / EDGE);
  if (x > box.right - EDGE) return EDGE_SPEED * (1 - (box.right - x) / EDGE);
  return 0;
}

type Drag = {
  readonly g: Gesture;
  readonly els: readonly HTMLElement[];
  readonly scale: number;
  readonly scroller: HTMLElement | null;
  readonly maxScroll: number;
  readonly section: HTMLElement | null;
};

type Spin = {
  readonly placementId: string;
  readonly els: readonly HTMLElement[];
  readonly start: Live;
  readonly center: Pt;
  readonly from: Pt;
  readonly live: Live;
};

export function PageCanvas(props: Props) {
  const { placements, stickers, selected, highlight, leaving, onLeft, onSelect, children } = props;
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const spin = useRef<Spin | null>(null);
  const frame = useRef(0);

  const movers = (placementId: string): readonly HTMLElement[] => [
    ...(pageRef.current?.querySelectorAll<HTMLElement>(
      `[data-move="${CSS.escape(placementId)}"]`,
    ) ?? []),
  ];

  const tick = () => {
    frame.current = 0;
    const cur = drag.current;
    const page = pageRef.current;
    if (!cur || !page) return;
    const box = boxOf(page.getBoundingClientRect());
    const scrollerBox = cur.scroller?.getBoundingClientRect();
    const g = settle(cur.g, box);
    drag.current = { ...cur, g };
    writeVars(cur.els, g.live, cur.scale);
    const p = g.pointers.size === 1 ? [...g.pointers.values()][0] : undefined;
    const v = p && scrollerBox ? edgeSpeed(p.x, scrollerBox) : 0;
    if (v !== 0 && cur.scroller) {
      const left = cur.scroller.scrollLeft;
      cur.scroller.scrollLeft = Math.min(cur.maxScroll, Math.max(0, left + v));
    }
    frame.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (p: Placement) => (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const page = pageRef.current;
    if (!page) return;
    const box = boxOf(page.getBoundingClientRect());
    const at = { x: e.clientX, y: e.clientY };
    const cur = drag.current;
    if (cur && cur.g.placementId === p.id) {
      drag.current = { ...cur, g: addPointer(cur.g, e.pointerId, at, box) };
      return;
    }
    const scroller = page.closest<HTMLElement>("[data-scroller]");
    drag.current = {
      els: movers(p.id),
      scale: p.scale,
      scroller,
      maxScroll: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
      section: page.closest<HTMLElement>("[data-page]"),
      g: begin(
        p.id,
        box,
        { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation },
        e.pointerId,
        at,
      ),
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const cur = drag.current;
    if (!cur) return;
    const g = point(cur.g, e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current = { ...cur, g };
    if (g.moved && !cur.g.moved) {
      cur.scroller?.setAttribute("data-dragging", "");
      cur.section?.setAttribute("data-drag-origin", "");
    }
    if (g.moved && !frame.current) frame.current = requestAnimationFrame(tick);
  };

  const pageAt = (x: number, y: number) => {
    const hits = document.elementsFromPoint(x, y);
    const slot = hits.map((el) => el.closest<HTMLElement>("[data-new-page]")).find(Boolean);
    if (slot) return { id: null, box: slot.getBoundingClientRect() };
    const section = hits
      .map((el) => el.closest<HTMLElement>("[data-page]"))
      .find((el) => el?.dataset.page && el.dataset.page !== props.pageId);
    const paper = section?.querySelector<HTMLElement>("[data-paper]");
    const id = section?.dataset.page;
    return id && paper ? { id, box: paper.getBoundingClientRect() } : undefined;
  };

  const finish = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const cur = drag.current;
    const page = pageRef.current;
    if (!cur || !page || !cur.g.pointers.has(e.pointerId)) return;
    const box = boxOf(page.getBoundingClientRect());
    const settled = settle(cur.g, box);
    const g = removePointer(settled, e.pointerId, box);
    if (g.pointers.size > 0) {
      drag.current = { ...cur, g };
      return;
    }
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    cur.scroller?.removeAttribute("data-dragging");
    cur.section?.removeAttribute("data-drag-origin");
    if (cancelled) {
      writeVars(cur.els, cur.g.start, cur.scale);
      return;
    }
    if (!settled.moved) {
      onSelect(selected === settled.placementId ? null : settled.placementId);
      void stickerStore.update(settled.placementId, { front: true });
      return;
    }
    const live = settled.live;
    const cx = box.left + live.x * box.width;
    const cy = box.top + live.y * box.height;
    const target = pageAt(cx, cy);
    if (target) {
      onSelect(null);
      void stickerStore.moveTo(settled.placementId, target.id, {
        x: (cx - target.box.left) / target.box.width,
        y: (cy - target.box.top) / target.box.height,
        scale: live.scale,
        rotation: live.rotation,
      });
      return;
    }
    const placed = placements.find((p) => p.id === settled.placementId);
    if (placed) writeCommitted(cur.els, applyChange(placed, live));
    void stickerStore.update(settled.placementId, { ...live, front: true });
  };

  const onSpinDown = (p: Placement) => (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const art = pageRef.current?.querySelector(`[data-grab="${CSS.escape(p.id)}"]`);
    if (!art) return;
    const r = art.getBoundingClientRect();
    const start = { x: p.x, y: p.y, scale: p.scale, rotation: p.rotation };
    spin.current = {
      placementId: p.id,
      els: movers(p.id),
      start,
      center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      from: { x: e.clientX, y: e.clientY },
      live: start,
    };
  };

  const onSpinMove = (e: PointerEvent<HTMLButtonElement>) => {
    const cur = spin.current;
    if (!cur) return;
    const live = turn(cur.start, cur.center, cur.from, { x: e.clientX, y: e.clientY });
    spin.current = { ...cur, live };
    writeVars(cur.els, live, cur.start.scale);
  };

  const onSpinUp = () => {
    const cur = spin.current;
    spin.current = null;
    if (!cur) return;
    const placed = placements.find((p) => p.id === cur.placementId);
    if (placed) writeCommitted(cur.els, applyChange(placed, cur.live));
    void stickerStore.update(cur.placementId, {
      scale: cur.live.scale,
      rotation: cur.live.rotation,
    });
  };

  const onKeyDown = (p: Placement) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const change = KEY_CHANGES[e.key]?.(p);
    if (!change) return;
    e.preventDefault();
    void stickerStore.update(p.id, change);
  };

  return (
    <div
      ref={pageRef}
      className={styles.page}
      data-paper=""
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <div className={styles.clip} data-clip="">
        {placements.map((p) => {
          const s = stickers.get(p.stickerId);
          if (!s) return null;
          const hl = highlight?.stickerId === p.stickerId ? highlight : null;
          const empty = s.sticker.pixels.every((px) => px === s.sticker.transparentIndex);
          return (
            <div key={p.id} className={styles.placed} style={varsOf(p)} data-move={p.id}>
              <button
                type="button"
                className={styles.grab}
                data-grab={p.id}
                data-sticker={p.stickerId}
                data-empty={empty || undefined}
                aria-label={snsDisplay(s.sticker.snsKind, s.sticker.snsId)}
                aria-pressed={selected === p.id}
                onPointerDown={onPointerDown(p)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => finish(e, false)}
                onPointerCancel={(e) => finish(e, true)}
                onKeyDown={onKeyDown(p)}
              >
                <span
                  key={hl?.nonce ?? 0}
                  ref={hl ? revealPage : undefined}
                  className={styles.art}
                  data-effect={leaving === p.id ? "leave" : hl?.effect}
                  onAnimationEnd={(e) => {
                    if (leaving === p.id && e.animationName.includes("peel")) onLeft();
                  }}
                >
                  <StickerView sticker={s.sticker} scale={0} label="" decorative />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {placements
        .filter((p) => p.id === selected && leaving !== p.id)
        .map((p) => (
          <div
            key={p.id}
            className={styles.frame}
            style={{ ...varsOf(p), zIndex: undefined }}
            data-move={p.id}
            data-flip-x={p.x > 0.8 || undefined}
            data-flip-y={p.y < 0.2 || undefined}
          >
            <button
              type="button"
              className={styles.handle}
              aria-label="回転と大きさ(ドラッグ)"
              title="回転と大きさ"
              onPointerDown={onSpinDown(p)}
              onPointerMove={onSpinMove}
              onPointerUp={onSpinUp}
              onPointerCancel={onSpinUp}
              onKeyDown={onKeyDown(p)}
            >
              <RotateCw aria-hidden="true" size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      {children}
    </div>
  );
}
