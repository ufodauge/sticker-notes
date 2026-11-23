import { QrCode, Trash2 } from "lucide-react";
import { snsDisplay, snsProfileUrl, type SnsKind } from "../core/sns.ts";
import type { StoredSticker } from "../data/sticker-store.ts";
import styles from "./ActionBar.module.css";
import common from "./common.module.css";
import { SnsIcon } from "./SnsIcon.tsx";

type Props = {
  readonly sticker: StoredSticker;
  readonly onQr: () => void;
  readonly onDiscard: () => void;
};

export function ActionBar({ sticker, onQr, onDiscard }: Props) {
  const { snsKind, snsId } = sticker.sticker;
  const url = snsProfileUrl(snsKind, snsId);
  return (
    <div className={styles.bar} role="toolbar" aria-label={snsDisplay(snsKind, snsId)}>
      <WhoLink kind={snsKind} id={snsId} url={url} />
      {sticker.origin === "mine" && (
        <button
          type="button"
          className={common.icon}
          aria-label="QRを出す"
          title="QRを出す"
          onClick={onQr}
        >
          <QrCode aria-hidden="true" size={20} strokeWidth={1.5} />
        </button>
      )}
      <button
        type="button"
        className={common.icon}
        aria-label="捨てる"
        title="捨てる"
        onClick={onDiscard}
      >
        <Trash2 aria-hidden="true" size={20} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function WhoLink({
  kind,
  id,
  url,
}: {
  readonly kind: SnsKind;
  readonly id: string;
  readonly url: string | undefined;
}) {
  const inner = (
    <>
      <span className={styles.kind}>
        <SnsIcon kind={kind} size={18} />
      </span>
      <span className={styles.id}>{kind === 3 ? id : `@${id}`}</span>
    </>
  );
  return url ? (
    <a className={styles.who} href={url} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <span className={styles.who}>{inner}</span>
  );
}
