import {
  useReducer,
  useRef,
  useSyncExternalStore,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { sortedPages } from "../../core/album.ts";
import { stickerStore } from "../../data/sticker-store.ts";
import { ActionBar } from "../ActionBar.tsx";
import { Album } from "../album/Album.tsx";
import { CarryLayer } from "../album/CarryLayer.tsx";
import { DrawerDialog } from "../album/DrawerDialog.tsx";
import { pagePosition } from "../album/page-position.ts";
import { PocketDialog } from "../album/PocketDialog.tsx";
import { initialState, reducer } from "../app-state.ts";
import common from "../common.module.css";
import { BackDialog } from "../dialogs/back/BackDialog.tsx";
import { PeopleDialog } from "../dialogs/people/PeopleDialog.tsx";
import { QrDialog } from "../dialogs/QrDialog.tsx";
import { putInDrawer } from "../drawer.ts";
import { feedback } from "../feedback.ts";
import { debugText } from "../messages.ts";
import { contentOf, pocketOf } from "./room-content.ts";
import { createRoom, type Room, type ScreenBox, type Weather } from "./room-scene.ts";
import styles from "./Room3D.module.css";

// Debug builds only (`?room`): the three-dimensional desk, to try the idea before deciding on it.
// The album on it is the real one: its open spread is painted on the 3D pages; tapped, the camera
// comes down over it and the 2D album is laid over it to work on (peel, stick, turn), until a tap
// beside it (or a pinch) goes back to the desk. The drawer and the pocket on the desk are the
// real ones too.
// A weak device is warned (and drawn lighter): from what the browser says of it, and from how
// fast it actually draws.

type Nav = Navigator & { readonly deviceMemory?: number };

// what the browser says of the device
const weakByHints = (): boolean => {
  const n = navigator as Nav;
  return (n.deviceMemory !== undefined && n.deviceMemory < 4) || (n.hardwareConcurrency ?? 8) <= 4;
};

const WEATHERS: readonly Weather[] = ["clear", "cloudy", "rain", "snow"];

type Controls = {
  readonly hour: number;
  readonly month: number;
  readonly weather: Weather;
  readonly editing: boolean;
  readonly light: boolean;
  readonly slow: boolean;
};

// seen from where: the whole desk, on the way down to the album, close over it, on the way back
type Zoom = "desk" | "going" | "close" | "leaving";

// the drawer and the pocket open only with something in them
const holds = (what: "drawer" | "pocket"): boolean => {
  const s = stickerStore.getSnapshot();
  if (s.status !== "ready") return false;
  return (what === "drawer" ? s.drawer : pocketOf(s)).length > 0;
};

// the 2D album's book, on the screen
const bookBox = (el: HTMLElement): ScreenBox | null => {
  const book = el.querySelector("[data-open]");
  if (!book) return null;
  const r = book.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

type Pinch = {
  readonly points: ReadonlyMap<number, { readonly x: number; readonly y: number }>;
  readonly start: number;
};

const spanOf = (p: Pinch["points"]): number => {
  const [a, b] = [...p.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

export function Room3D() {
  const room = useRef<Room | null>(null);
  const pinch = useRef<Pinch>({ points: new Map(), start: 0 });
  const [c, set] = useReducer((s: Controls, next: Partial<Controls>) => ({ ...s, ...next }), {
    hour: 10,
    month: 5,
    weather: "clear",
    editing: false,
    light: weakByHints(),
    slow: false,
  });
  // what the controls were last set to, for a scene rebuilt (lighter) to start from
  const latest = useRef(c);
  const [zoom, setZoom] = useReducer((_: Zoom, next: Zoom) => next, "desk");
  const [app, dispatch] = useReducer(reducer, initialState);
  const snap = useSyncExternalStore(stickerStore.subscribe, stickerStore.getSnapshot);
  const { highlight } = useSyncExternalStore(feedback.subscribe, feedback.get);

  // the scene lives as long as its box; rebuilt lighter if asked
  const mount = (host: HTMLDivElement | null) => {
    if (!host) return undefined;
    const r = createRoom(host, {
      light: c.light,
      onAlbum: () => setZoom("going"),
      onDrawer: () => {
        if (holds("drawer")) dispatch({ type: "open", overlay: { kind: "drawer" } });
      },
      onPocket: () => {
        if (holds("pocket")) dispatch({ type: "open", overlay: { kind: "pocket" } });
      },
    });
    room.current = r;
    r.setTime(latest.current.hour, latest.current.month);
    r.setWeather(latest.current.weather);
    r.setEditing(latest.current.editing);
    // the album's data on the desk, kept up with the store and with the spread lying open
    const show = () => {
      const s = stickerStore.getSnapshot();
      if (s.status === "ready") r.setContent(contentOf(s, pagePosition.spread()));
    };
    const stopStore = stickerStore.subscribe(show);
    const stopTurn = pagePosition.subscribe(show);
    show();
    // for tests: where the things are on the screen, to tap them
    Object.assign(window, { __room: { where: r.where, drawerOpen: r.drawerOpen } });
    // drawn too slowly over its first seconds: a weak device after all
    const check = setTimeout(() => {
      if (r.fps() < 30) set({ slow: true });
    }, 3000);
    return () => {
      clearTimeout(check);
      stopStore();
      stopTurn();
      Reflect.deleteProperty(window, "__room");
      r.dispose();
      room.current = null;
    };
  };

  // the 2D album laid over the 3D one: once it is laid out, the camera comes down until the 3D
  // spread lies under it; when the book slides (a narrow screen shows one half) or the screen
  // turns, the camera follows
  const lay = (el: HTMLDivElement | null) => {
    if (!el) return undefined;
    const box = bookBox(el);
    if (!box || !room.current?.zoomIn(box, () => setZoom("close"))) {
      setZoom("desk");
      return undefined;
    }
    const follow = () => {
      const now = bookBox(el);
      if (now && el.dataset.zoom === "close") room.current?.zoomIn(now, () => undefined);
    };
    const stop = new AbortController();
    el.addEventListener(
      "transitionend",
      (e) => {
        if (e.target instanceof HTMLElement && e.target.hasAttribute("data-open")) follow();
      },
      { signal: stop.signal },
    );
    addEventListener("resize", follow, { signal: stop.signal });
    return () => stop.abort();
  };

  const leave = () => {
    if (zoom !== "close") return;
    setZoom("leaving");
    dispatch({ type: "select", placementId: null });
    room.current?.zoomOut(() => setZoom("desk"));
  };

  // two fingers brought together over the album: back to the desk
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const points = new Map(pinch.current.points).set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = { points, start: spanOf(points) };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pinch.current;
    if (!p.points.has(e.pointerId)) return;
    const points = new Map(p.points).set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = { ...p, points };
    if (points.size === 2 && p.start > 0 && spanOf(points) < p.start * 0.7) leave();
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const points = new Map(pinch.current.points);
    points.delete(e.pointerId);
    pinch.current = { points, start: spanOf(points) };
  };
  // a trackpad's pinch outward, or the wheel turned back beside the book
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.deltaY > 0 && (e.ctrlKey || e.target === e.currentTarget)) leave();
  };

  const change = (next: Partial<Controls>) => {
    const s = { ...c, ...next };
    latest.current = s;
    set(next);
    room.current?.setTime(s.hour, s.month);
    room.current?.setWeather(s.weather);
    room.current?.setEditing(s.editing);
  };

  const ready = snap.status === "ready" ? snap : null;
  const stickers = ready?.stickers ?? [];
  const overlay = app.overlay;
  const opened = app.opened;
  const close = () => dispatch({ type: "close", opened });
  const selectedPlacement = ready?.placements.find((p) => p.id === app.selected);
  const selectedSticker = stickers.find((s) => s.id === selectedPlacement?.stickerId);
  const qrSticker =
    overlay.kind === "qr" ? stickers.find((s) => s.id === overlay.stickerId) : undefined;
  const backSticker =
    overlay.kind === "back" ? stickers.find((s) => s.id === overlay.stickerId) : undefined;
  const onLeft = () => {
    const leaving = app.leaving;
    dispatch({ type: "left" });
    if (leaving) void putInDrawer(leaving.stickerId);
  };

  return (
    <div className={styles.page} data-room-zoom={zoom} data-room-ready={ready ? "" : undefined}>
      <div key={c.light ? "light" : "full"} ref={mount} className={styles.stage} />
      {ready && zoom !== "desk" && (
        <div
          ref={lay}
          className={styles.close}
          data-zoom={zoom}
          inert={zoom !== "close"}
          onClick={(e) => {
            if (e.target === e.currentTarget) leave();
          }}
          onPointerDownCapture={onPointerDown}
          onPointerMoveCapture={onPointerMove}
          onPointerUpCapture={onPointerEnd}
          onPointerCancelCapture={onPointerEnd}
          onWheel={onWheel}
        >
          <div className={styles.album}>
            <Album
              snap={ready}
              selected={app.selected}
              highlight={highlight}
              leaving={app.leaving?.placementId ?? null}
              onSelect={(placementId) => dispatch({ type: "select", placementId })}
              onLeft={onLeft}
            />
          </div>
        </div>
      )}
      {(c.slow || weakByHints()) && zoom === "desk" && (
        <p className={styles.warn} role="status">
          {debugText.room.weak}
          {!c.light && (
            <button type="button" className={common.button} onClick={() => set({ light: true })}>
              {debugText.room.lighter}
            </button>
          )}
        </p>
      )}
      {/* folded away by default, so the desk's front (the drawer) can be seen on a small screen */}
      <details className={styles.panel} hidden={zoom !== "desk"}>
        <summary className={styles.summary}>{debugText.room.controls}</summary>
        <div className={styles.controls}>
          <label className={styles.field}>
            <span>{debugText.room.hour(c.hour)}</span>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={c.hour}
              onChange={(e) => change({ hour: Number(e.currentTarget.value) })}
            />
          </label>
          <label className={styles.field}>
            <span>{debugText.room.month(c.month)}</span>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={c.month}
              onChange={(e) => change({ month: Number(e.currentTarget.value) })}
            />
          </label>
          <div className={common.row} role="radiogroup" aria-label={debugText.room.weather}>
            {WEATHERS.map((w) => (
              <button
                key={w}
                type="button"
                role="radio"
                aria-checked={c.weather === w}
                className={common.button}
                data-on={c.weather === w || undefined}
                onClick={() => change({ weather: w })}
              >
                {debugText.room.weathers[w]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={common.button}
            aria-pressed={c.editing}
            data-on={c.editing || undefined}
            onClick={() => change({ editing: !c.editing })}
          >
            {debugText.room.edit}
          </button>
          <p className={common.muted}>{debugText.room.hint}</p>
        </div>
      </details>
      {zoom === "close" && selectedPlacement && selectedSticker && !app.leaving && (
        <ActionBar
          key={selectedPlacement.id}
          sticker={selectedSticker}
          onQr={() =>
            dispatch({ type: "open", overlay: { kind: "qr", stickerId: selectedSticker.id } })
          }
          onBack={() =>
            dispatch({ type: "open", overlay: { kind: "back", stickerId: selectedSticker.id } })
          }
          onDiscard={() =>
            dispatch({
              type: "leave",
              placementId: selectedPlacement.id,
              stickerId: selectedSticker.id,
            })
          }
        />
      )}
      <CarryLayer />
      {qrSticker && (
        <QrDialog key={opened} initial={qrSticker} mine={[]} to={undefined} onClose={close} />
      )}
      {backSticker && (
        <BackDialog
          key={opened}
          sticker={backSticker}
          all={stickers}
          onPerson={(focus) => dispatch({ type: "open", overlay: { kind: "people", focus } })}
          onClose={close}
        />
      )}
      {overlay.kind === "people" && (
        <PeopleDialog key={opened} stickers={stickers} focus={overlay.focus} onClose={close} />
      )}
      {ready && overlay.kind === "drawer" && (
        <DrawerDialog key={opened} stickers={ready.drawer} onClose={close} />
      )}
      {ready && overlay.kind === "pocket" && (
        <PocketDialog
          key={opened}
          stickers={pocketOf(ready)}
          pageIds={sortedPages(ready.pages).map((p) => p.id)}
          onClose={close}
        />
      )}
    </div>
  );
}
