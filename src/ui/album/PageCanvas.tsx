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
import { feedback, type Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { carry, dropTarget } from "./carry.ts";
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
import { showPage } from "./page-position.ts";
import { startPeel, type PeelView } from "./sticker-peel.ts";
import { GRACE_DOTS, onEdge, touchShape } from "./sticker-touch.ts";
import styles from "./PageCanvas.module.css";
import { paperSound } from "./paper-sound.ts";

type Props = {
  // the half of the spread this side of the leaf shows (the whole spread is drawn, the side shows
  // its half; a sticker over the spine is drawn on both and belongs to the half its centre is on)
  readonly half: 0 | 1;
  // lights out: the page is dim but for a torch under the finger and glow-in-the-dark stickers
  readonly dark: boolean;
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
const TAP_SLOP = 6;
// how far (in sticker sizes) the finger pulls the rolled edge before the sticker comes off
const PEEL_DISTANCE = 1.05;
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

// a highlighted sticker opens the notebook at its page
function revealPage(el: HTMLElement | null): void {
  const face = el?.closest<HTMLElement>("[data-face]")?.dataset.face;
  if (face !== undefined) showPage(Number(face));
}

// One finger on a sticker's edge peels it: the edge rolls back over the sticker toward the
// finger (drawn on a canvas while it does). Pulled far enough, it comes off and is carried.
type Peel = {
  readonly mode: "peel";
  readonly placement: Placement;
  readonly sticker: StoredSticker;
  readonly pointer: number;
  readonly from: Pt;
  readonly size: number;
  readonly grab: HTMLElement;
  readonly els: readonly HTMLElement[];
  readonly view: PeelView | null;
  readonly off: boolean;
};

// Pressed in the middle, a sticker stays stuck: a tap selects it, a pull only makes it give.
type Hold = {
  readonly mode: "hold";
  readonly placement: Placement;
  readonly sticker: StoredSticker;
  readonly pointer: number;
  readonly from: Pt;
  readonly grab: HTMLElement;
  readonly resisted: boolean;
};

// Two fingers turn and size it where it lies.
type Pinch = {
  readonly mode: "pinch";
  readonly g: Gesture;
  readonly els: readonly HTMLElement[];
  readonly scale: number;
};

type Spin = {
  readonly placementId: string;
  readonly els: readonly HTMLElement[];
  readonly start: Live;
  readonly center: Pt;
  readonly from: Pt;
  readonly live: Live;
};

const clipIdOf = (placementId: string) => `touch-${placementId}`;

export function PageCanvas(props: Props) {
  const {
    half,
    dark,
    placements,
    stickers,
    selected,
    highlight,
    leaving,
    onLeft,
    onSelect,
    children,
  } = props;
  const owns = (p: Placement) => (p.x < 0.5 ? 0 : 1) === half;
  const pageRef = useRef<HTMLDivElement>(null);
  const hold = useRef<Peel | Hold | Pinch | null>(null);
  const spin = useRef<Spin | null>(null);
  const frame = useRef(0);

  // on both sides of the spine, where a sticker lies over it
  const movers = (placementId: string): readonly HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>(`[data-move="${CSS.escape(placementId)}"]`),
  ];

  const pageBox = (): Box | undefined => {
    const page = pageRef.current;
    return page ? boxOf(page.getBoundingClientRect()) : undefined;
  };

  const tick = () => {
    frame.current = 0;
    const cur = hold.current;
    const box = pageBox();
    if (!cur || cur.mode !== "pinch" || !box) return;
    const g = settle(cur.g, box);
    hold.current = { ...cur, g };
    writeVars(cur.els, g.live, cur.scale);
  };

  const pressSticker = (stickerId: string) => {
    if (highlight?.effect !== "lifted" || highlight.stickerId !== stickerId) return;
    paperSound.stick();
    feedback.landed(stickerId, "pressed", null);
  };

  const onPointerDown = (p: Placement, s: StoredSticker) => (e: PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const box = pageBox();
    if (!box) return;
    const at = { x: e.clientX, y: e.clientY };
    const cur = hold.current;
    if ((cur?.mode === "peel" || cur?.mode === "hold") && cur.placement.id === p.id) {
      if (cur.mode === "peel" && cur.off) return;
      if (cur.mode === "peel") {
        cur.view?.clear();
        cur.els.forEach((el) => el.removeAttribute("data-peeling"));
      }
      cur.grab.removeAttribute("data-stuck");
      const g = begin(p.id, box, p, cur.pointer, cur.from);
      hold.current = {
        mode: "pinch",
        g: addPointer(g, e.pointerId, at, box),
        els: movers(p.id),
        scale: p.scale,
      };
      return;
    }
    if (cur?.mode === "pinch" && cur.g.placementId === p.id) {
      hold.current = { ...cur, g: addPointer(cur.g, e.pointerId, at, box) };
      return;
    }
    if (cur) return;
    paperSound.wake();
    if (!onEdge(s, p, box, at, e.pointerType)) {
      hold.current = {
        mode: "hold",
        placement: p,
        sticker: s,
        pointer: e.pointerId,
        from: at,
        grab: e.currentTarget,
        resisted: false,
      };
      return;
    }
    hold.current = {
      mode: "peel",
      placement: p,
      sticker: s,
      pointer: e.pointerId,
      from: at,
      size: (box.width / 600) * 36 * p.scale,
      grab: e.currentTarget,
      els: movers(p.id),
      view: null,
      off: false,
    };
  };

  // a mouse over the edge shows the hand that can lift it
  const onHover = (p: Placement, s: StoredSticker) => (e: PointerEvent<HTMLElement>) => {
    if (hold.current || e.pointerType !== "mouse" || e.buttons !== 0) return;
    const box = pageBox();
    const edge =
      box !== undefined && onEdge(s, p, box, { x: e.clientX, y: e.clientY }, e.pointerType);
    e.currentTarget.toggleAttribute("data-edge", edge);
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const cur = hold.current;
    if (!cur) return;
    if (cur.mode === "pinch") {
      const g = point(cur.g, e.pointerId, { x: e.clientX, y: e.clientY });
      hold.current = { ...cur, g };
      if (g.moved && !frame.current) frame.current = requestAnimationFrame(tick);
      return;
    }
    if (cur.pointer !== e.pointerId) return;
    if (cur.mode === "hold") {
      const far = Math.hypot(e.clientX - cur.from.x, e.clientY - cur.from.y) >= TAP_SLOP;
      if (far && !cur.resisted) {
        cur.grab.setAttribute("data-stuck", "");
        hold.current = { ...cur, resisted: true };
      }
      return;
    }
    if (cur.off) {
      carry.move(e.clientX, e.clientY);
      return;
    }
    const finger = { x: e.clientX, y: e.clientY };
    if (Math.hypot(finger.x - cur.from.x, finger.y - cur.from.y) < TAP_SLOP) return;
    const box = pageBox();
    const centre = box
      ? { x: box.left + cur.placement.x * box.width, y: box.top + cur.placement.y * box.height }
      : cur.from;
    const view =
      cur.view ??
      startPeel(cur.sticker.sticker, centre, cur.size, cur.placement.rotation, cur.from);
    if (!cur.view) {
      cur.els.forEach((el) => el.setAttribute("data-peeling", ""));
      hold.current = { ...cur, view: view ?? null };
    }
    const peeled = view?.show(finger) ?? PEEL_DISTANCE;
    if (peeled < PEEL_DISTANCE) return;
    const tipped = view?.direction();
    view?.clear();
    cur.els.forEach((el) => {
      el.removeAttribute("data-peeling");
      el.setAttribute("data-carried", "");
    });
    onSelect(null);
    paperSound.peel();
    carry.pickUp(
      {
        stickerId: cur.sticker.id,
        sticker: cur.sticker.sticker,
        size: cur.size,
        rotation: cur.placement.rotation,
        offset: { x: centre.x - cur.from.x, y: centre.y - cur.from.y },
        tipped,
      },
      e.clientX,
      e.clientY,
    );
    hold.current = { ...cur, view: null, off: true };
  };

  const putDown = (cur: Peel, x: number, y: number, cancelled: boolean) => {
    const at = carry.centre(x, y);
    const target = cancelled ? undefined : dropTarget(at.x, at.y);
    carry.putDown();
    cur.els.forEach((el) => el.removeAttribute("data-carried"));
    const { placement, sticker } = cur;
    if (target?.kind === "pocket") {
      void stickerStore
        .unplace(placement.id)
        .then(() => feedback.landed(sticker.id, "pocket", null));
      paperSound.stick();
      return;
    }
    if (target?.kind === "page") {
      void stickerStore
        .moveTo(placement.id, target.pageId, { x: target.x, y: target.y })
        .then(() => feedback.landed(sticker.id, "pressed", null));
      paperSound.stick();
      return;
    }
    feedback.landed(sticker.id, "pressed", null);
  };

  const finish = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const cur = hold.current;
    if (!cur) return;
    if (cur.mode === "pinch") {
      const box = pageBox();
      if (!box || !cur.g.pointers.has(e.pointerId)) return;
      const settled = settle(cur.g, box);
      const g = removePointer(settled, e.pointerId, box);
      if (g.pointers.size > 0) {
        hold.current = { ...cur, g };
        return;
      }
      hold.current = null;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      const placed = placements.find((p) => p.id === settled.placementId);
      if (cancelled) {
        writeVars(cur.els, cur.g.start, cur.scale);
        return;
      }
      if (placed) writeCommitted(cur.els, applyChange(placed, settled.live));
      void stickerStore.update(settled.placementId, { ...settled.live, front: true });
      return;
    }
    if (cur.pointer !== e.pointerId) return;
    hold.current = null;
    if (cur.mode === "hold") {
      cur.grab.removeAttribute("data-stuck");
      if (cancelled || cur.resisted) return;
      pressSticker(cur.sticker.id);
      onSelect(selected === cur.placement.id ? null : cur.placement.id);
      void stickerStore.update(cur.placement.id, { front: true });
      return;
    }
    if (cur.off) {
      putDown(cur, e.clientX, e.clientY, cancelled);
      return;
    }
    if (cur.view) {
      const { els } = cur;
      cur.view.settleBack(() => els.forEach((el) => el.removeAttribute("data-peeling")));
    }
    const moved = Math.hypot(e.clientX - cur.from.x, e.clientY - cur.from.y) >= TAP_SLOP;
    if (cancelled || moved) return;
    pressSticker(cur.sticker.id);
    onSelect(selected === cur.placement.id ? null : cur.placement.id);
    void stickerStore.update(cur.placement.id, { front: true });
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
      data-dark={dark || undefined}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <div className={styles.clip} data-clip="">
        {placements.map((p) => {
          const s = stickers.get(p.stickerId);
          if (!s) return null;
          const hl = highlight?.stickerId === p.stickerId ? highlight : null;
          const shape = touchShape(s);
          return (
            <div
              key={p.id}
              className={styles.placed}
              style={varsOf(p)}
              data-move={p.id}
              data-glow={(dark && s.sticker.material?.kind === "glow") || undefined}
            >
              <button
                type="button"
                className={styles.grab}
                data-grab={p.id}
                data-sticker={p.stickerId}
                data-empty={shape === "" || undefined}
                aria-label={snsDisplay(s.sticker.snsKind, s.sticker.snsId)}
                aria-pressed={selected === p.id}
                aria-hidden={!owns(p) || undefined}
                tabIndex={owns(p) ? undefined : -1}
                onPointerDown={onPointerDown(p, s)}
                onPointerMove={(e) => {
                  onHover(p, s)(e);
                  onPointerMove(e);
                }}
                onPointerLeave={(e) => e.currentTarget.removeAttribute("data-edge")}
                onPointerUp={(e) => finish(e, false)}
                onPointerCancel={(e) => finish(e, true)}
                onKeyDown={onKeyDown(p)}
              >
                <span
                  key={hl?.nonce ?? 0}
                  ref={hl && owns(p) ? revealPage : undefined}
                  className={styles.art}
                  data-effect={leaving === p.id ? "leave" : hl?.effect}
                  onAnimationEnd={(e) => {
                    if (leaving === p.id && e.animationName.includes("peel")) onLeft();
                  }}
                >
                  <StickerView sticker={s.sticker} scale={0} label="" decorative />
                </span>
                <span
                  className={styles.touch}
                  style={
                    {
                      "--grace": GRACE_DOTS,
                      clipPath: shape ? `url(#${clipIdOf(p.id)})` : undefined,
                    } as CSSProperties
                  }
                />
                {shape && (
                  <svg className={styles.defs} aria-hidden="true" focusable="false">
                    <clipPath id={clipIdOf(p.id)} clipPathUnits="objectBoundingBox">
                      <path d={shape} />
                    </clipPath>
                  </svg>
                )}
              </button>
            </div>
          );
        })}
        {dark && <span className={styles.dark} aria-hidden="true" />}
      </div>
      {placements
        .filter((p) => p.id === selected && leaving !== p.id && owns(p))
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
              aria-label={t.album.handle.label}
              title={t.album.handle.tooltip}
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
