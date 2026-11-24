// The jar is a dark room whatever the system theme: while it is shown, the document says so (the
// dark tokens and `color-scheme` in index.css hang on it) and the browser's own bars follow.
// Used from a ref callback, so entering and leaving happen in the same commit as the switch
// itself: no frame shows the jar in the album's colours or the album in the jar's.

const ROOM = "#08080a";

// Returns the cleanup that undoes it. `shown` false only clears what the early script in
// index.html guessed from the saved view (the album, or an empty jar).
export function jarChrome(shown: boolean): (() => void) | undefined {
  const root = document.documentElement;
  if (!shown) {
    delete root.dataset.view;
    return undefined;
  }
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = ROOM;
  // first in the head, so it wins over the themed ones in index.html
  document.head.prepend(meta);
  root.dataset.view = "jar";
  return () => {
    meta.remove();
    delete root.dataset.view;
  };
}
