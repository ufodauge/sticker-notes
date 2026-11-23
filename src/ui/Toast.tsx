import { Undo2 } from "lucide-react";
import common from "./common.module.css";
import type { Toast as ToastData } from "./feedback.ts";
import styles from "./Toast.module.css";

type Props = { readonly toast: ToastData; readonly onUndo: () => void };

export function Toast({ toast, onUndo }: Props) {
  return (
    <div className={styles.toast} role="status">
      <span className={styles.text}>{toast.text}</span>
      {toast.undo && (
        <button type="button" className={`${common.button} ${styles.undo}`} onClick={onUndo}>
          <Undo2 aria-hidden="true" size={16} strokeWidth={1.5} />
          元に戻す
        </button>
      )}
    </div>
  );
}
