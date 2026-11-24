import { BookOpen, Ellipsis, FlaskRound, ImagePlus, Printer } from "lucide-react";
import { useReducer, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "../data/platform.ts";
import { layoutAlbum } from "../core/print.ts";
import { settings, stickerStore, type AddResult } from "../data/sticker-store.ts";
import { Jar } from "./jar/Jar.tsx";
import { ActionBar } from "./ActionBar.tsx";
import { Album } from "./album/Album.tsx";
import { PageIndicator } from "./album/PageIndicator.tsx";
import { INITIAL, reducer } from "./app-state.ts";
import styles from "./App.module.css";
import common from "./common.module.css";
import { CreateDialog } from "./dialogs/create/CreateDialog.tsx";
import { backupDue, backupMarkCache } from "./dialogs/menu/backup-mark.ts";
import { MenuDialog } from "./dialogs/menu/MenuDialog.tsx";
import { PrintDialog } from "./dialogs/print/PrintDialog.tsx";
import { QrDialog } from "./dialogs/QrDialog.tsx";
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
  const snap = useSyncExternalStore(stickerStore.subscribe, stickerStore.getSnapshot);
  const mark = useSyncExternalStore(backupMarkCache.subscribe, backupMarkCache.get);
  const { toast, highlight } = useSyncExternalStore(feedback.subscribe, feedback.get);
  const printing = useSyncExternalStore(printMode.subscribe, printMode.get);
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const [dropping, setDropping] = useReducer((_: boolean, next: boolean) => next, false);

  const onSaved = (stickerId: string, result: AddResult) =>
    feedback.landed(stickerId, result.kind === "added" ? "arrive" : "wiggle", null);

  const onLeft = () => {
    const leaving = state.leaving;
    dispatch({ type: "left" });
    if (leaving) void discardSticker(leaving.stickerId);
  };

  if (snap.status === "error") {
    return <p className={`${common.warn} ${styles.error}`}>{t.app.storageUnavailable}</p>;
  }
  const ready = snap.status === "ready" ? snap : null;
  const stickers = ready?.stickers ?? [];
  const mine = stickers.filter((s) => s.origin === "mine");
  const selectedPlacement = ready?.placements.find((p) => p.id === state.selected);
  const selectedSticker = stickers.find((s) => s.id === selectedPlacement?.stickerId);
  const menuDot = (isIos() && !isStandalone()) || backupDue(stickers.length - mine.length, mark);
  const overlay = state.overlay;
  const qrSticker =
    overlay.kind === "qr" ? stickers.find((s) => s.id === overlay.stickerId) : undefined;
  const close = () => dispatch({ type: "close" });
  const inJar = state.view === "jar";
  const switchView = () => {
    const next = inJar ? "album" : "jar";
    dispatch({ type: "view", view: next });
    void settings.set("view", next).catch(() => {});
  };

  return (
    <div className={styles.shell}>
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
          className={mine.length === 0 ? `${common.button} ${styles.labeled}` : common.icon}
          aria-label={t.app.create.label}
          title={t.app.create.tooltip}
          onClick={() => dispatch({ type: "open", overlay: { kind: "create" } })}
        >
          <ImagePlus aria-hidden="true" size={22} strokeWidth={1.5} />
          {mine.length === 0 && t.app.create.text}
        </button>
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
        {ready && inJar && <Jar stickers={stickers} />}
        {ready && !inJar && (
          <Album
            snap={ready}
            selected={state.selected}
            highlight={highlight}
            leaving={state.leaving?.placementId ?? null}
            onSelect={(placementId) => dispatch({ type: "select", placementId })}
            onLeft={onLeft}
            onCreate={() => dispatch({ type: "open", overlay: { kind: "create" } })}
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
          onDiscard={() =>
            dispatch({
              type: "leave",
              placementId: selectedPlacement.id,
              stickerId: selectedSticker.id,
            })
          }
        />
      )}
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
      {overlay.kind === "menu" && <MenuDialog onClose={close} />}
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
