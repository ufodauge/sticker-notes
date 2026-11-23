import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import common from "./common.module.css";
import { CloseContext } from "./dialog-context.ts";
import styles from "./Dialog.module.css";

const CLOSE_MS = 220;

type Props = {
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly variant?: "sheet" | "full";
  readonly className?: string;
};

export function Dialog({ label, onClose, children, variant, className }: Props) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const attach = (el: HTMLDialogElement | null) => {
    ref.current = el;
    if (el && !el.open) {
      el.showModal();
    }
  };
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const close = () => {
    ref.current?.close();
  };

  return (
    <dialog
      ref={attach}
      aria-label={label}
      className={`${styles.dialog} ${styles[variant ?? "sheet"]} ${className ?? ""}`}
      closedby="any"
      onClose={() => {
        if (reduced) {
          onClose();
        } else {
          setTimeout(onClose, CLOSE_MS);
        }
      }}
    >
      <CloseContext value={close}>
        <button
          type="button"
          className={`${common.icon} ${styles.close}`}
          aria-label="閉じる"
          onClick={close}
        >
          <X aria-hidden="true" size={20} strokeWidth={1.5} />
        </button>
        {children}
      </CloseContext>
    </dialog>
  );
}
