import {
  useReducer,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
} from "react";
import type { Placement } from "../../core/album.ts";
import { snsDisplay } from "../../core/sns.ts";
import {
  SURFACES,
  dotsOf,
  localOf,
  screenOf,
  spotOf,
  type DeskShape,
  type Spot,
  type SurfaceKind,
  type ThingKind,
} from "../../core/surface.ts";
import { stickerStore, type Ready, type StoredSticker } from "../../data/sticker-store.ts";
import { carry, dropTarget } from "../album/carry.ts";
import { paperSound } from "../album/paper-sound.ts";
import { onEdge } from "../album/sticker-touch.ts";
import { useViewport } from "../effects/useViewport.ts";
import { feedback } from "../feedback.ts";
import { t } from "../messages.ts";
import { StickerView } from "../StickerView.tsx";
import { deskLayout } from "./desk-layout.ts";
import styles from "./DeskTop.module.css";
import { frameOf } from "./frame.ts";
import { availableSurfaces, surfacesSeen } from "./surfaces-seen.ts";

// The top of the desk the album lies on. Stickers can be stuck anywhere on the bare wood, and on
// the things lying on it (a notebook, and a laptop that arrives as one exchanges with more
// people). A thing is moved by its base (where no sticker lies) and, tapped, shows a handle to
// turn it; it stays as it is left. Stickers are taken off by an edge, as on a page, and carried
// anywhere; a tap selects one.

type Props = {
  readonly snap: Ready;
  readonly selected: string | null;
  readonly onSelect: (placementId: string | null) => void;
};

const onSurface = (snap: Ready, kind: SurfaceKind) =>
  snap.placements.filter((p) => p.pageId === SURFACES[kind].id);

// the same rule as the album's own layout: two pages side by side, or one at a time
const deskShape = (width: number, height: number): DeskShape =>
  width / height >= 23 / 20 && width >= 700 ? "wide" : "tall";

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

export function Things({ snap, selected, onSelect }: Props) {
  const seen = useSyncExternalStore(surfacesSeen.subscribe, surfacesSeen.get);
  const layout = useSyncExternalStore(deskLayout.subscribe, deskLayout.get);
  const viewport = useViewport();
  const shape = deskShape(viewport.width, viewport.height);
  // the thing showing its turning handle
  const [chosen, choose] = useReducer(
    (now: ThingKind | null, next: ThingKind | null) => (now === next ? null : next),
    null,
  );
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  return availableSurfaces()
    .filter((k): k is ThingKind => k !== "desk")
    .map((kind) => (
      <Thing
        key={kind}
        kind={kind}
        shape={shape}
        spot={spotOf(layout[shape], shape, kind)}
        arriving={seen !== null && !seen.includes(kind)}
        chosen={chosen === kind}
        onChoose={() => choose(kind)}
      >
        <StickersOn
          kind={kind}
          placements={onSurface(snap, kind)}
          stickers={byId}
          selected={selected}
          onSelect={onSelect}
        />
      </Thing>
    ));
}

const SLOP = 6;

type Handling = {
  readonly pointer: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly el: HTMLElement;
  readonly mode: "move" | "turn";
  // pixels to a page, as the thing is shown
  readonly page: number;
  readonly centre: { readonly x: number; readonly y: number };
  readonly startAngle: number;
  moved: boolean;
  spot: Spot;
};

function Thing(props: {
  readonly kind: ThingKind;
  readonly shape: DeskShape;
  readonly spot: Spot;
  readonly arriving: boolean;
  readonly chosen: boolean;
  readonly onChoose: () => void;
  readonly children: React.ReactNode;
}) {
  const { kind, shape, spot, arriving, chosen, onChoose, children } = props;
  const { id, w, h } = SURFACES[kind];
  const handling = useRef<Handling | null>(null);

  const start = (e: PointerEvent<HTMLElement>, el: HTMLElement, mode: Handling["mode"]) => {
    const f = frameOf(el);
    e.currentTarget.setPointerCapture(e.pointerId);
    handling.current = {
      pointer: e.pointerId,
      from: { x: e.clientX, y: e.clientY },
      el,
      mode,
      page: f.w / w,
      centre: { x: f.cx, y: f.cy },
      startAngle: Math.atan2(e.clientY - f.cy, e.clientX - f.cx),
      moved: false,
      spot,
    };
  };
  const follow = (e: PointerEvent<HTMLElement>) => {
    const m = handling.current;
    if (!m || m.pointer !== e.pointerId) return;
    const dx = e.clientX - m.from.x;
    const dy = e.clientY - m.from.y;
    if (!m.moved && Math.hypot(dx, dy) < SLOP) return;
    m.moved = true;
    m.el.setAttribute("data-handling", "");
    if (m.mode === "move") {
      m.spot = { ...spot, x: spot.x + dx / m.page, y: spot.y + dy / m.page };
    } else {
      const now = Math.atan2(e.clientY - m.centre.y, e.clientX - m.centre.x);
      m.spot = { ...spot, r: spot.r + ((now - m.startAngle) * 180) / Math.PI };
    }
    m.el.style.setProperty("--x", String(m.spot.x));
    m.el.style.setProperty("--y", String(m.spot.y));
    m.el.style.setProperty("--r", `${m.spot.r}deg`);
    m.el.dataset.angle = String(m.spot.r);
  };
  const end = (e: PointerEvent<HTMLElement>, cancelled: boolean) => {
    const m = handling.current;
    if (!m || m.pointer !== e.pointerId) return;
    handling.current = null;
    m.el.removeAttribute("data-handling");
    if (!m.moved) {
      if (!cancelled && m.mode === "move") onChoose();
      return;
    }
    if (cancelled) {
      m.el.style.setProperty("--x", String(spot.x));
      m.el.style.setProperty("--y", String(spot.y));
      m.el.style.setProperty("--r", `${spot.r}deg`);
      m.el.dataset.angle = String(spot.r);
      return;
    }
    deskLayout.put(shape, kind, m.spot);
  };

  return (
    <section
      className={styles.thing}
      data-kind={kind}
      data-thing=""
      data-surface={id}
      data-angle={spot.r}
      data-arriving={arriving || undefined}
      data-chosen={chosen || undefined}
      aria-label={t.desk[kind]}
      style={
        {
          "--x": spot.x,
          "--y": spot.y,
          "--r": `${spot.r}deg`,
          "--w": w,
          "--h": h,
          "--dots": dotsOf(kind),
        } as CSSProperties
      }
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !handling.current) start(e, e.currentTarget, "move");
      }}
      onPointerMove={follow}
      onPointerUp={(e) => end(e, false)}
      onPointerCancel={(e) => end(e, true)}
      onAnimationEnd={(e) => {
        if (arriving && e.animationName.includes("arrive")) surfacesSeen.arrived(kind);
      }}
    >
      {children}
      {chosen && (
        <button
          type="button"
          className={styles.turn}
          aria-label={t.desk.turn}
          title={t.desk.turn}
          onPointerDown={(e) => {
            const thing = e.currentTarget.closest<HTMLElement>("[data-thing]");
            if (thing && !handling.current) start(e, thing, "turn");
          }}
          onPointerMove={follow}
          onPointerUp={(e) => end(e, false)}
          onPointerCancel={(e) => end(e, true)}
        />
      )}
    </section>
  );
}

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
    });
}
