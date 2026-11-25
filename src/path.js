/* A* 尋路（二元堆積）。不碰 DOM。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';

/* ============================== Path（A*，二元堆積） ============================== */
export const Path = {
  g: new Float32Array(N), came: new Int32Array(N), seen: new Int32Array(N), closed: new Int32Array(N),
  H: new Int32Array(N * 8), HF: new Float32Array(N * 8), run: 0,
  find(start, goal, cost) {
    const run = ++this.run, g = this.g, came = this.came, seen = this.seen, closed = this.closed, H = this.H, HF = this.HF;
    const gx = ix(goal), gy = iy(goal);
    let hn = 0;
    const push = (n, f) => {
      if (hn >= H.length) return;
      let i = hn++;
      while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= f) break; H[i] = H[p]; HF[i] = HF[p]; i = p; }
      H[i] = n; HF[i] = f;
    };
    const pop = () => {
      const top = H[0]; hn--;
      if (hn > 0) {
        const n = H[hn], f = HF[hn]; let i = 0;
        for (;;) { const l = 2 * i + 1; if (l >= hn) break; const r = l + 1, m = r < hn && HF[r] < HF[l] ? r : l; if (HF[m] >= f) break; H[i] = H[m]; HF[i] = HF[m]; i = m; }
        H[i] = n; HF[i] = f;
      }
      return top;
    };
    seen[start] = run; g[start] = 0; came[start] = -1; push(start, 0);
    let found = false;
    while (hn > 0) {
      const cur = pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === goal) { found = true; break; }
      const cx = ix(cur), cy = iy(cur);
      for (const [dx, dy] of DIR4) {
        const nx = cx + dx, ny = cy + dy; if (!inB(nx, ny)) continue;
        const ni = idx(nx, ny); if (closed[ni] === run) continue;
        const c = cost(ni); if (c === Infinity) continue;
        const ng = g[cur] + c;
        if (seen[ni] !== run || ng < g[ni]) { seen[ni] = run; g[ni] = ng; came[ni] = cur; push(ni, ng + Math.abs(nx - gx) + Math.abs(ny - gy)); }
      }
    }
    if (!found) return null;
    const out = []; let n = goal;
    while (n !== start) { out.push(n); n = came[n]; }
    return out.reverse();
  },
};
