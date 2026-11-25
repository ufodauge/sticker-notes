import { useSyncExternalStore } from "react";
import common from "../../common.module.css";
import { debug } from "../../debug.ts";
import { Dialog } from "../../Dialog.tsx";
import { t } from "../../messages.ts";
import styles from "./DebugDialog.module.css";

export function DebugDialog({ onClose }: { readonly onClose: () => void }) {
  const state = useSyncExternalStore(debug.subscribe, debug.get);
  return (
    <Dialog label={t.debug.dialog} onClose={onClose}>
      <div className={styles.body}>
        <label className={styles.switch}>
          <span>{t.debug.unlockAll}</span>
          <input
            type="checkbox"
            role="switch"
            checked={state.unlockAll}
            onChange={(e) => debug.setUnlockAll(e.currentTarget.checked)}
          />
        </label>
        <button type="button" className={common.button} onClick={debug.turnOff}>
          {t.debug.off}
        </button>
      </div>
    </Dialog>
  );
}
