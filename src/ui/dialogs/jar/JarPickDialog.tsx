import { useReducer, useSyncExternalStore } from "react";
import { JAR_MAX_COUNT, pickJarIds, toggleJarId } from "../../../core/jar-selection.ts";
import { snsDisplay } from "../../../core/sns.ts";
import type { StoredSticker } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { useCloseDialog } from "../../dialog-context.ts";
import { Dialog } from "../../Dialog.tsx";
import { jarContent } from "../../jar/jar-prefs.ts";
import { t } from "../../messages.ts";
import { StickerView } from "../../StickerView.tsx";
import styles from "./JarPickDialog.module.css";

type Props = { readonly stickers: readonly StoredSticker[]; readonly onClose: () => void };

export function JarPickDialog({ stickers, onClose }: Props) {
  return (
    <Dialog label={t.jarPick.dialog} onClose={onClose}>
      <PickBody stickers={stickers} />
    </Dialog>
  );
}

function PickBody({ stickers }: { readonly stickers: readonly StoredSticker[] }) {
  const close = useCloseDialog();
  const selection = useSyncExternalStore(jarContent.subscribe, jarContent.get);
  const [chosen, toggle] = useReducer(toggleJarId, selection, (current): readonly string[] =>
    pickJarIds(
      current,
      stickers.map((s) => s.id),
    ),
  );
  const full = chosen.length >= JAR_MAX_COUNT;

  return (
    <div className={styles.body}>
      <ul className={styles.list}>
        {stickers.map((s) => {
          const checked = chosen.includes(s.id);
          const name = snsDisplay(s.sticker.snsKind, s.sticker.snsId);
          return (
            <li key={s.id}>
              <label className={styles.item}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(s.id)}
                />
                <StickerView sticker={s.sticker} scale={1} label={name} decorative />
                <span className={styles.who}>{name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className={styles.footer}>
        <output className={styles.counter}>
          {t.jarPick.counter(chosen.length, JAR_MAX_COUNT)}
        </output>
        {selection.kind === "manual" && (
          <button
            type="button"
            className={common.button}
            onClick={() => {
              jarContent.shuffle();
              close();
            }}
          >
            {t.jarPick.random}
          </button>
        )}
        <button
          type="button"
          className={common.primary}
          disabled={chosen.length === 0}
          onClick={() => {
            jarContent.set({ kind: "manual", ids: [...chosen] });
            close();
          }}
        >
          {t.jarPick.apply}
        </button>
      </div>
    </div>
  );
}
