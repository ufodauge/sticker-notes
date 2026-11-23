export function assignMinCost(cost: readonly (readonly number[])[]): readonly number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  if (n === 0) return [];
  if (n > m) throw new Error("more rows than columns");
  const INF = Number.POSITIVE_INFINITY;
  // 1-indexed potentials and matching, as in the classic formulation
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row matched to column j
  const way = new Array<number>(m + 1).fill(0);
  const c = (i: number, j: number) => cost[i - 1]?.[j - 1] ?? INF;
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);
    let j0 = 0;
    do {
      used[j0] = true;
      const i0 = p[j0] ?? 0;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = c(i0, j) - (u[i0] ?? 0) - (v[j] ?? 0);
        if (cur < (minv[j] ?? INF)) {
          minv[j] = cur;
          way[j] = j0;
        }
        if ((minv[j] ?? INF) < delta) {
          delta = minv[j] ?? INF;
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j] ?? 0] = (u[p[j] ?? 0] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else {
          minv[j] = (minv[j] ?? INF) - delta;
        }
      }
      j0 = j1;
    } while ((p[j0] ?? 0) !== 0);
    do {
      const j1 = way[j0] ?? 0;
      p[j0] = p[j1] ?? 0;
      j0 = j1;
    } while (j0 !== 0);
  }
  const rowToCol = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if ((p[j] ?? 0) > 0) rowToCol[(p[j] ?? 1) - 1] = j - 1;
  return rowToCol;
}
