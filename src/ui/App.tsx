import {
  BookOpen,
  Bug,
  Ellipsis,
  FlaskRound,
  ImagePlus,
  Lightbulb,
  LightbulbOff,
  Printer,
} from "lucide-react";
import { Suspense, use, useReducer, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "../data/platform.ts";
import { writeViewHint } from "../data/view-hint.ts";
import { sortedPages } from "../core/album.ts";
import { layoutAlbum } from "../core/print.ts";
import { settings, stickerStore, type AddResult } from "../data/sticker-store.ts";
import { ActionBar } from "./ActionBar.tsx";
import { Album } from "./album/Album.tsx";
import { PageIndicator } from "./album/PageIndicator.tsx";
import { CarryLayer } from "./album/CarryLayer.tsx";
import { lights } from "./album/lights.ts";
import { Pocket } from "./album/Pocket.tsx";
import { PocketDialog } from "./album/PocketDialog.tsx";
import { initialState, reducer, type View } from "./app-state.ts";
import styles from "./App.module.css";
import common from "./common.module.css";
import { blockSelection } from "./jar/block-selection.ts";
import { jarChrome } from "./jar/chrome.ts";
import { startupPrefs } from "./jar/jar-prefs.ts";
import { jarSound } from "./jar/sound.ts";
import { JarFrame } from "./jar/JarFrame.tsx";
import { JarView } from "./jar/jar-lazy.ts";
import { CreateDialog } from "./dialogs/create/CreateDialog.tsx";
import { backupDue, backupMarkCache } from "./dialogs/menu/backup-mark.ts";
import { JarPickDialog } from "./dialogs/jar/JarPickDialog.tsx";
import { MenuDialog } from "./dialogs/menu/MenuDialog.tsx";
import { PrintDialog } from "./dialogs/print/PrintDialog.tsx";
import { QrDialog } from "./dialogs/QrDialog.tsx";
import { BackDialog } from "./dialogs/back/BackDialog.tsx";
import { DebugDialog } from "./dialogs/debug/DebugDialog.tsx";
import { availableMaterials, materialsSeen } from "./dialogs/create/materials-seen.ts";
import { debug } from "./debug.ts";
import { PeopleDialog } from "./dialogs/people/PeopleDialog.tsx";
import { PrinterCopy } from "./dialogs/print/Sheets.tsx";
import { feedback } from "./feedback.ts";
import { t } from "./messages.ts";
import { printMode } from "./print-mode.ts";
import { Toast } from "./Toast.tsx";
import { discardSticker, undo } from "./undo.ts";

const hasImage = (dt: DataTransfer) =>
  Array.from(dt.items).some(
    (i) => i.kind === "file" && (i.type === "" || i.type.startsWith("image/")),
  );

export function App() {
  return (
    <Suspense fallback={null}>
      <Booted />
    </Suspense>
  );
}

function Booted() {
  return <Shell initialView={use(startupPrefs()).view} />;
}

function Shell({ initialView }: { readonly initialView: View }) {
  const snap = useSyncExternalStore(stickerStore.subscribe, stickerStore.getSnapshot);
  const mark = useSyncExternalStore(backupMarkCache.subscribe, backupMarkCache.get);
  const { toast, highlight } = useSyncExternalStore(feedback.subscribe, feedback.get);
  const printing = useSyncExternalStore(printMode.subscribe, printMode.get);
  const [state, dispatch] = useReducer(reducer, initialView, initialState);
  const blockId = useSyncExternalStore(blockSelection.subscribe, blockSelection.get);
  const lightsOut = useSyncExternalStore(lights.subscribe, lights.off);
  const debugOn = useSyncExternalStore(debug.subscribe, () => debug.get().on);
  const seenMaterials = useSyncExternalStore(materialsSeen.subscribe, materialsSeen.get);
  useSyncExternalStore(debug.subscribe, debug.get);

  const [dropping, setDropping] = useReducer((_: boolean, next: boolean) => next, false);

  const onSaved = (stickerId: string, result: AddResult) =>
    feedback.landed(stickerId, result.kind === "added" ? "pocket" : "wiggle", null);

  const onLeft = () => {
    const leaving = state.leaving;
    dispatch({ type: "left" });
    if (leaving) void discardSticker(leaving.stickerId);
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
  const close = () => dispatch({ type: "close", overlay: overlay.kind });
  const inJar = state.view === "jar" && stickers.length > 0;
  const jarSticker =
    inJar && overlay.kind === "none" ? stickers.find((s) => s.id === blockId) : undefined;
  const switchView = () => {
    const next = inJar ? "album" : "jar";
    blockSelection.set(null);
    // the click is the gesture that lets the jar make sound (iOS only allows it from here)
    if (next === "jar") jarSound.unlock();
    else jarSound.release();
    dispatch({ type: "view", view: next });
    writeViewHint(next);
    void settings.set("view", next).catch(() => {});
  };
  // the jar is a dark room: the page's theme follows the view in the same commit (and while the
  // stickers are still loading, so a reload in the jar never shows the album's colours first)
  const dark = state.view === "jar" && (!ready || stickers.length > 0);
  const albumDark = lightsOut && !inJar;
  const room = (el: HTMLElement | null) => (el ? jarChrome(dark) : undefined);

  return (
    <div
      className={styles.shell}
      ref={room}
      data-jar={dark || undefined}
      data-dusk={albumDark || undefined}
    >
      <nav className={styles.toolbar} aria-label={t.app.toolbar}>
        {!inJar && <PageIndicator count={Math.max(1, ready?.pages.length ?? 0)} />}
        {stickers.length > 0 && (
          <button
            type="button"
            className={common.icon}
            aria-label={inJar ? t.app.viewAlbum : t.app.viewJar}
            title={inJar ? t.app.viewAlbum : t.app.viewJar}
            onClick={switchView}
          >
            {inJar ? (
              <BookOpen aria-hidden="true" size={22} strokeWidth={1.5} />
            ) : (
              <FlaskRound aria-hidden="true" size={22} strokeWidth={1.5} />
            )}
          </button>
        )}
        <button
          type="button"
          className={`${mine.length === 0 ? `${common.button} ${styles.labeled}` : common.icon} ${styles.menu}`}
          aria-label={t.app.create.label}
          aria-description={newMaterial ? t.app.newMaterial : undefined}
          title={newMaterial ? t.app.newMaterial : t.app.create.tooltip}
          data-dot={newMaterial || undefined}
          onClick={() => dispatch({ type: "open", overlay: { kind: "create" } })}
        >
          <ImagePlus aria-hidden="true" size={22} strokeWidth={1.5} />
          {mine.length === 0 && t.app.create.text}
        </button>
        {stickers.length > 0 && !inJar && (
          <button
            type="button"
            className={common.icon}
            aria-label={t.app.lightsOut}
            title={t.app.lightsOut}
            aria-pressed={albumDark}
            onClick={lights.toggle}
          >
            {albumDark ? (
              <LightbulbOff aria-hidden="true" size={22} strokeWidth={1.5} />
            ) : (
              <Lightbulb aria-hidden="true" size={22} strokeWidth={1.5} />
            )}
          </button>
        )}
        {stickers.length > 0 && (
          <button
            type="button"
            className={common.icon}
            aria-label={t.app.print}
            title={t.app.print}
            onClick={() => dispatch({ type: "open", overlay: { kind: "print" } })}
          >
            <Printer aria-hidden="true" size={22} strokeWidth={1.5} />
          </button>
        )}
        {debugOn && (
          <button
            type="button"
            className={common.icon}
            aria-label={t.debug.open}
            title={t.debug.open}
            onClick={() => dispatch({ type: "open", overlay: { kind: "debug" } })}
          >
            <Bug aria-hidden="true" size={22} strokeWidth={1.5} />
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
          <Ellipsis aria-hidden="true" size={22} strokeWidth={1.5} />
        </button>
      </nav>

      <main
        className={styles.main}
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
          dispatch({ type: "open", overlay: { kind: "create", file } });
        }}
      >
        {ready && inJar && (
          <Suspense fallback={<JarFrame />}>
            <JarView onPick={() => dispatch({ type: "open", overlay: { kind: "jarPick" } })} />
          </Suspense>
        )}
        {ready && !inJar && (
          <Album
            dark={albumDark}
            snap={ready}
            selected={state.selected}
            highlight={highlight}
            leaving={state.leaving?.placementId ?? null}
            onSelect={(placementId) => dispatch({ type: "select", placementId })}
            onLeft={onLeft}
            onCreate={() => dispatch({ type: "open", overlay: { kind: "create" } })}
          />
        )}
        {ready && !inJar && stickers.length > 0 && (
          <Pocket
            dark={albumDark}
            stickers={pocket}
            highlight={highlight}
            onOpen={() => dispatch({ type: "open", overlay: { kind: "pocket" } })}
          />
        )}
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
      {jarSticker && (
        <ActionBar
          key={jarSticker.id}
          sticker={jarSticker}
          onQr={() => dispatch({ type: "open", overlay: { kind: "qr", stickerId: jarSticker.id } })}
          onBack={() =>
            dispatch({ type: "open", overlay: { kind: "back", stickerId: jarSticker.id } })
          }
          onDiscard={() => {
            blockSelection.set(null);
            void discardSticker(jarSticker.id);
          }}
        />
      )}
      <CarryLayer />
      {toast && (
        <Toast
          key={toast.id}
          toast={toast}
          onUndo={() => {
            if (toast.undo) void undo(toast.undo);
          }}
          onAction={() => {
            feedback.dismiss(toast.id);
            if (toast.action?.kind === "create") {
              dispatch({ type: "open", overlay: { kind: "create" } });
            }
          }}
          onDismiss={() => feedback.dismiss(toast.id)}
        />
      )}

      {overlay.kind === "create" && (
        <CreateDialog file={overlay.file} onClose={close} onSaved={onSaved} />
      )}
      {qrSticker && <QrDialog sticker={qrSticker.sticker} onClose={close} />}
      {ready && overlay.kind === "print" && <PrintDialog album={ready} onClose={close} />}
      {ready && overlay.kind === "jarPick" && <JarPickDialog stickers={stickers} onClose={close} />}
      {overlay.kind === "menu" && (
        <MenuDialog
          onClose={close}
          onPeople={() => dispatch({ type: "open", overlay: { kind: "people" } })}
        />
      )}
      {backSticker && (
        <BackDialog
          sticker={backSticker}
          all={stickers}
          onPerson={(focus) => dispatch({ type: "open", overlay: { kind: "people", focus } })}
          onClose={close}
        />
      )}
      {overlay.kind === "people" && (
        <PeopleDialog stickers={stickers} focus={overlay.focus} onClose={close} />
      )}
      {overlay.kind === "debug" && <DebugDialog onClose={close} />}
      {ready && overlay.kind === "pocket" && (
        <PocketDialog
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
