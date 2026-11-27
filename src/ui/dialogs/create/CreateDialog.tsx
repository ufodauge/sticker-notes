import { Check, Grid2x2, ImagePlus, Sparkles } from "lucide-react";
import {
  useCallback,
  useReducer,
  useRef,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Cropper, { type Area } from "react-easy-crop";
import { MATERIAL_KINDS } from "../../../core/material.ts";
import { PALETTES, type PaletteKind } from "../../../core/palette.ts";
import type { PaletteCandidate } from "../../../core/quantize.ts";
import { encodeBody, stickerIdOf } from "../../../core/payload.ts";
import { importPixelArt } from "../../../core/pixelart.ts";
import { NO_SNS } from "../../../core/sns.ts";
import { loadImageFile } from "../../../data/image.ts";
import { stickerStore, type AddResult } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { debug } from "../../debug.ts";
import { Dialog } from "../../Dialog.tsx";
import { useCloseDialog } from "../../dialog-context.ts";
import { t } from "../../messages.ts";
import { StickerView } from "../../StickerView.tsx";
import styles from "./CreateDialog.module.css";
import {
  INITIAL,
  createReducer,
  type CreateAction,
  type EditState,
  type Source,
} from "./create-state.ts";
import { analyze, derive, type Derived } from "./derive.ts";
import { availableMaterials, materialsSeen } from "./materials-seen.ts";

type Props = {
  readonly file: File | undefined;
  readonly onClose: () => void;
  readonly onSaved: (stickerId: string, result: AddResult) => void;
  // the tutorial's sticker (one's first): made at once from the picture, as it comes out
  readonly quick: boolean;
};

export function CreateDialog({ file, onClose, onSaved, quick }: Props) {
  return (
    <Dialog label={t.create.dialog} onClose={onClose}>
      <CreateFlow file={file} onSaved={onSaved} quick={quick} />
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
  loading: { current: AbortController | null },
  urls: { current: readonly string[] },
  dispatch: (a: CreateAction) => void,
  // made at once, as it comes out (one's first sticker)
  quick: ((state: EditState) => Promise<void>) | undefined,
): Promise<void> {
  if (!picked) return;
  loading.current?.abort();
  const controller = new AbortController();
  loading.current = controller;
  dispatch({ type: "loading" });
  const source = await loadSource(picked, controller.signal);
  if (source === undefined) return;
  if (source === "failed") {
    dispatch({ type: "load-failed" });
    return;
  }
  urls.current = [...urls.current, source.url];
  if (quick) {
    const state = createReducer(INITIAL, { type: "loaded", source });
    if (state.step === "edit") {
      await quick(state);
      return;
    }
  }
  dispatch({ type: "loaded", source });
}

function CreateFlow({
  file,
  onSaved,
  quick,
}: {
  readonly file: File | undefined;
  readonly onSaved: Props["onSaved"];
  readonly quick: boolean;
}) {
  const [state, dispatch] = useReducer(createReducer, INITIAL);
  const loading = useRef<AbortController | null>(null);
  const urls = useRef<readonly string[]>([]);
  const close = useCloseDialog();

  // the first sticker: what the picture makes by itself, saved as it is
  const makeAtOnce = async (s: EditState) => {
    const saved = await saveSticker(derive(s, analyze(s.source, s.crop))).catch(() => undefined);
    if (!saved) {
      dispatch({ type: "loaded", source: s.source });
      return;
    }
    materialsSeen.markAll(availableMaterials());
    close();
    onSaved(saved.id, saved.result);
  };
  const atOnce = quick ? makeAtOnce : undefined;

  const open = (picked: File | undefined) => void load(picked, loading, urls, dispatch, atOnce);

  // unmount (dialog closed): stop decoding and release object URLs — a ref cleanup, not an
  // effect. The callback must keep its identity, or React would run the cleanup each render.
  const lifetime = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) void load(file, loading, urls, dispatch, undefined);
      return () => {
        loading.current?.abort();
        urls.current.forEach((u) => URL.revokeObjectURL(u));
      };
    },
    [file],
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
  return { id, result };
}

