import { Check, Grid2x2, ImagePlus, Lock, Sparkles } from "lucide-react";
import {
  useCallback,
  useReducer,
  useRef,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Cropper, { type Area } from "react-easy-crop";
import { MATERIAL_KINDS, peopleToUnlock } from "../../../core/material.ts";
import { PALETTES, type PaletteKind } from "../../../core/palette.ts";
import { peopleOf } from "../../../core/people.ts";
import type { PaletteCandidate } from "../../../core/quantize.ts";
import { encodeBody, stickerIdOf } from "../../../core/payload.ts";
import { importPixelArt } from "../../../core/pixelart.ts";
import { SNS, SNS_KINDS } from "../../../core/sns.ts";
import { loadImageFile } from "../../../data/image.ts";
import type { SettingValue } from "../../../data/settings.ts";
import { settings, stickerStore, type AddResult } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { debug } from "../../debug.ts";
import { Dialog } from "../../Dialog.tsx";
import { useCloseDialog } from "../../dialog-context.ts";
import { t } from "../../messages.ts";
import { SnsIcon } from "../../SnsIcon.tsx";
import { StickerView } from "../../StickerView.tsx";
import styles from "./CreateDialog.module.css";
import {
  INITIAL,
  createReducer,
  type CreateAction,
  type EditState,
  type Source,
} from "./create-state.ts";
import { derive, type Derived } from "./derive.ts";

type LastSns = SettingValue<"lastSns"> | null;

const lastSnsCache: { p?: Promise<LastSns> } = {};
const lastSns = () => (lastSnsCache.p ??= settings.get("lastSns").catch(() => null));

type Props = {
  readonly file: File | undefined;
  readonly onClose: () => void;
  readonly onSaved: (stickerId: string, result: AddResult) => void;
};

export function CreateDialog({ file, onClose, onSaved }: Props) {
  return (
    <Dialog label={t.create.dialog} onClose={onClose}>
      <CreateFlow last={lastSns()} file={file} onSaved={onSaved} />
    </Dialog>
  );
}

async function loadSource(file: File, signal: AbortSignal): Promise<Source | "failed" | undefined> {
  const img = await loadImageFile(file, signal).catch(() => "failed" as const);
  if (signal.aborted) return undefined;
  if (img === "failed") return img;
  return { file, url: URL.createObjectURL(file), ...img, art: importPixelArt(img.rgba) };
}

async function load(
  picked: File | undefined,
  last: Promise<LastSns>,
  loading: { current: AbortController | null },
  urls: { current: readonly string[] },
  dispatch: (a: CreateAction) => void,
): Promise<void> {
  if (!picked) return;
  loading.current?.abort();
  const controller = new AbortController();
  loading.current = controller;
  dispatch({ type: "loading" });
  const [source, sns] = await Promise.all([loadSource(picked, controller.signal), last]);
  if (source === undefined) return;
  if (source === "failed") {
    dispatch({ type: "load-failed" });
    return;
  }
  urls.current = [...urls.current, source.url];
  dispatch({ type: "loaded", source, sns });
}

function CreateFlow({
  last,
  file,
  onSaved,
}: {
  readonly last: Promise<LastSns>;
  readonly file: File | undefined;
  readonly onSaved: Props["onSaved"];
}) {
  const [state, dispatch] = useReducer(createReducer, INITIAL);
  const loading = useRef<AbortController | null>(null);
  const urls = useRef<readonly string[]>([]);

  const open = (picked: File | undefined) => void load(picked, last, loading, urls, dispatch);

  // unmount (dialog closed): stop decoding and release object URLs — a ref cleanup, not an
  // effect. The callback must keep its identity, or React would run the cleanup each render.
  const lifetime = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) void load(file, last, loading, urls, dispatch);
      return () => {
        loading.current?.abort();
        urls.current.forEach((u) => URL.revokeObjectURL(u));
      };
    },
    [file, last],
  );

  return (
    <div ref={lifetime}>
      {state.step === "pick" ? (
        <PickImage loading={state.loading} failed={state.failed} onFile={open} />
      ) : (
        <Editor state={state} dispatch={dispatch} onSaved={onSaved} />
      )}
    </div>
  );
}

function PickImage({
  loading,
  failed,
  onFile,
}: {
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onFile: (f: File | undefined) => void;
}) {
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    onFile(e.dataTransfer.files[0]);
  };
  return (
    <div className={styles.pick}>
      <label
        className={styles.drop}
        data-loading={loading || undefined}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <ImagePlus aria-hidden="true" size={40} strokeWidth={1} />
        <input
          type="file"
          accept="image/*"
          className={common.visuallyHidden}
          disabled={loading}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onFile(e.currentTarget.files?.[0])}
        />
      </label>
      {failed && <p className={common.warn}>{t.create.loadFailed}</p>}
    </div>
  );
}

