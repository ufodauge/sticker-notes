// The saved view lives in IndexedDB, which is read after the first paint. This copy in
// localStorage is read by a script in index.html before it, so a reload in the jar does not
// flash the page's light background. Only a hint: the real setting stays in IndexedDB.
const VIEW_HINT_KEY = "view-hint";

export function writeViewHint(view: "album" | "jar"): void {
  try {
    localStorage.setItem(VIEW_HINT_KEY, view);
  } catch {
    // private mode or blocked storage: the first paint is just the page's own colours
  }
}