function Editor({ state, dispatch, onSaved }: EditorProps) {
  const close = useCloseDialog();
  // React Compiler keeps the analysis until the picture or its crop changes
  const image = analyze(state.source, state.crop);
  const d = derive(state, image);

  const save = async () => {
    dispatch({ type: "saving" });
    const saved = await saveSticker(d).catch(() => undefined);
    if (!saved) {
      dispatch({ type: "save-failed" });
      return;
    }
    materialsSeen.markAll(availableMaterials());
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
          {state.failed && <p className={common.warn}>{t.create.saveFailed}</p>}
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

type View = { readonly x: number; readonly y: number; readonly zoom: number };

// The crop follows the finger here alone; the sticker is made again from it only once the finger
// lets go (a pinch reports a new crop on every step, and each one would remake the sticker).
function CropField({ state, dispatch }: Pick<EditorProps, "state" | "dispatch">) {
  const url = state.source.url;
  const k = state.source.rgba.width / state.source.naturalWidth;
  const [view, setView] = useReducer((v: View, next: Partial<View>): View => ({ ...v, ...next }), {
    x: 0,
    y: 0,
    zoom: 1,
  });
  const held = useRef<{ active: boolean; area: Area | null }>({ active: false, area: null });
  const commit = (px: Area) =>
    dispatch({
      type: "crop-commit",
      crop: { x: px.x * k, y: px.y * k, size: Math.max(1, Math.min(px.width, px.height) * k) },
    });

  return (
    <div className={styles.cropper}>
      {url && (
        <Cropper
          image={url}
          crop={view}
          zoom={view.zoom}
          minZoom={1}
          maxZoom={8}
          aspect={1}
          objectFit="contain"
          onCropChange={({ x, y }) => setView({ x, y })}
          onZoomChange={(zoom) => setView({ zoom })}
          onInteractionStart={() => {
            held.current = { active: true, area: null };
          }}
          onInteractionEnd={() => {
            const { area } = held.current;
            held.current = { active: false, area: null };
            if (area) commit(area);
          }}
          onCropComplete={(_, px) => {
            if (held.current.active) held.current = { active: true, area: px };
            else commit(px);
          }}
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
                    snsKind: NO_SNS,
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

// The materials are shown as they would look on this very sticker; each is its own choice. Only
// the ones open to the maker are there, and a newly opened one arrives with a sparkle.
function MaterialField({
  state,
  d,
  dispatch,
}: Pick<EditorProps, "state" | "dispatch"> & { readonly d: Derived }) {
  const available = useSyncExternalStore(stickerStore.subscribe, availableKey).split(",");
  useSyncExternalStore(debug.subscribe, debug.get);
  const seen = useSyncExternalStore(materialsSeen.subscribe, materialsSeen.get);
  const palette = PALETTES[d.paletteId];
  const tone = d.sticker.material?.kind === "foil" ? d.sticker.material.tone : (d.used[0] ?? 0);
  const kinds = MATERIAL_KINDS.filter((k) => available.includes(k));
  const plain = { ...d.sticker, material: undefined };
  return (
    <fieldset className={styles.field}>
      <legend className={common.visuallyHidden}>{t.create.material}</legend>
      <div className={styles.materials} role="radiogroup" aria-label={t.create.material}>
        {kinds.map((kind, i) => {
          const name = t.create.materials[kind];
          const isNew = !seen.includes(kind);
          const preview =
            kind === "matte"
              ? plain
              : { ...plain, material: { kind, tone: kind === "foil" ? tone : 0 } };
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={state.material === kind}
              aria-label={isNew ? t.create.materialNew(name) : name}
              title={name}
              className={styles.material}
              data-new={isNew || undefined}
              style={{ "--i": i } as React.CSSProperties}
              onClick={() => dispatch({ type: "material", kind })}
            >
              <StickerView sticker={preview} scale={0} label="" decorative />
              {isNew && (
                <Sparkles
                  aria-hidden="true"
                  className={styles.newMark}
                  size={14}
                  strokeWidth={1.75}
                />
              )}
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

// a string, so the store hands back the same value while nothing changes
const availableKey = () => availableMaterials().join(",");

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
