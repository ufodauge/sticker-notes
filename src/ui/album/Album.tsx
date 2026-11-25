import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useCallback, useRef, type PointerEvent, type WheelEvent } from "react";
import { slotCenter, sortedPages } from "../../core/album.ts";
import { stickerStore, type Ready } from "../../data/sticker-store.ts";
import type { Highlight } from "../feedback.ts";
import { t } from "../messages.ts";
import styles from "./Album.module.css";
import { trackPages } from "./page-position.ts";
import { PageCanvas } from "./PageCanvas.tsx";

type Props = {
  readonly dark: boolean;
  readonly snap: Ready;
  readonly selected: string | null;
  readonly highlight: Highlight | null;
  readonly leaving: string | null;
  readonly onSelect: (placementId: string | null) => void;
  readonly onLeft: () => void;
  readonly onCreate: () => void;
};

const WHEEL_PAGE_MS = 420;

export function Album(props: Props) {
  const { dark, snap, selected, highlight, leaving, onSelect, onLeft, onCreate } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  // keep the element for handlers and track the centred page; the identity must stay stable,
  const attach = useCallback((el: HTMLDivElement | null) => {
    scroller.current = el;
    return trackPages(el);
  }, []);
  const lastWheel = useRef(0);
  const byId = new Map(snap.stickers.map((s) => [s.id, s]));
  const pages = sortedPages(snap.pages);
  const first = slotCenter(0);

  const addPage = async () => {
    const id = await stickerStore.addPage();
    requestAnimationFrame(() => {
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.current?.querySelector(`[data-page="${CSS.escape(id)}"]`)?.scrollIntoView({
        behavior: reduced ? "auto" : "smooth",
        inline: "center",
        block: "nearest",
      });
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    el.setAttribute("data-grabbing", "");
    const listening = new AbortController();
    window.addEventListener(
      "pointermove",
      (m) => {
        el.scrollLeft = startLeft - (m.clientX - startX);
      },
      { signal: listening.signal },
    );
    window.addEventListener(
      "pointerup",
      () => {
        listening.abort();
        el.removeAttribute("data-grabbing");
      },
      { signal: listening.signal },
    );
  };

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el || Math.abs(e.deltaY) < Math.abs(e.deltaX) || Math.abs(e.deltaY) < 4) return;
    if (e.timeStamp - lastWheel.current < WHEEL_PAGE_MS) return;
    lastWheel.current = e.timeStamp;
    const page = el.querySelector<HTMLElement>("[data-page]");
    const step = (page?.offsetWidth ?? el.clientWidth) * Math.sign(e.deltaY);
    el.scrollBy({ left: step, behavior: "smooth" });
  };

  return (
    <div
      ref={attach}
      className={styles.scroller}
      data-scroller=""
      onPointerDown={onPointerDown}
      onWheel={onWheel}
    >
      {pages.length === 0 ? (
        <section className={styles.page} data-page="">
          <PageCanvas
            dark={dark}
            pageId=""
            placements={[]}
            stickers={byId}
            selected={null}
            highlight={null}
            leaving={null}
            onLeft={onLeft}
            onSelect={onSelect}
          >
            <button
              type="button"
              className={styles.slot}
              style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
              aria-label={t.album.createFirst}
              onClick={onCreate}
            >
              <ImagePlus aria-hidden="true" size={28} strokeWidth={1.25} />
            </button>
          </PageCanvas>
        </section>
      ) : (
        <>
          {pages.map((page, i) => {
            const onPage = snap.placements.filter((p) => p.pageId === page.id);
            return (
              <section
                key={page.id}
                className={styles.page}
                data-page={page.id}
                aria-label={t.album.pageLabel(i + 1)}
              >
                <PageCanvas
                  dark={dark}
                  pageId={page.id}
                  placements={onPage}
                  stickers={byId}
                  selected={selected}
                  highlight={highlight}
                  leaving={leaving}
                  onLeft={onLeft}
                  onSelect={onSelect}
                >
                  {onPage.length === 0 && pages.length > 1 && (
                    <button
                      type="button"
                      className={styles.removePage}
                      aria-label={t.album.removePage.label(i + 1)}
                      title={t.album.removePage.tooltip}
                      onClick={() => void stickerStore.deletePage(page.id)}
                    >
                      <Trash2 aria-hidden="true" size={18} strokeWidth={1.5} />
                    </button>
                  )}
                </PageCanvas>
              </section>
            );
          })}
          <section className={styles.page} data-new-page="">
            <button
              type="button"
              className={styles.newPage}
              aria-label={t.album.addPage}
              title={t.album.addPage}
              onClick={() => void addPage()}
            >
              <Plus aria-hidden="true" size={32} strokeWidth={1.25} />
            </button>
          </section>
        </>
      )}
    </div>
  );
}
