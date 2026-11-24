import type { Oklab } from "./palette.ts";
import { STICKER_SIZE } from "./payload.ts";

const N = STICKER_SIZE;

export function boxBlur3(lab: readonly Oklab[], opaque: readonly boolean[]): readonly Oklab[] {
  return lab.map((_, p) => {
    const x = p % N;
    const y = Math.floor(p / N);
    let L = 0;
    let a = 0;
    let b = 0;
    let count = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const q = Math.min(N - 1, Math.max(0, y + dy)) * N + Math.min(N - 1, Math.max(0, x + dx));
        const c = lab[q];
        if (!c || !opaque[q]) continue;
        L += c[0];
        a += c[1];
        b += c[2];
        count++;
      }
    return count === 0 ? [0, 0, 0] : [L / count, a / count, b / count];
  });
}

export function blurredError(
  blurredSource: readonly Oklab[],
  result: readonly Oklab[],
  opaque: readonly boolean[],
): number {
  const blurredResult = boxBlur3(result, opaque);
  return blurredSource.reduce((sum, s, p) => {
    const r = blurredResult[p];
    if (!opaque[p] || !r) return sum;
    const dL = s[0] - r[0];
    const da = s[1] - r[1];
    const db = s[2] - r[2];
    return sum + dL * dL + da * da + db * db;
  }, 0);
}
