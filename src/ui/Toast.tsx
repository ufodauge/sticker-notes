import { X } from "lucide-react";
import common from "./common.module.css";
import type { Toast as ToastData } from "./feedback.ts";
import { t } from "./messages.ts";
import styles from "./Toast.module.css";

type Props = {
  readonly toast: ToastData;
  readonly onDismiss: () => void;
};

export function Toast({ toast, onDismiss }: Props) {
  return (
    <div className={styles.toast} role="status">
      <span className={styles.text}>{toast.text}</span>
      {toast.persistent && (
        <button
          type="button"
          className={`${common.icon} ${styles.dismiss}`}
          aria-label={t.common.dismiss}
          title={t.common.dismiss}
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
