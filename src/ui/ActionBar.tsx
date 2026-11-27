import { FlipHorizontal2, QrCode, Trash2 } from "lucide-react";
import { snsProfileUrl, type SnsOrNone } from "../core/sns.ts";
import type { StoredSticker } from "../data/sticker-store.ts";
import styles from "./ActionBar.module.css";
import common from "./common.module.css";
import { t } from "./messages.ts";
import { SnsHandle } from "./SnsIcon.tsx";
import { nameOf } from "./sticker-name.ts";

type Props = {
  readonly sticker: StoredSticker;
  readonly onQr: () => void;
  readonly onBack: () => void;
  readonly onDiscard: () => void;
};

export function ActionBar({ sticker, onQr, onBack, onDiscard }: Props) {
  const { snsKind, snsId } = sticker.sticker;
  const url = snsProfileUrl(snsKind, snsId);
  return (
    <div className={styles.bar} role="toolbar" aria-label={nameOf(sticker.sticker)}>
      <WhoLink kind={snsKind} id={snsId} url={url} />
      {sticker.origin === "mine" && (
        <button
          type="button"
          className={common.icon}
          aria-label={t.actionBar.showQr}
          title={t.actionBar.showQr}
          onClick={onQr}
        >
          <QrCode aria-hidden="true" size={20} strokeWidth={1.5} />
        </button>
      )}
      <button
        type="button"
        className={common.icon}
        aria-label={t.back.show}
        title={t.back.show}
        onClick={onBack}
      >
        <FlipHorizontal2 aria-hidden="true" size={20} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className={common.icon}
        aria-label={t.actionBar.discard}
        title={t.actionBar.discard}
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
  readonly kind: SnsOrNone;
  readonly id: string;
  readonly url: string | undefined;
}) {
  if (kind === 0) return <span className={styles.who} />;
  const inner = (
    <>
      <span className={styles.id}>
        <SnsHandle kind={kind} id={id} size={18} />
      </span>
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
