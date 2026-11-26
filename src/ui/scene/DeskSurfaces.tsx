import { useRef, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import type { Placement } from "../../core/album.ts";
import { snsDisplay } from "../../core/sns.ts";
import { SURFACES, spotOf, type DeskShape, type SurfaceKind } from "../../core/surface.ts";
import { stickerStore, type Ready, type StoredSticker } from "../../data/sticker-store.ts";
import { carry, dropTarget } from "../album/carry.ts";
import { paperSound } from "../album/paper-sound.ts";
import { onEdge } from "../album/sticker-touch.ts";
import { feedback } from "../feedback.ts";
import { t } from "../messages.ts";
import { useViewport } from "../effects/useViewport.ts";
import { StickerView } from "../StickerView.tsx";
import { deskLayout } from "./desk-layout.ts";
import styles from "./DeskSurfaces.module.css";
import { availableSurfaces, surfacesSeen } from "./surfaces-seen.ts";

// The desk beside the album: a mat where a few special stickers lie, and the things that arrive
// as one exchanges with more people (a laptop), each a surface stickers can be put on. Stickers
// are taken off by an edge, as on a page, and carried anywhere: back to a page, to the pocket, to
// another surface. A tap selects one. Each thing can be moved about the desk by its base (where no
// sticker is), and stays where it is put.

type Props = {
  readonly snap: Ready;
  readonly selected: string | null;
  readonly onSelect: (placementId: string | null) => void;
};

export function DeskSurfaces({ snap, selected, onSelect }: Props) {
  const seen = useSyncExternalStore(surfacesSeen.subscribe, surfacesSeen.get);
  const layout = useSyncExternalStore(deskLayout.subscribe, deskLayout.get);
  const viewport = useViewport();
  // the same rule as the layout's CSS (orientation): the desk below the book, or beside it
  const shape: DeskShape = viewport.width > viewport.height ? "wide" : "tall";
  const kinds = availableSurfaces();
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  return (
    <div className={styles.band} data-desk="">
      {kinds.map((kind) => (
        <Surface
          key={kind}
          kind={kind}
          shape={shape}
          spot={spotOf(layout[shape], shape, kind)}
          arriving={seen !== null && !seen.includes(kind)}
          placements={snap.placements.filter((p) => p.pageId === SURFACES[kind].id)}
          stickers={byId}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type Grab = {
  readonly pointer: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly placement: Placement;
  readonly sticker: StoredSticker;
  readonly edge: boolean;
  readonly el: HTMLElement;
  readonly box: DOMRect;
  readonly off: boolean;
};

const SLOP = 6;

function Surface(props: {
  readonly kind: SurfaceKind;
  readonly shape: DeskShape;
  readonly spot: { readonly x: number; readonly y: number };
  readonly arriving: boolean;
  readonly placements: readonly Placement[];
  readonly stickers: ReadonlyMap<string, StoredSticker>;
  readonly selected: string | null;
  readonly onSelect: (placementId: string | null) => void;
}) {
  const { kind, shape, spot, arriving, placements, stickers, selected, onSelect } = props;
  const { id, dots } = SURFACES[kind];
  const grab = useRef<Grab | null>(null);
  // moving the thing itself, by its base: follows the finger (CSS variables), saved on letting go
  const shift = useRef<{
    readonly pointer: number;
    readonly from: { readonly x: number; readonly y: number };
    readonly band: DOMRect;
    readonly el: HTMLElement;
    at: { x: number; y: number };
  } | null>(null);

  const baseDown = (e: PointerEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget || shift.current || grab.current) return;
    const band = e.currentTarget.closest<HTMLElement>("[data-desk]")?.getBoundingClientRect();
    if (!band) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute("data-moving", "");
    shift.current = {
      pointer: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      band,
      el: e.currentTarget,
      at: spot,
    };
  };
  const baseMove = (e: PointerEvent<HTMLElement>) => {
    const m = shift.current;
    if (!m || m.pointer !== e.pointerId) return;
    m.at = {
      x: spot.x + (e.clientX - m.from.x) / m.band.width,
      y: spot.y + (e.clientY - m.from.y) / m.band.height,
    };
    m.el.style.setProperty("--at-x", String(m.at.x));
    m.el.style.setProperty("--at-y", String(m.at.y));
  };
  const baseUp = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const m = shift.current;
    if (!m || m.pointer !== e.pointerId) return;
    shift.current = null;
    m.el.removeAttribute("data-moving");
    m.el.style.removeProperty("--at-x");
    m.el.style.removeProperty("--at-y");
    if (!cancelled) deskLayout.put(shape, kind, m.at);
  };

  const down = (p: Placement, s: StoredSticker) => (e: PointerEvent<HTMLButtonElement>) => {
    if (grab.current) return;
    const paper = e.currentTarget.closest<HTMLElement>("[data-surface]");
    const holder = e.currentTarget.closest<HTMLElement>("[data-move]");
    if (!paper || !holder) return;
    const box = paper.getBoundingClientRect();
    const at = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = {
      pointer: e.pointerId,
      from: at,
      placement: p,
      sticker: s,
      edge: onEdge(s, p, box, at, e.pointerType, dots),
      el: holder,
      box,
      off: false,
    };
  };

  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const g = grab.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (g.off) {
      carry.move(e.clientX, e.clientY);
      return;
    }
    if (!g.edge || Math.hypot(e.clientX - g.from.x, e.clientY - g.from.y) < SLOP) return;
    // lifted by its edge: it leaves the surface and follows the finger
    const size = (g.box.width / dots) * 36 * g.placement.scale;
    const centre = {
      x: g.box.left + g.placement.x * g.box.width,
      y: g.box.top + g.placement.y * g.box.height,
    };
    g.el.setAttribute("data-carried", "");
    paperSound.peel();
    carry.pickUp(
      {
        stickerId: g.sticker.id,
        sticker: g.sticker.sticker,
        size,
        rotation: g.placement.rotation,
        offset: { x: centre.x - g.from.x, y: centre.y - g.from.y },
      },
      e.clientX,
      e.clientY,
    );
    grab.current = { ...g, off: true };
  };

  const up = (e: PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const g = grab.current;
    if (!g || g.pointer !== e.pointerId) return;
    grab.current = null;
    if (!g.off) {
      if (!cancelled) onSelect(selected === g.placement.id ? null : g.placement.id);
      return;
    }
    const at = carry.centre(e.clientX, e.clientY);
    const target = cancelled ? undefined : dropTarget(at.x, at.y);
    carry.putDown();
    g.el.removeAttribute("data-carried");
    const { placement, sticker } = g;
    if (target?.kind === "pocket") {
      paperSound.stick();
      void stickerStore
        .unplace(placement.id)
        .then(() => feedback.landed(sticker.id, "pocket", null));
      return;
    }
    if (target?.kind === "page") {
      paperSound.stick();
      void stickerStore
        .moveTo(placement.id, target.pageId, { x: target.x, y: target.y })
        .then(() => feedback.landed(sticker.id, "pressed", null));
    }
  };

  return (
    <section
      className={styles.surface}
      data-kind={kind}
      data-surface={id}
      data-arriving={arriving || undefined}
      aria-label={t.desk[kind]}
      style={{ "--dots": dots, "--x0": spot.x, "--y0": spot.y } as CSSProperties}
      onPointerDown={baseDown}
      onPointerMove={baseMove}
      onPointerUp={(e) => baseUp(e, false)}
      onPointerCancel={(e) => baseUp(e, true)}
      onAnimationEnd={(e) => {
        if (arriving && e.animationName.includes("arrive")) surfacesSeen.arrived(kind);
      }}
    >
      {placements
        .toSorted((a, b) => a.z - b.z)
        .map((p) => {
          const s = stickers.get(p.stickerId);
          if (!s) return null;
          return (
            <div
              key={p.id}
              className={styles.placed}
              data-move={p.id}
              style={
                {
                  "--x": p.x,
                  "--y": p.y,
                  "--r": `${p.rotation}deg`,
                  "--s": p.scale,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className={styles.grab}
                aria-label={snsDisplay(s.sticker.snsKind, s.sticker.snsId)}
                aria-pressed={selected === p.id}
                onPointerDown={down(p, s)}
                onPointerMove={move}
                onPointerUp={(e) => up(e, false)}
                onPointerCancel={(e) => up(e, true)}
              >
                <StickerView sticker={s.sticker} scale={0} label="" decorative />
              </button>
            </div>
          );
        })}
    </section>
  );
}
