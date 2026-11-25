/* 碰撞、視線、路徑拉直、速度混合等共用工具。不碰 DOM。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Grid } from './grid.js';
import { knowsTrap } from './memory.js';

/* ---------- 碰撞與路徑工具（都帶 vault 參數） ---------- */
export function resolve(e) {
  const v = !!e.vault, cx = Math.floor(e.x), cy = Math.floor(e.y);
  if (Grid.solid(cx, cy, v)) {
    let best = null, bd = 9;
    for (const [dx, dy] of DIR4) {
      if (Grid.solid(cx + dx, cy + dy, v)) continue;
      const d = Math.hypot(cx + dx + 0.5 - e.x, cy + dy + 0.5 - e.y);
      if (d < bd) { bd = d; best = [cx + dx, cy + dy]; }
    }
    if (best) { e.x = best[0] + 0.5 - (best[0] - cx) * 0.45; e.y = best[1] + 0.5 - (best[1] - cy) * 0.45; }
    return;
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = cx + dx, gy = cy + dy;
    if (!Grid.solid(gx, gy, v)) continue;
    const qx = clamp(e.x, gx, gx + 1), qy = clamp(e.y, gy, gy + 1);
    const ddx = e.x - qx, ddy = e.y - qy, d = Math.hypot(ddx, ddy);
    if (d < e.r && d > 1e-6) { e.x += ddx / d * (e.r - d); e.y += ddy / d * (e.r - d); }
  }
}
export function clearLine(ax, ay, bx, by, r, vault) {
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  if (d < 1e-4) return true;
  const nx = -dy / d * r, ny = dx / d * r, n = Math.ceil(d / 0.25);
  for (let k = 1; k <= n; k++) {
    const t = k / n, x = ax + dx * t, y = ay + dy * t;
    if (Grid.solid(Math.floor(x), Math.floor(y), vault) || Grid.solid(Math.floor(x + nx), Math.floor(y + ny), vault) || Grid.solid(Math.floor(x - nx), Math.floor(y - ny), vault)) return false;
  }
  return true;
}
/** 視線：只有廢墟會擋（障礙很矮，看得過去） */
export const sight = (ax, ay, bx, by) => clearLine(ax, ay, bx, by, 0.05, true);
/** 這條直線上有沒有陷阱（認得陷阱的殭屍就不會直直衝過去） */
export function lineHasTrap(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.3);
  for (let k = 1; k <= n; k++) { const c = Grid.cells[cellOf(ax + (bx - ax) * k / n, ay + (by - ay) * k / n)]; if (c && c.type === 'trap') return true; }
  return false;
}
export function lookAhead(e, path, pi) {
  let k = pi;
  while (k + 1 < path.length && k - pi < 4) {
    const n = path[k + 1];
    if (Grid.blocks(n, e.vault) || !clearLine(e.x, e.y, ix(n) + 0.5, iy(n) + 0.5, e.r, e.vault)) break;
    // 認得陷阱的殭屍：拉直路徑時也不能切過陷阱
    if (e.trapRoll !== undefined && knowsTrap(e) && lineHasTrap(e.x, e.y, ix(n) + 0.5, iy(n) + 0.5)) break;
    k++;
  }
  return k;
}
export function steer(e, mx, my, speed, accel, dt) {
  const k = 1 - Math.exp(-accel * dt);
  e.mvx += (mx * speed - e.mvx) * k; e.mvy += (my * speed - e.mvy) * k;
  e.x += e.mvx * dt; e.y += e.mvy * dt;
}
export const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export function hash01(i, seed) {
  let h = Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
