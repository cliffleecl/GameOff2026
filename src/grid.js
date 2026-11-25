/* 格子地圖：廢墟（rock）、矮牆（low）、玩家放的設施（cells）。不碰 DOM。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';

/* ============================== Grid ============================== */
export const Grid = {
  cells: new Array(N).fill(null), rock: new Uint8Array(N),
  low: new Uint8Array(N),           // 場景裡的矮牆：你和跑酷殭屍跨得過，其他殭屍過不去，也拆不掉
  reset() { this.cells.fill(null); },
  isObstacle(i) { const c = this.cells[i]; return !!c && c.type === 'obstacle'; },
  /** vault = 這個實體能不能跨越障礙（玩家、跑酷殭屍） */
  /** 可以翻越的格子：你放的障礙＋場景矮牆 */
  isVaultable(i) { return this.low[i] === 1 || this.isObstacle(i); },
  blocks(i, vault) { return this.rock[i] === 1 || (!vault && this.isVaultable(i)); },
  solid(x, y, vault) { return !inB(x, y) || this.blocks(idx(x, y), vault); },
  free(i) { return !this.rock[i] && !this.low[i] && !this.cells[i]; },
  place(i, type) { const d = CFG.BUILD[type]; this.cells[i] = { type, hp: d.hp || 0, uses: d.uses || 0 }; },
  remove(i) { this.cells[i] = null; },
  count(type) { let n = 0; for (const c of this.cells) if (c && (!type || c.type === type)) n++; return n; },
  generate() {
    const M = CFG.MAP, rock = this.rock, low = this.low; rock.fill(0); low.fill(0);
    const nearRadio = (x, y) => Math.hypot(x + 0.5 - RADIO.x, y + 0.5 - RADIO.y) < M.clearRadius;
    for (let k = 0; k < M.blobs; k++) {
      let x = Math.random() * C | 0, y = Math.random() * R | 0;
      const len = rnd(M.blobLen[0], M.blobLen[1]) | 0;
      for (let j = 0; j < len; j++) {
        if (!nearRadio(x, y)) rock[idx(x, y)] = 1;
        const [dx, dy] = DIR4[Math.random() * 4 | 0]; x = clamp(x + dx, 0, C - 1); y = clamp(y + dy, 0, R - 1);
      }
    }
    for (let k = 0; k < M.segments; k++) {
      const hor = Math.random() < 0.5, len = rnd(M.segLen[0], M.segLen[1]) | 0;
      let x = Math.random() * C | 0, y = Math.random() * R | 0;
      const isLow = Math.random() < M.lowShare;     // 大部分斷牆是矮牆，翻得過去
      for (let j = 0; j < len; j++) { if (inB(x, y) && !nearRadio(x, y) && !rock[idx(x, y)] && Math.random() > 0.12) (isLow ? low : rock)[idx(x, y)] = 1; hor ? x++ : y++; }
    }
    const seen = new Uint8Array(N), q = [cellOf(RADIO.x, RADIO.y)]; seen[q[0]] = 1;
    while (q.length) { const c = q.pop(); for (const [dx, dy] of DIR4) { const x = ix(c) + dx, y = iy(c) + dy; if (!inB(x, y)) continue; const n = idx(x, y); if (!seen[n] && !rock[n] && !low[n]) { seen[n] = 1; q.push(n); } } }
    for (let i = 0; i < N; i++) if (!seen[i] && !low[i]) rock[i] = 1;   // 不翻牆到不了的空地封起來，確保殭屍都追得到你
  },
};
