import { Drawer } from "./album/Drawer.tsx";
import { DrawerDialog } from "./album/DrawerDialog.tsx";
import { lazy, Suspense, useReducer, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "../data/platform.ts";
import { sortedPages } from "../core/album.ts";
import { layoutAlbum } from "../core/print.ts";
import { stickerStore, type AddResult } from "../data/sticker-store.ts";
import { ActionBar } from "./ActionBar.tsx";
import { PageIndicator } from "./album/PageIndicator.tsx";
import { CarryLayer } from "./album/CarryLayer.tsx";
import { Pocket } from "./album/Pocket.tsx";
import { PocketDialog } from "./album/PocketDialog.tsx";
import { initialState, reducer } from "./app-state.ts";
import styles from "./App.module.css";
import common from "./common.module.css";
import { CreateDialog } from "./dialogs/create/CreateDialog.tsx";
import { backupDue, backupMarkCache } from "./dialogs/menu/backup-mark.ts";
import { MenuDialog } from "./dialogs/menu/MenuDialog.tsx";
import { PrintDialog } from "./dialogs/print/PrintDialog.tsx";
import { QrDialog } from "./dialogs/QrDialog.tsx";
import { BackDialog } from "./dialogs/back/BackDialog.tsx";
import { DebugDialog } from "./dialogs/debug/DebugDialog.tsx";
import { availableMaterials, materialsSeen } from "./dialogs/create/materials-seen.ts";
import { debug } from "./debug.ts";
import { DEBUG_BUILD } from "./debug-build.ts";
import { daylight } from "./scene/clock.ts";
import { lightStyle } from "./scene/light-style.ts";
import { DaylightLayer } from "./scene/Room.tsx";
import { DeskView } from "./scene/DeskView.tsx";
import { PeopleDialog } from "./dialogs/people/PeopleDialog.tsx";
import { PrinterCopy } from "./dialogs/print/Sheets.tsx";
import { feedback } from "./feedback.ts";
import { debugText, t } from "./messages.ts";
import { printMode } from "./print-mode.ts";
import { PixelIcon } from "./PixelIcon.tsx";
import { Stamp } from "./Stamp.tsx";
import { Tutorial } from "./tutorial/Tutorial.tsx";
import {
  friendReads,
  givesBack,
  makesAtOnce,
  takeDemoQr,
  tutorial,
} from "./tutorial/tutorial-store.ts";
import { flowPanel } from "./flows/flow-panel.ts";
import { events } from "../data/events.ts";
import { Toast } from "./Toast.tsx";
import { putInDrawer } from "./drawer.ts";

const hasImage = (dt: DataTransfer) =>
  Array.from(dt.items).some(
    (i) => i.kind === "file" && (i.type === "" || i.type.startsWith("image/")),
  );

// Debug builds only: the flow view (the build flag is written out here so that a production
// build leaves the panel's chunk out, as main.tsx does for the sample page).
const FlowPanel =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG === "1"
    ? lazy(() => import("./flows/FlowPanel.tsx").then((m) => ({ default: m.FlowPanel })))
    : null;

export function App() {
  const snap = useSyncExternalStore(stickerStore.subscribe, stickerStore.getSnapshot);
  const mark = useSyncExternalStore(backupMarkCache.subscribe, backupMarkCache.get);
  const { toast, highlight, stamp } = useSyncExternalStore(feedback.subscribe, feedback.get);
  const printing = useSyncExternalStore(printMode.subscribe, printMode.get);
  const [state, dispatch] = useReducer(reducer, initialState);
  const debugOn = useSyncExternalStore(debug.subscribe, () => debug.get().on);
  const day = useSyncExternalStore(daylight.subscribe, daylight.get);
  const flowsOpen = useSyncExternalStore(flowPanel.subscribe, flowPanel.open);
  const tutorialReads = useSyncExternalStore(tutorial.subscribe, friendReads);
  const atOnce = useSyncExternalStore(tutorial.subscribe, makesAtOnce);
  const seenMaterials = useSyncExternalStore(materialsSeen.subscribe, materialsSeen.get);
  useSyncExternalStore(debug.subscribe, debug.get);

  const [dropping, setDropping] = useReducer((_: boolean, next: boolean) => next, false);

  const openCreate = (with_: { readonly file?: File; readonly returnTo?: string } = {}) => {
    events.emit({ type: "create.opened" });
    // brought by a link, the tutorial's one is made to give back to the sticker that came
    const back = givesBack() ? stickers.find((s) => s.origin === "received")?.id : undefined;
    const returnTo = with_.returnTo ?? back;
    dispatch({
      type: "open",
      overlay: { kind: "create", ...with_, ...(returnTo ? { returnTo } : {}) },
    });
  };

  const onSaved = (stickerId: string, result: AddResult) => {
    events.emit({ type: "sticker.created", stickerId });
    feedback.landed(stickerId, result.kind === "added" ? "pocket" : "wiggle", null);
    // made to give back for one just received: its QR comes up at once
    const returnTo = state.overlay.kind === "create" ? state.overlay.returnTo : undefined;
    if (returnTo) dispatch({ type: "open", overlay: { kind: "qr", stickerId, returnTo } });
    // the first time through: one's first sticker comes up as its QR, for a friend to read
    else if (friendReads()) dispatch({ type: "open", overlay: { kind: "qr", stickerId } });
  };

  const onLeft = () => {
    const leaving = state.leaving;
    dispatch({ type: "left" });
    if (leaving) void putInDrawer(leaving.stickerId);
  };

  if (snap.status === "error") {
    return <p className={`${common.warn} ${styles.error}`}>{t.app.storageUnavailable}</p>;
  }
  const ready = snap.status === "ready" ? snap : null;
  // a material has opened up that the maker has not met yet
  const newMaterial =
    ready !== null && availableMaterials().some((k) => !seenMaterials.includes(k));
  const stickers = ready?.stickers ?? [];
  const mine = stickers.filter((s) => s.origin === "mine");
  const placed = new Set(ready?.placements.map((p) => p.stickerId));
  const pocket = stickers.filter((s) => !placed.has(s.id)).toReversed();
  const selectedPlacement = ready?.placements.find((p) => p.id === state.selected);
  const selectedSticker = stickers.find((s) => s.id === selectedPlacement?.stickerId);
  const menuDot = (isIos() && !isStandalone()) || backupDue(stickers.length - mine.length, mark);
  const overlay = state.overlay;
  const qrSticker =
    overlay.kind === "qr" ? stickers.find((s) => s.id === overlay.stickerId) : undefined;
  const backSticker =
    overlay.kind === "back" ? stickers.find((s) => s.id === overlay.stickerId) : undefined;
  const opened = state.opened;
  const close = () => dispatch({ type: "close", opened });
  return (
    <div className={styles.shell}>
      <nav className={styles.toolbar} aria-label={t.app.toolbar} data-toolbar="">
        <PageIndicator count={Math.max(1, ready?.pages.length ?? 0)} />
        <button
          type="button"
          className={`${common.icon} ${styles.menu}`}
          aria-label={t.app.create.label}
          aria-description={newMaterial ? t.app.newMaterial : undefined}
          title={newMaterial ? t.app.newMaterial : t.app.create.tooltip}
          data-dot={newMaterial || undefined}
          onClick={() => openCreate()}
        >
          <PixelIcon name="create" />
        </button>
        {stickers.length > 0 && (
          <button
            type="button"
            className={common.icon}
            aria-label={t.app.print}
            title={t.app.print}
            onClick={() => dispatch({ type: "open", overlay: { kind: "print" } })}
          >
            <PixelIcon name="print" />
          </button>
        )}
        {DEBUG_BUILD && debugOn && (
          <button
            type="button"
            className={common.icon}
            aria-label={debugText.open}
            title={debugText.open}
            onClick={() => dispatch({ type: "open", overlay: { kind: "debug" } })}
          >
            <PixelIcon name="debug" />
          </button>
        )}
        <button
          type="button"
          className={`${common.icon} ${styles.menu}`}
          aria-label={t.app.menu}
          title={t.app.menu}
          data-dot={menuDot || undefined}
          onClick={() => dispatch({ type: "open", overlay: { kind: "menu" } })}
        >
          <PixelIcon name="menu" />
        </button>
      </nav>

      <main
        className={styles.main}
        style={lightStyle(day.light)}
        data-phase={day.phase}
        data-dropping={dropping || undefined}
        onDragOver={(e) => {
          if (!hasImage(e.dataTransfer)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          setDropping(false);
          const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
          if (!file) return;
          e.preventDefault();
          openCreate({ file });
        }}
      >
        {ready && (
          <DeskView
            snap={ready}
            selected={state.selected}
            highlight={highlight}
            leaving={state.leaving?.placementId ?? null}
            onSelect={(placementId) => dispatch({ type: "select", placementId })}
            onLeft={onLeft}
          />
        )}
        {ready && (
          <Drawer
            stickers={ready.drawer}
            highlight={highlight}
            onOpen={() => dispatch({ type: "open", overlay: { kind: "drawer" } })}
          />
        )}
        {ready && stickers.length > 0 && (
          <Pocket
            stickers={pocket}
            highlight={highlight}
            onOpen={() => dispatch({ type: "open", overlay: { kind: "pocket" } })}
          />
        )}
        <DaylightLayer light={day.light} />
      </main>

      {selectedPlacement && selectedSticker && !state.leaving && (
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
      <Tutorial />
      {FlowPanel && flowsOpen && (
        <Suspense fallback={null}>
          <FlowPanel />
        </Suspense>
      )}
      {stamp && <Stamp key={stamp.id} stamp={stamp} onDone={() => feedback.unstamp(stamp.id)} />}
      {toast && (
        <Toast
          key={toast.id}
          toast={toast}
          onAction={() => {
            feedback.dismiss(toast.id);
            const action = toast.action;
            if (action?.kind === "create") {
              openCreate({ returnTo: action.from });
            }
            // one's own sticker made last is the one most likely meant to be given
            const latest = mine.toSorted((a, b) => b.addedSeq - a.addedSeq)[0];
            if (action?.kind === "return" && latest) {
              dispatch({
                type: "open",
                overlay: { kind: "qr", stickerId: latest.id, returnTo: action.from },
              });
            }
          }}
          onDismiss={() => feedback.dismiss(toast.id)}
        />
      )}

      {overlay.kind === "create" && (
        <CreateDialog
          key={opened}
          file={overlay.file}
          onClose={() => {
            events.emit({ type: "create.closed" });
            close();
            // the tutorial's making put away with nothing made: a sample stands in, its QR read
            const demo = stickers.find((s) => s.origin === "sample");
            if (takeDemoQr() && demo) {
              dispatch({ type: "open", overlay: { kind: "qr", stickerId: demo.id } });
            }
          }}
          onSaved={onSaved}
          quick={atOnce}
        />
      )}
      {qrSticker && overlay.kind === "qr" && (
        <QrDialog
          key={opened}
          initial={qrSticker}
          mine={overlay.returnTo ? mine : []}
          to={stickers.find((s) => s.id === overlay.returnTo)?.sticker}
          friendReads={tutorialReads}
          onClose={() => {
            events.emit({ type: "qr.closed" });
            close();
          }}
        />
      )}
      {ready && overlay.kind === "print" && (
        <PrintDialog key={opened} album={ready} onClose={close} />
      )}
      {overlay.kind === "menu" && (
        <MenuDialog
          key={opened}
          onClose={close}
          onPeople={() => dispatch({ type: "open", overlay: { kind: "people" } })}
        />
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
      {DEBUG_BUILD && overlay.kind === "debug" && <DebugDialog key={opened} onClose={close} />}
      {ready && overlay.kind === "drawer" && (
        <DrawerDialog key={opened} stickers={ready.drawer} onClose={close} />
      )}
      {ready && overlay.kind === "pocket" && (
        <PocketDialog
          key={opened}
          stickers={pocket}
          pageIds={sortedPages(ready.pages).map((p) => p.id)}
          onClose={close}
        />
      )}
      {printing && ready && overlay.kind !== "print" && (
        <PrinterCopy
          sheets={layoutAlbum(ready.pages, ready.placements)}
          stickers={ready.stickers}
          cutLine={false}
        />
      )}
    </div>
  );
}
