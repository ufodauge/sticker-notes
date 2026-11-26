// Flags a test run sets in the browser before the app starts (read only by debug builds).
export function testFlag(name: "skip-tutorial"): boolean {
  try {
    return localStorage.getItem(`sticker-notes:${name}`) === "1";
  } catch {
    return false;
  }
}
