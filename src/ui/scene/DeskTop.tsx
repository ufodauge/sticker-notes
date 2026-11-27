import { useRef, type CSSProperties, type PointerEvent } from "react";
import type { Placement } from "../../core/album.ts";
import { nameOf } from "../sticker-name.ts";
import { SURFACES, dotsOf, localOf, screenOf, type SurfaceKind } from "../../core/surface.ts";
import { stickerStore, type Ready, type StoredSticker } from "../../data/sticker-store.ts";
import { carry, dropTarget } from "../album/carry.ts";
import { paperSound } from "../album/paper-sound.ts";
import { onEdge } from "../album/sticker-touch.ts";
import { feedback } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import styles from "./DeskTop.module.css";
import { frameOf } from "./frame.ts";

// The top of the desk the album lies on: stickers can be stuck anywhere on the bare wood. They are
// taken off by an edge, as on a page, and carried anywhere; a tap selects one.

type Props = {
  readonly snap: Ready;
  readonly selected: string | null;
  readonly onSelect: (placementId: string | null) => void;
};

const onSurface = (snap: Ready, kind: SurfaceKind) =>
  snap.placements.filter((p) => p.pageId === SURFACES[kind].id);

// The bare desk: as wide as the area around the album, under everything else on it.
export function DeskPlane({ snap, selected, onSelect }: Props) {
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  return (
    <section
      className={styles.plane}
      data-surface={SURFACES.desk.id}
      data-desk-top=""
      data-angle={0}
      aria-label={t.desk.desk}
      style={{ "--dots": dotsOf("desk") } as CSSProperties}
    >
      <StickersOn
        kind="desk"
        placements={onSurface(snap, "desk")}
        stickers={byId}
        selected={selected}
        onSelect={onSelect}
      />
    </section>
  );
}

const SLOP = 6;

type Grab = {
  readonly pointer: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly placement: Placement;
  readonly sticker: StoredSticker;
  readonly edge: boolean;
  readonly el: HTMLElement;
  readonly surface: HTMLElement;
  readonly off: boolean;
};

// The stickers on one surface. Where a point lies on the surface is worked out as it lies
// unturned, so a turned thing is grabbed by its stickers' real edges.
function StickersOn(props: {
  readonly kind: SurfaceKind;
  readonly placements: readonly Placement[];
  readonly stickers: ReadonlyMap<string, StoredSticker>;
  readonly selected: string | null;
  readonly onSelect: (placementId: string | null) => void;
}) {
  const { kind, placements, stickers, selected, onSelect } = props;
  const dots = dotsOf(kind);
  const grab = useRef<Grab | null>(null);

  const down = (p: Placement, s: StoredSticker) => (e: PointerEvent<HTMLButtonElement>) => {
    if (grab.current) return;
    const surface = e.currentTarget.closest<HTMLElement>("[data-surface]");
    const holder = e.currentTarget.closest<HTMLElement>("[data-move]");
    if (!surface || !holder) return;
    const f = frameOf(surface);
    const { u, v } = localOf(f, e.clientX, e.clientY);
    const box = { left: f.cx - f.w / 2, top: f.cy - f.h / 2, width: f.w, height: f.h };
    const at = { x: box.left + u * f.w, y: box.top + v * f.h };
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = {
      pointer: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      placement: p,
      sticker: s,
      edge: onEdge(s, p, box, at, e.pointerType, dots),
      el: holder,
      surface,
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
    const f = frameOf(g.surface);
    const centre = screenOf(f, g.placement.x, g.placement.y);
    g.el.setAttribute("data-carried", "");
    paperSound.peel();
    carry.pickUp(
      {
        stickerId: g.sticker.id,
        sticker: g.sticker.sticker,
        size: (f.w / dots) * 36 * g.placement.scale,
        rotation: g.placement.rotation + f.angle,
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

  return placements
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
              "--px": p.x,
              "--py": p.y,
              "--pr": `${p.rotation}deg`,
              "--s": p.scale,
            } as CSSProperties
          }
        >
          <button
            type="button"
            className={styles.grab}
            aria-label={nameOf(s.sticker)}
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
    });
}
