import { peopleOf, type Person } from "../../../core/people.ts";
import { snsDisplay, snsProfileUrl } from "../../../core/sns.ts";
import type { StoredSticker } from "../../../data/sticker-store.ts";
import common from "../../common.module.css";
import { Dialog } from "../../Dialog.tsx";
import { t } from "../../messages.ts";
import { SnsIcon } from "../../SnsIcon.tsx";
import { StickerView } from "../../StickerView.tsx";
import styles from "./PeopleDialog.module.css";

type Props = {
  readonly stickers: readonly StoredSticker[];
  readonly focus: string | undefined;
  readonly onClose: () => void;
};

const showFocused = (el: HTMLElement | null) => {
  el?.scrollIntoView({ block: "center" });
};

// Everyone a sticker came from, the earliest first: the album as a record of exchanges.
export function PeopleDialog({ stickers, focus, onClose }: Props) {
  const people = peopleOf(stickers);
  const byId = new Map(stickers.map((s) => [s.id, s]));
  return (
    <Dialog label={t.people.dialog} onClose={onClose}>
      {people.length === 0 ? (
        <p className={`${common.muted} ${styles.none}`}>{t.people.none}</p>
      ) : (
        <ul className={styles.list}>
          {people.map((p) => (
            <li
              key={p.key}
              ref={p.key === focus ? showFocused : undefined}
              className={styles.person}
              data-focus={p.key === focus || undefined}
            >
              <Who person={p} />
              <p className={styles.meta}>
                <span>{t.people.count(p.stickerIds.length)}</span>
                {p.first && <span>{t.people.since(t.pocket.date(p.first))}</span>}
              </p>
              <span className={styles.stickers}>
                {p.stickerIds.flatMap((id) => {
                  const s = byId.get(id);
                  return s
                    ? [<StickerView key={id} sticker={s.sticker} scale={0} label="" decorative />]
                    : [];
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function Who({ person }: { readonly person: Person }) {
  const url = snsProfileUrl(person.kind, person.id);
  const inner = (
    <>
      <SnsIcon kind={person.kind} size={16} />
      <span className={styles.id}>{snsDisplay(person.kind, person.id)}</span>
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
