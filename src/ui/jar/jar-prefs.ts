import { DEFAULT_JAR_SELECTION, pickJarIds, type JarSelection } from "../../core/jar-selection.ts";
import type { SettingValue } from "../../data/settings.ts";
import { settings, stickerStore, type StoredSticker } from "../../data/sticker-store.ts";
import { loadJar } from "./jar-lazy.ts";

export type Startup = { readonly view: SettingValue<"view"> };
type Listener = () => void;

const state: { selection: JarSelection; listeners: Set<Listener> } = {
  selection: DEFAULT_JAR_SELECTION,
  listeners: new Set(),
};

async function load(): Promise<Startup> {
  const [view, selection] = await Promise.all([
    settings.get("view").catch(() => null),
    settings.get("jar").catch(() => null),
  ]);
  state.selection = selection ?? DEFAULT_JAR_SELECTION;
  if (view === "jar") void loadJar();
  return { view: view ?? "album" };
}

// Read once before the first paint (Suspense `use`): the saved mode and jar content are already
// in place when the app first renders, so there is no flash of the other mode.
const startupCache: { p?: Promise<Startup> } = {};
export const startupPrefs = (): Promise<Startup> => (startupCache.p ??= load());

export const jarContent = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    return () => state.listeners.delete(l);
  },
  get: (): JarSelection => state.selection,
  set: (selection: JarSelection): void => {
    state.selection = selection;
    state.listeners.forEach((l) => l());
    void settings.set("jar", selection).catch(() => {});
  },
  shuffle: (): void => {
    jarContent.set({ kind: "auto", seed: Math.floor(Math.random() * 2 ** 31) });
  },
};

export function shownStickers(
  stickers: readonly StoredSticker[],
  selection: JarSelection,
): StoredSticker[] {
  const byId = new Map(stickers.map((s) => [s.id, s]));
  return pickJarIds(
    selection,
    stickers.map((s) => s.id),
  ).flatMap((id) => byId.get(id) ?? []);
}

export function currentShown(): StoredSticker[] {
  const snap = stickerStore.getSnapshot();
  return snap.status === "ready" ? shownStickers(snap.stickers, state.selection) : [];
}
