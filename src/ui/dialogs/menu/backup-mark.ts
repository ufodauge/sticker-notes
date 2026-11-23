import type { SettingValue } from "../../../data/settings.ts";
import { settings } from "../../../data/sticker-store.ts";

const REMIND_EVERY = 10;

type Mark = SettingValue<"backup"> | null;
type Listener = () => void;

const state: { mark: Mark; loaded: boolean; listeners: Set<Listener> } = {
  mark: null,
  loaded: false,
  listeners: new Set(),
};

export const backupMarkCache = {
  subscribe: (l: Listener): (() => void) => {
    state.listeners.add(l);
    if (!state.loaded) {
      state.loaded = true;
      void settings
        .get("backup")
        .catch(() => null)
        .then((m) => backupMarkCache.set(m));
    }
    return () => state.listeners.delete(l);
  },
  get: (): Mark => state.mark,
  set: (m: Mark): void => {
    state.mark = m;
    state.listeners.forEach((l) => l());
  },
};

export function backupDue(receivedCount: number, mark: Mark): boolean {
  return receivedCount - (mark?.receivedCount ?? 0) >= REMIND_EVERY;
}
