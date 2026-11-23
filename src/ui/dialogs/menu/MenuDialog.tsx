import {
  ChevronDown,
  DatabaseBackup,
  Download,
  Ellipsis,
  Palette,
  Share,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";
import {
  Suspense,
  use,
  useReducer,
  useSyncExternalStore,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { paletteFileBase, paletteGpl, paletteRgba } from "../../../core/export-palette.ts";
import { PALETTES, type Palette as PaletteDef } from "../../../core/palette.ts";
import { todayLocal } from "../../../data/db.ts";
import { downloadBlob, rgbaToPng } from "../../../data/image.ts";
import {
  isIos,
  isStandalone,
  persistState,
  requestPersist,
  type PersistState,
} from "../../../data/platform.ts";
import { installPrompt } from "../../../data/install.ts";
import { settings, stickerStore } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { Dialog } from "../../Dialog.tsx";
import { BACKUP_ERROR_TEXT } from "../../text.ts";
import { backupMarkCache } from "./backup-mark.ts";
import styles from "./MenuDialog.module.css";

type Props = { readonly onClose: () => void };

export function MenuDialog({ onClose }: Props) {
  return (
    <Dialog label="メニュー" onClose={onClose}>
      <div className={styles.body}>
        {isIos() && !isStandalone() && (
          <Row icon={<Share aria-hidden="true" size={20} strokeWidth={1.5} />}>
            <p className={common.warn}>
              共有からホーム画面に追加
              <br />
              追加しないと、しばらく開かないときに消えることがある
            </p>
          </Row>
        )}
        <Backup />
        <Suspense fallback={<StorageSwitch state="denied" />}>
          <Storage initial={initialPersist()} />
        </Suspense>
        <Palettes />
      </div>
    </Dialog>
  );
}

function Row({ icon, children }: { readonly icon: ReactNode; readonly children: ReactNode }) {
  return (
    <section className={styles.row}>
      <span className={styles.rowIcon}>{icon}</span>
      <div className={styles.rowBody}>{children}</div>
    </section>
  );
}

type ImportState =
  | { readonly kind: "idle" }
  | { readonly kind: "busy" }
  | { readonly kind: "done"; readonly text: string };

async function exportBackup(): Promise<void> {
  const text = await stickerStore.exportBackup();
  const date = todayLocal();
  downloadBlob(`sticker-notes-backup-${date}.json`, new Blob([text], { type: "application/json" }));
  const snap = stickerStore.getSnapshot();
  const receivedCount =
    snap.status === "ready" ? snap.stickers.filter((s) => s.origin === "received").length : 0;
  const mark = { receivedCount, date };
  await settings.set("backup", mark);
  backupMarkCache.set(mark);
}

async function importBackupFile(file: File): Promise<string> {
  const r = await stickerStore.importBackup(await file.text()).catch(() => undefined);
  if (!r) return "読み込めなかった";
  if (!r.ok) return BACKUP_ERROR_TEXT[r.reason];
  const skipped = r.skipped > 0 ? `\n読めない項目${r.skipped}件は飛ばした` : "";
  return `${r.stickers}枚を貼った${skipped}`;
}

function Backup() {
  const [state, set] = useReducer((_: ImportState, next: ImportState) => next, { kind: "idle" });
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    set({ kind: "busy" });
    set({ kind: "done", text: await importBackupFile(file) });
  };
  return (
    <Row icon={<DatabaseBackup aria-hidden="true" size={20} strokeWidth={1.5} />}>
      <div className={common.row}>
        <button type="button" className={common.button} onClick={() => void exportBackup()}>
          <Download aria-hidden="true" size={18} strokeWidth={1.5} />
          バックアップ
        </button>
        <label className={common.button} data-busy={state.kind === "busy" || undefined}>
          <Upload aria-hidden="true" size={18} strokeWidth={1.5} />
          読み込む
          <input
            type="file"
            accept="application/json,.json"
            className={common.visuallyHidden}
            disabled={state.kind === "busy"}
            onChange={(e) => void onFile(e)}
          />
        </label>
      </div>
      {state.kind === "done" && (
        <p className={`${common.warn} ${styles.pre}`} role="status">
          {state.text}
        </p>
      )}
    </Row>
  );
}

type Persist = {
  readonly state: PersistState;
  readonly refused: boolean;
  readonly asking: boolean;
};

// read once, before the dialog is ever opened, so the switch never appears in a wrong position
const persistCache: { p?: Promise<PersistState> } = {};
const initialPersist = () =>
  (persistCache.p ??= persistState().catch(() => "unsupported" as const));
void initialPersist();

function Storage({ initial }: { readonly initial: Promise<PersistState> }) {
  return <StorageSwitch state={use(initial)} />;
}

function StorageSwitch({ state: first }: { readonly state: PersistState }) {
  const [s, set] = useReducer((_: Persist, next: Persist) => next, {
    state: first,
    refused: false,
    asking: false,
  });
  const ask = async () => {
    set({ state: s.state, refused: false, asking: true });
    const next = await requestPersist().catch(() => "denied" as const);
    persistCache.p = Promise.resolve(next);
    set({ state: next, refused: next === "denied", asking: false });
  };
  const granted = s.state === "granted";
  return (
    <Row icon={<ShieldCheck aria-hidden="true" size={20} strokeWidth={1.5} />}>
      <label className={styles.switch}>
        <span>データを自動削除されないようにする</span>
        <input
          type="checkbox"
          role="switch"
          checked={granted}
          disabled={granted || s.asking || s.state === "unsupported"}
          onChange={() => void ask()}
        />
      </label>
      {s.state === "unsupported" && <p className={common.muted}>このブラウザは非対応</p>}
      {s.refused && <KeepFailed />}
    </Row>
  );
}

function KeepFailed() {
  const canInstall = useSyncExternalStore(installPrompt.subscribe, installPrompt.canInstall);
  return (
    <div className={styles.failed} role="status">
      <p className={common.warn}>失敗しました</p>
      {isStandalone() ? (
        <p className={common.muted}>ブラウザの設定でこのアプリのデータ保存を許可してください</p>
      ) : canInstall ? (
        <>
          <p className={common.muted}>ホーム画面に追加すると許可されやすくなります</p>
          <button
            type="button"
            className={common.button}
            onClick={() => void installPrompt.install()}
          >
            <Smartphone aria-hidden="true" size={18} strokeWidth={1.5} />
            ホーム画面に追加
          </button>
        </>
      ) : (
        <p className={`${common.muted} ${styles.pre}`}>
          {isIos()
            ? "ホーム画面に追加すると許可されやすくなります\nSafari の共有ボタン →「ホーム画面に追加」"
            : "ホーム画面に追加すると許可されやすくなります\nブラウザのメニュー →「アプリをインストール」または「ホーム画面に追加」"}
        </p>
      )}
    </div>
  );
}

const PALETTE_EXPORTS = {
  png: { label: "PNG(16×1)", blob: (p: PaletteDef) => rgbaToPng(paletteRgba(p)) },
  gpl: {
    label: "GIMP パレット(.gpl)",
    blob: async (p: PaletteDef) => new Blob([paletteGpl(p)], { type: "text/plain" }),
  },
} as const;
type PaletteExport = keyof typeof PALETTE_EXPORTS;

async function savePalette(p: PaletteDef, format: PaletteExport): Promise<void> {
  downloadBlob(`${paletteFileBase(p)}.${format}`, await PALETTE_EXPORTS[format].blob(p));
}

function Palettes() {
  return (
    <Row icon={<Palette aria-hidden="true" size={20} strokeWidth={1.5} />}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          パレット
          <ChevronDown aria-hidden="true" className={styles.chevron} size={18} strokeWidth={1.5} />
        </summary>
        <ul className={styles.palettes}>
          {PALETTES.map((p) => (
            <li key={p.id} className={styles.palette}>
              <span className={styles.strip} title={p.name} aria-label={p.name}>
                {p.colors.map((c) => (
                  <span key={c} style={{ background: `#${c}` }} />
                ))}
              </span>
              <PaletteMenu palette={p} />
            </li>
          ))}
        </ul>
      </details>
    </Row>
  );
}

function PaletteMenu({ palette }: { readonly palette: PaletteDef }) {
  const id = `palette-menu-${palette.id}`;
  const anchor = `--palette-${palette.id}`;
  return (
    <>
      <button
        type="button"
        className={common.icon}
        popoverTarget={id}
        aria-label={`${palette.name} を保存`}
        title="保存"
        style={{ anchorName: anchor } as CSSProperties}
      >
        <Ellipsis aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>
      <div
        id={id}
        popover="auto"
        role="menu"
        className={styles.popover}
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        {(Object.keys(PALETTE_EXPORTS) as PaletteExport[]).map((format) => (
          <button
            key={format}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={(e) => {
              void savePalette(palette, format);
              e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
            }}
          >
            <Download aria-hidden="true" size={16} strokeWidth={1.5} />
            {PALETTE_EXPORTS[format].label}
          </button>
        ))}
      </div>
    </>
  );
}
