/* 放置道具：障礙放前方、陷阱放腳下、誘餌往前丟。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 放置（丟在身後） ---------- */
  costOf(type) { return CFG.BUILD[type].cost; },
  throwTarget() {
    const P = this.player, B = CFG.BUILD.bait, cx = Math.cos(P.face), cy = Math.sin(P.face);
    for (let d = B.throw; d >= 1; d -= 0.5) {
      const x = P.x + cx * d, y = P.y + cy * d, c = cellOf(x, y);
      if (!inB(Math.floor(x), Math.floor(y)) || !Grid.free(c) || !clearLine(P.x, P.y, x, y, 0.05, true)) continue;
      if (this.scraps.some(s => cellOf(s.x, s.y) === c) || (this.part && cellOf(this.part.x, this.part.y) === c)) continue;
      return c;
    }
    return -1;
  },
  drop(type) {
    if (this.phase !== 'play') return false;
    const d = CFG.BUILD[type], P = this.player, cost = this.costOf(type);
    if (this.materials < cost) { FX.msg(`材料不夠：${d.name}要 ${cost} 個`); return false; }
    const pc = cellOf(P.x, P.y), px = ix(pc), py = iy(pc);
    // 位置固定：障礙放「正前方」（衝過去翻越、落地加速，追兵被擋在後面）；陷阱、誘餌放「腳下」
    const k0 = ((Math.round(P.face / (Math.PI / 4)) % 8) + 8) % 8 + (type === 'obstacle' ? 0 : 4);
    const dirOf = k => [Math.round(Math.cos(k * Math.PI / 4)), Math.round(Math.sin(k * Math.PI / 4))];
    const ok = (x, y) => inB(x, y) && Grid.free(idx(x, y)) && idx(x, y) !== pc &&
      !this.scraps.some(s => cellOf(s.x, s.y) === idx(x, y)) && !(this.part && cellOf(this.part.x, this.part.y) === idx(x, y));
    // 陷阱、誘餌放在你腳下（你踩不會觸發）；腳下已經有東西才改放正後方
    // 誘餌：往前方丟出去（高的廢墟會擋住，矮牆、障礙丟得過去）
    if (type === 'bait') {
      const t = this.throwTarget();
      if (t < 0) { FX.msg('前面沒有地方丟'); return false; }
      Grid.place(t, 'bait'); const b = Grid.cells[t]; b.from = { x: P.x, y: P.y }; b.t0 = this.time;
      this.materials -= cost;
      for (const z of this.zombies) z.repath = 0;
      return true;
    }
    const underFoot = type === 'trap' && Grid.free(pc) &&
      !this.scraps.some(s => cellOf(s.x, s.y) === pc) && !(this.part && cellOf(this.part.x, this.part.y) === pc);
    let c0 = underFoot ? pc : -1, ux = 0, uy = 0;
    for (const off of [0, 1, -1, 2, -2]) {              // 正前／後方被擋住，才依序往兩側偏
      if (c0 >= 0) break;
      const [dx, dy] = dirOf(k0 + off);
      for (const dist of type === 'obstacle' ? [1, 2] : [1]) {
        if (ok(px + dx * dist, py + dy * dist)) { c0 = idx(px + dx * dist, py + dy * dist); ux = dx; uy = dy; break; }
      }
      if (c0 >= 0) break;
    }
    if (c0 < 0) { FX.msg('那個方向沒有空位'); return false; }
    const placed = [c0];
    Grid.place(c0, type); this.materials -= cost;
    if (type === 'obstacle') this.period.placed++;
    // 障礙一次放一道 3 格寬的路障，橫在你前方
    if (type === 'obstacle') {
      for (const sgn of [-1, 1]) {
        const x = ix(c0) - uy * sgn, y = iy(c0) + ux * sgn;
        if (!inB(x, y) || !Grid.free(idx(x, y)) || idx(x, y) === pc) continue;
        if (this.scraps.some(s => cellOf(s.x, s.y) === idx(x, y)) || (this.part && cellOf(this.part.x, this.part.y) === idx(x, y))) continue;
        Grid.place(idx(x, y), type); placed.push(idx(x, y));
      }
      // 放下的障礙跟殭屍重疊 → 撞到牠：往外彈開並暈眩一下
      const O = CFG.BUILD.obstacle;
      let bumped = 0;
      for (const z of this.zombies) {
        for (const c of placed) {
          const qx = clamp(z.x, ix(c), ix(c) + 1), qy = clamp(z.y, iy(c), iy(c) + 1);
          if (Math.hypot(z.x - qx, z.y - qy) >= z.r) continue;
          const a = Math.atan2(z.y - (iy(c) + 0.5), z.x - (ix(c) + 0.5));
          z.stun = Math.max(z.stun, O.bumpStun * (z.type === 'breaker' ? 0.5 : 1)); z.flash = 0.15; z.stuckMark = 0;
          if (Feel.knockback) { z.kx = Math.cos(a) * O.bumpKnock; z.ky = Math.sin(a) * O.bumpKnock; }
          FX.hit(z, a); bumped++;
          break;
        }
      }
      if (bumped && Feel.hitstop) this.hitstop = Math.max(this.hitstop, 0.05);
      if (bumped) FX.msg(bumped > 1 ? `障礙撞暈了 ${bumped} 隻殭屍` : '障礙撞暈了殭屍');
    }
    for (const z of this.zombies) { z.repath = 0; resolve(z); }
    return true;
  },
});
