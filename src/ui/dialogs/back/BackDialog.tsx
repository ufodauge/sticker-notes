import { Repeat2, Users } from "lucide-react";
import { useReducer } from "react";
import { peopleOf, personKey } from "../../../core/people.ts";
import type { StoredSticker } from "../../../data/sticker-store.ts";
import { Backing } from "../../Backing.tsx";
import common from "../../common.module.css";
import { Dialog } from "../../Dialog.tsx";
import { t } from "../../messages.ts";
import { StickerView } from "../../StickerView.tsx";
import styles from "./BackDialog.module.css";

type Props = {
  readonly sticker: StoredSticker;
  readonly all: readonly StoredSticker[];
  readonly onPerson: (key: string) => void;
  readonly onClose: () => void;
};

// The sticker turns over as the dialog opens; the back says who it came from and when.
export function BackDialog({ sticker, all, onPerson, onClose }: Props) {
  const [front, flip] = useReducer((f: boolean) => !f, false);
  const key = personKey(sticker.sticker.snsKind, sticker.sticker.snsId);
  const person =
    sticker.origin === "received" ? peopleOf(all).find((p) => p.key === key) : undefined;
  return (
    <Dialog label={t.back.dialog} onClose={onClose}>
      <div className={styles.body}>
        <button
          type="button"
          className={styles.card}
          data-front={front || undefined}
          aria-label={t.back.flip}
          title={t.back.flip}
          onClick={flip}
        >
          <span className={styles.face}>
            <StickerView sticker={sticker.sticker} scale={0} label="" decorative />
          </span>
          <span className={`${styles.face} ${styles.back}`}>
            <Backing sticker={sticker} className={styles.paper}>
              <Repeat2 aria-hidden="true" size={20} strokeWidth={1.25} />
            </Backing>
          </span>
        </button>
        {person && (
          <button type="button" className={common.button} onClick={() => onPerson(person.key)}>
            <Users aria-hidden="true" size={18} strokeWidth={1.5} />
            {t.back.fromPerson(person.stickerIds.length)}
          </button>
        )}
      </div>
    </Dialog>
  );
}