type EditorProps = {
  readonly state: EditState;
  readonly dispatch: (a: CreateAction) => void;
  readonly onSaved: Props["onSaved"];
};

async function saveSticker(d: Derived): Promise<{ id: string; result: AddResult } | undefined> {
  const body = encodeBody(d.sticker);
  const id = await stickerIdOf(body);
  const result = await stickerStore.add(id, body, "mine");
  await settings.set("lastSns", { kind: d.sticker.snsKind, id: d.snsId });
  lastSnsCache.p = undefined;
  return { id, result };
}

function Editor({ state, dispatch, onSaved }: EditorProps) {
  const close = useCloseDialog();
  const d = derive(state);

  const save = async () => {
    dispatch({ type: "saving" });
    if (!d.snsValid) {
      dispatch({ type: "save-failed" });
      return;
    }
    const saved = await saveSticker(d).catch(() => undefined);
    if (!saved) {
      dispatch({ type: "save-failed" });
      return;
    }
    close();
    onSaved(saved.id, saved.result);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.editor}>
        <div className={styles.preview}>
          <span className={styles.previewArt}>
            <StickerView sticker={d.sticker} scale={0} label={t.create.preview} />
          </span>
          {d.exact && (
            <span className={styles.badge} title={t.create.exactMatch}>
              <Check aria-hidden="true" size={14} strokeWidth={2} />
              <span className={common.visuallyHidden}>{t.create.exactMatch}</span>
            </span>
          )}
        </div>

        <div className={styles.controls}>
          {!state.source.art && <CropField state={state} dispatch={dispatch} />}
          <PaletteField d={d} dispatch={dispatch} />
          <TransparentField d={d} dispatch={dispatch} />
          {!state.source.art && <DitherField state={state} dispatch={dispatch} />}
          <MaterialField state={state} d={d} dispatch={dispatch} />
          <SnsField state={state} d={d} dispatch={dispatch} />
          {state.failed && d.snsValid && <p className={common.warn}>{t.create.saveFailed}</p>}
          <button
            type="button"
            className={common.primary}
            disabled={state.saving}
            onClick={() => void save()}
          >
            {t.create.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

function CropField({ state, dispatch }: Pick<EditorProps, "state" | "dispatch">) {
  const url = state.source.url;
  const k = state.source.rgba.width / state.source.naturalWidth;
  const commit = (_: Area, px: Area) =>
    dispatch({
      type: "crop-commit",
      crop: { x: px.x * k, y: px.y * k, size: Math.max(1, Math.min(px.width, px.height) * k) },
    });

  return (
    <div className={styles.cropper}>
      {url && (
        <Cropper
          image={url}
          crop={state.cropPos}
          zoom={state.zoom}
          minZoom={1}
          maxZoom={8}
          aspect={1}
          objectFit="contain"
          onCropChange={(pos) => dispatch({ type: "crop-move", pos })}
          onZoomChange={(zoom) => dispatch({ type: "zoom", zoom })}
          onCropComplete={commit}
        />
      )}
    </div>
  );
}

function PaletteField({
  d,
  dispatch,
}: {
  readonly d: Derived;
  readonly dispatch: (a: CreateAction) => void;
}) {
  const group = (kind: PaletteKind) => d.ranked.filter((c) => PALETTES[c.paletteId]?.kind === kind);
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.create.palette}</legend>
      <PaletteGroup
        label={t.create.paletteNatural}
        candidates={group("natural")}
        d={d}
        dispatch={dispatch}
        best={true}
      />
      <PaletteGroup
        label={t.create.paletteFilter}
        candidates={group("filter")}
        d={d}
        dispatch={dispatch}
        best={false}
      />
    </fieldset>
  );
}

