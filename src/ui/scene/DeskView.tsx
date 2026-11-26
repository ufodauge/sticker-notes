import type { Highlight } from "../feedback.ts";
import type { Ready } from "../../data/sticker-store.ts";
import { Album } from "../album/Album.tsx";
import { DeskPlane } from "./DeskTop.tsx";
import styles from "./DeskView.module.css";
import { Desk } from "./Room.tsx";

// The scene: a desk larger than the screen where the screen is small (scrolled by dragging the
// bare wood), the wood itself, the stickers lying on it, and the album in the middle of it.

type Props = {
  readonly snap: Ready;
  readonly selected: string | null;
  readonly highlight: Highlight | null;
  readonly leaving: string | null;
  readonly onSelect: (placementId: string | null) => void;
  readonly onLeft: () => void;
  readonly onCreate: () => void;
};

// The desk can be larger than the screen; it opens with the album in the middle of the view.
// (A ref callback: it runs once, when the desk is first laid out.)
function centreOnce(el: HTMLElement | null): void {
  if (!el || el.dataset.centred) return;
  el.dataset.centred = "";
  el.scrollTo({
    left: (el.scrollWidth - el.clientWidth) / 2,
    top: (el.scrollHeight - el.clientHeight) / 2,
  });
}

export function DeskView({
  snap,
  selected,
  highlight,
  leaving,
  onSelect,
  onLeft,
  onCreate,
}: Props) {
  return (
    <div className={styles.scroller} ref={centreOnce} data-desk-view="">
      <div className={styles.table}>
        <Desk />
        <DeskPlane snap={snap} selected={selected} onSelect={onSelect} />
        <div className={styles.album}>
          <Album
            snap={snap}
            selected={selected}
            highlight={highlight}
            leaving={leaving}
            onSelect={onSelect}
            onLeft={onLeft}
            onCreate={onCreate}
          />
        </div>
      </div>
    </div>
  );
}
