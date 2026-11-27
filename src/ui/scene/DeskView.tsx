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
// The light (Room.tsx) falls on the desk, not on the screen: how far the desk has been moved from
// the middle is handed to it as --pan-x/--pan-y (on the scene around both), so the window's patch
// of sun, the plant's shadow and the lamp's pool move with the wood.
function centreOnce(el: HTMLElement | null) {
  if (!el) return undefined;
  if (!el.dataset.centred) {
    el.dataset.centred = "";
    el.scrollTo({
      left: (el.scrollWidth - el.clientWidth) / 2,
      top: (el.scrollHeight - el.clientHeight) / 2,
    });
  }
  const scene = el.parentElement;
  const pan = () => {
    scene?.style.setProperty(
      "--pan-x",
      `${(el.scrollWidth - el.clientWidth) / 2 - el.scrollLeft}px`,
    );
    scene?.style.setProperty(
      "--pan-y",
      `${(el.scrollHeight - el.clientHeight) / 2 - el.scrollTop}px`,
    );
  };
  pan();
  const stop = new AbortController();
  el.addEventListener("scroll", pan, { passive: true, signal: stop.signal });
  addEventListener("resize", pan, { signal: stop.signal });
  return () => stop.abort();
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
