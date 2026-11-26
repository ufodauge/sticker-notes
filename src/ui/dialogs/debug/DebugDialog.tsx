import { Shuffle } from "lucide-react";
import { useSyncExternalStore } from "react";
import { madeUpSticker } from "../../../core/made-up.ts";
import { encodeBody, encodeFragment } from "../../../core/payload.ts";
import { hashStore } from "../../../data/location-hash.ts";
import { daylight } from "../../scene/clock.ts";
import common from "../../common.module.css";
import { debug } from "../../debug.ts";
import { Dialog } from "../../Dialog.tsx";
import { useCloseDialog } from "../../dialog-context.ts";
import { debugText } from "../../messages.ts";
import styles from "./DebugDialog.module.css";

export function DebugDialog({ onClose }: { readonly onClose: () => void }) {
  const state = useSyncExternalStore(debug.subscribe, debug.get);
  return (
    <Dialog label={debugText.dialog} onClose={onClose}>
      <div className={styles.body}>
        <Simulate />
        <Hour />
        <label className={styles.switch}>
          <span>{debugText.unlockAll}</span>
          <input
            type="checkbox"
            role="switch"
            checked={state.unlockAll}
            onChange={(e) => debug.setUnlockAll(e.currentTarget.checked)}
          />
        </label>
        <button type="button" className={common.button} onClick={debug.turnOff}>
          {debugText.off}
        </button>
      </div>
    </Dialog>
  );
}

// Someone else's sticker arrives, as by a link: the whole receiving side of an exchange plays,
// and the giver counts as a new person.
function Simulate() {
  const close = useCloseDialog();
  return (
    <div className={styles.simulate}>
      <button
        type="button"
        className={common.primary}
        onClick={() => {
          close();
          const seed = Math.floor(Math.random() * 2 ** 31);
          hashStore.open(encodeFragment(encodeBody(madeUpSticker(seed))));
        }}
      >
        <Shuffle aria-hidden="true" size={18} strokeWidth={1.5} />
        {debugText.simulate}
      </button>
      <p className={common.muted}>{debugText.simulateHint}</p>
    </div>
  );
}

// Looks at the desk at another hour (the app itself only ever follows the clock).
function Hour() {
  const shifted = useSyncExternalStore(daylight.subscribe, daylight.shifted);
  return (
    <label className={styles.switch}>
      <span>{debugText.hour}</span>
      <select
        value={shifted === null ? "" : String(shifted / 60)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          daylight.shift(v === "" ? null : Number(v) * 60);
        }}
      >
        <option value="">{debugText.hourClock}</option>
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {debugText.hourAt(h)}
          </option>
        ))}
      </select>
    </label>
  );
}
