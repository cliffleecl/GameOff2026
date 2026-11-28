/* 材料箱、零件的生成與撿取。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { t } from '../i18n.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 資源 ---------- */
  randomFreeCell(test) {
    for (let t = 0; t < 60; t++) { const i = Math.random() * N | 0; if (Grid.free(i) && test(ix(i) + 0.5, iy(i) + 0.5)) return i; }
    return -1;
  },
  spawnScrap(initial) {
    const S = CFG.SCRAP, P = this.player;
    const i = this.randomFreeCell((x, y) =>
      (initial ? Math.hypot(x - RADIO.x, y - RADIO.y) > 4 : Math.hypot(x - P.x, y - P.y) > S.minDist) &&
      this.scraps.every(s => Math.hypot(s.x - x, s.y - y) > 3));
    if (i < 0) return;
    const x = ix(i) + 0.5, y = iy(i) + 0.5;
    this.scraps.push({ id: this.scrapId++, x, y, value: S.units * CFG.ITEM_COST });   // 一箱＝材料條一格
  },
  spawnPart() {
    const PC = CFG.PARTS, P = this.player;
    let best = -1, bs = Infinity;
    const tries = Math.random() < 0.5 ? 25 : 1;
    for (let t = 0; t < tries; t++) {
      const i = this.randomFreeCell((x, y) => Math.hypot(x - P.x, y - P.y) > PC.minDist && Math.hypot(x - RADIO.x, y - RADIO.y) > PC.radioMin);
      if (i < 0) continue;
      const h = Memory.heat(i) + Memory.wHabit[i];
      if (h < bs) { bs = h; best = i; }
    }
    if (best < 0) best = this.randomFreeCell(() => true);
    this.part = { x: ix(best) + 0.5, y: iy(best) + 0.5 };
    if (Memory.partGuard) {                     // 學會「牠一定會去拿零件」→ 零件旁先放守衛
      const n = Math.min(2, 1 + Math.floor(this.parts / 3));
      for (let k = 0, placed = 0; k < 16 && placed < n; k++) {
        const a = Math.random() * Math.PI * 2, r = rnd(1.5, 3);
        const gx = clamp(Math.floor(this.part.x + Math.cos(a) * r), 0, C - 1), gy = clamp(Math.floor(this.part.y + Math.sin(a) * r), 0, R - 1);
        if (Grid.blocks(idx(gx, gy), false)) continue;
        placed++;
        const z = this.spawnZombie(this.rollType(), undefined, idx(gx, gy));
        if (z) { z.mode = 'ambush'; z.ambush = idx(gx, gy); z.guard = true; }
      }
    }
  },
  updatePickups(dt) {
    const P = this.player, S = CFG.SCRAP;
    for (let k = this.scraps.length - 1; k >= 0; k--) {
      const s = this.scraps[k];
      if (Math.hypot(s.x - P.x, s.y - P.y) > S.pickR) continue;
      this.materials = Math.min(CFG.MAX_MATERIALS, this.materials + s.value); this.period.picks++; this.stats.scraps++;
      Memory.wPick[cellOf(s.x, s.y)] += 1;
      this.scraps.splice(k, 1);
      FX.pickup(s);
      setTimeoutGame(() => this.spawnScrap(false), S.respawn);
    }
    if (this.part && Math.hypot(this.part.x - P.x, this.part.y - P.y) < S.pickR) {
      Memory.wPick[cellOf(this.part.x, this.part.y)] += 2; this.period.parts++;
      const p = this.part; this.part = null; this.parts++;
      FX.part(p, this.parts);
      if (this.parts >= CFG.PARTS.goal) { this.evac = 'ready'; FX.msg(t('msg.partsDone')); }
      else this.partT = CFG.PARTS.delay;
    }
    if (!this.part && this.evac === 'none') { this.partT -= dt; if (this.partT <= 0) this.spawnPart(); }
  },
});