function PaletteGroup({
  label,
  candidates,
  d,
  dispatch,
  best,
}: {
  readonly label: string;
  readonly candidates: readonly PaletteCandidate[];
  readonly d: Derived;
  readonly dispatch: (a: CreateAction) => void;
  readonly best: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={styles.paletteGroup}>
      <ul className={styles.paletteGrid}>
        {candidates.map((c, rank) => {
          const p = PALETTES[c.paletteId];
          if (!p) return null;
          return (
            <li key={c.paletteId}>
              <button
                type="button"
                className={styles.paletteItem}
                aria-pressed={c.paletteId === d.paletteId}
                aria-label={p.name}
                title={p.name}
                onClick={() => dispatch({ type: "palette", paletteId: c.paletteId })}
              >
                <StickerView
                  sticker={{
                    paletteId: c.paletteId,
                    transparentIndex: c.transparentIndex,
                    snsKind: 1,
                    snsId: "",
                    pixels: c.result.indices,
                  }}
                  scale={1}
                  label=""
                  decorative
                />
                {best && rank === 0 && (
                  <Sparkles
                    aria-hidden="true"
                    className={styles.best}
                    size={12}
                    strokeWidth={1.5}
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TransparentField({
  d,
  dispatch,
}: {
  readonly d: Derived;
  readonly dispatch: (a: CreateAction) => void;
}) {
  const palette = PALETTES[d.paletteId];
  if (!palette) return null;
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.create.transparent}</legend>
      <div className={styles.swatches} role="radiogroup" aria-label={t.create.transparent}>
        <button
          type="button"
          role="radio"
          aria-checked={d.transparentIndex === null}
          aria-label={t.create.transparentNone}
          title={t.create.transparentNone}
          className={`${styles.swatch} ${styles.none}`}
          onClick={() => dispatch({ type: "transparent-on", on: false })}
        />
        {palette.colors.map((hex, i) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={d.transparentIndex === i}
            aria-label={t.create.transparentColor(hex)}
            title={t.create.transparentColor(hex)}
            className={`${styles.swatch} ${styles.checker}`}
            style={{ "--swatch": `#${hex}` } as React.CSSProperties}
            onClick={() => dispatch({ type: "transparent-pick", paletteId: d.paletteId, index: i })}
          />
        ))}
      </div>
    </fieldset>
  );
}

function exchangedWith(): number {
  const snap = stickerStore.getSnapshot();
  return snap.status === "ready" ? peopleOf(snap.stickers).length : 0;
}

// Materials open up as the maker exchanges with more people; the locked ones say how many more.
function MaterialField({
  state,
  d,
  dispatch,
}: Pick<EditorProps, "state" | "dispatch"> & { readonly d: Derived }) {
  const exchanged = useSyncExternalStore(stickerStore.subscribe, exchangedWith);
  const unlockAll = useSyncExternalStore(debug.subscribe, () => debug.get().unlockAll);
  const people = unlockAll ? Number.POSITIVE_INFINITY : exchanged;
  const palette = PALETTES[d.paletteId];
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.create.material}</legend>
      <div className={styles.materials} role="radiogroup" aria-label={t.create.material}>
        {MATERIAL_KINDS.map((kind) => {
          const name = t.create.materials[kind];
          const more = peopleToUnlock(kind, people);
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={state.material === kind}
              disabled={more > 0}
              title={more > 0 ? t.create.materialLocked(name, more) : name}
              aria-label={more > 0 ? t.create.materialLocked(name, more) : name}
              className={styles.material}
              data-material={kind}
              onClick={() => dispatch({ type: "material", kind })}
            >
              {more > 0 && <Lock aria-hidden="true" size={12} strokeWidth={1.75} />}
              {name}
            </button>
          );
        })}
      </div>
      {state.material === "foil" && palette && (
        <div className={styles.swatches} role="radiogroup" aria-label={t.create.foilTone}>
          {d.used.map((i) => {
            const hex = palette.colors[i] ?? "000000";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={d.sticker.material?.tone === i}
                aria-label={`${t.create.foilTone} #${hex}`}
                title={`${t.create.foilTone} #${hex}`}
                className={`${styles.swatch} ${styles.tone}`}
                style={{ "--swatch": `#${hex}` } as React.CSSProperties}
                onClick={() => dispatch({ type: "foil-tone", tone: i })}
              />
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function DitherField({ state, dispatch }: Pick<EditorProps, "state" | "dispatch">) {
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={state.dither}
      aria-label={t.create.dither}
      title={t.create.dither}
      onClick={() => dispatch({ type: "dither", on: !state.dither })}
    >
      <Grid2x2 aria-hidden="true" size={18} strokeWidth={1.5} />
    </button>
  );
}

function SnsField({
  state,
  d,
  dispatch,
}: Pick<EditorProps, "state" | "dispatch"> & { readonly d: Derived }) {
  const showError = state.snsTouched && !d.snsValid;
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.create.sns}</legend>
      <div className={styles.sns}>
        <div className={styles.kinds} role="radiogroup" aria-label={t.create.snsKind}>
          {SNS_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={state.snsKind === k}
              aria-label={SNS[k].label}
              title={SNS[k].label}
              className={styles.kind}
              onClick={() => dispatch({ type: "sns-kind", kind: k })}
            >
              <SnsIcon kind={k} size={18} />
            </button>
          ))}
        </div>
        <input
          className={common.input}
          aria-label={t.create.snsId}
          placeholder={t.create.snsId}
          value={state.snsInput}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={showError}
          aria-describedby="sns-hint"
          onChange={(e) => dispatch({ type: "sns-input", value: e.currentTarget.value })}
          onBlur={() => dispatch({ type: "sns-blur" })}
        />
      </div>
      <p id="sns-hint" className={showError ? common.warn : common.muted}>
        {SNS[state.snsKind].hint}
      </p>
    </fieldset>
  );
}
