export function mulberry32(seed: number): () => number {
  const state = new Uint32Array([seed]);
  return () => {
    state[0] = (state[0] ?? 0) + 0x6d2b79f5;
    const s = state[0] ?? 0;
    const t1 = Math.imul(s ^ (s >>> 15), s | 1);
    const t2 = (t1 + Math.imul(t1 ^ (t1 >>> 7), t1 | 61)) ^ t1;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}
