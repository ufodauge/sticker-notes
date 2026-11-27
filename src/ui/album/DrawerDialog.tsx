import type { CSSProperties } from "react";
import type { StoredSticker } from "../../data/sticker-store.ts";
import { Backing } from "../Backing.tsx";
import { Dialog } from "../Dialog.tsx";
import { useCloseDialog } from "../dialog-context.ts";
import { takeOut } from "../drawer.ts";
import { t } from "../messages.ts";
import { nameOf } from "../sticker-name.ts";
import { jumble } from "./jumble.ts";
import styles from "./PocketDialog.module.css";

type Props = {
  readonly stickers: readonly StoredSticker[];
  readonly onClose: () => void;
};

// The drawer, opened: the stickers in it, each on its backing; one tapped goes back into the
// pocket.
export function DrawerDialog({ stickers, onClose }: Props) {
  return (
    <Dialog label={t.drawer.dialog} onClose={onClose} className={styles.dialog}>
      <Pile stickers={stickers} />
    </Dialog>
  );
}

function Pile({ stickers }: { readonly stickers: readonly StoredSticker[] }) {
  const close = useCloseDialog();
  return (
    <div className={styles.pile}>
      {stickers.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className={styles.pick}
          aria-label={t.drawer.takeOut(nameOf(s.sticker))}
          style={
            {
              "--i": i,
              "--r": `${jumble(s.id, 34)}deg`,
              "--dy": `${jumble(s.id, 18, 10)}px`,
            } as CSSProperties
          }
          onClick={() => {
            void takeOut(s.id);
            if (stickers.length === 1) close();
          }}
        >
          <Backing sticker={s} small />
        </button>
      ))}
    </div>
  );
}
