/* 撤離流程、每幀更新、進化觸發、勝負。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  updateEvac(dt) {
    const P = this.player, E = CFG.EVAC, d = Math.hypot(P.x - RADIO.x, P.y - RADIO.y);
    if (this.evac === 'ready' && d < E.radius) {
      this.evac = 'active'; this.evacT = E.time; this.spotted = true;
      this.hordeQueue += E.horde; this.hordeDir = Math.random() * Math.PI * 2;
      FX.evac('start');
    } else if (this.evac === 'active') {
      this.evacT -= dt;
      if (this.evacT <= 0) { this.evac = 'pickup'; FX.evac('pickup'); }
    } else if (this.evac === 'pickup' && d < E.pickupR) this.gameOver(true);
  },

  update(dt) {
    if (this.phase !== 'play') return;
    this.time += dt;
    this.updatePlayer(dt);
    this.updatePickups(dt);
    this.updateSpawning(dt);
    this.updateEvac(dt);
    if (this.phase !== 'play') return;
    tickGameTimers(dt);
    const Z = this.zombies, P = this.player, S = CFG.SPAWN;
    for (const z of Z.slice()) {
      if (z.dead) continue;
      this.updateZombie(z, dt);
      const d = Math.hypot(z.x - P.x, z.y - P.y);
      // 躲到廢墟後面：追兵在近處看過你、接著連續 2.5 秒看不到 → 算一次「靠視線甩掉」
      if (z.mode === 'chase' || z.mode === 'predict') {
        const see = d < 12 && sight(z.x, z.y, P.x, P.y);
        if (see && d < 7) { z.hadSight = true; z.unseenT = 0; }
        else if (z.hadSight && !see && (z.unseenT += dt) > 2.5) { z.hadSight = false; this.period.losEsc++; }
      }
      if (d < 2) z.close = true;
      else if (z.close && d > 8) { z.close = false; Memory.wEscape++; this.period.escapes++; this.period.esc[z.type]++; }
      // 殭屍殺不死：跟丟你太久就散掉
      const lost = d > 14 && z.mode !== 'ambush' && z.mode !== 'wander' && z.mode !== 'demolish';
      z.lostT = lost ? z.lostT + dt : 0;
      z.farT = d > S.despawnDist && z.mode !== 'ambush' && z.mode !== 'wander' ? z.farT + dt : 0;
      if (z.farT > 6 || z.lostT > S.loseT) { if (CFG.WANDER.revert) this.makeWanderer(z); else this.despawn(z); }
    }
    for (let a = 0; a < Z.length; a++) {
      const za = Z[a];
      for (let b = a + 1; b < Z.length; b++) {
        const zb = Z[b], dx = zb.x - za.x, dy = zb.y - za.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
        const d = Math.hypot(dx, dy), m = za.r + zb.r;
        if (d < m && d > 1e-4) { const p = (m - d) / 2 / d; za.x -= dx * p; za.y -= dy * p; zb.x += dx * p; zb.y += dy * p; }
      }
      const dx = za.x - P.x, dy = za.y - P.y, d = Math.hypot(dx, dy), m = za.r + P.r;
      if (d < m && d > 1e-4) { za.x += dx / d * (m - d); za.y += dy / d * (m - d); }
      resolve(za);
    }
    // 屍群進化：不是固定時間，而是「學到夠多東西」才進化——你玩得越積極，牠們進化得越快
    this.memGap += dt;
    if (this.learnPoints() >= CFG.MEMORY.evolveAt && this.memGap >= CFG.MEMORY.minGap) {
      this.memGap = 0;
      const lines = this.buildReport();
      if (this.period.parts) Memory.partGuard = true;
      Memory.commit(this.period, Grid.count('obstacle'));
      lines.unshift({ t: this.compositionLine(), c: 'comp' });
      this.newPeriod();
      FX.report(Memory.updates, lines);
    }
    if (P.hp <= 0) this.gameOver(false);
  },
  /** 這段時間累積的學習事件：被擋住、被翻越甩掉、被夾、被騙、被廢墟甩掉、被甩掉、你撿到零件 */
  learnPoints() { const p = this.period; return p.stuck + p.vaults + p.snared + p.baited + p.losEsc + p.escapes + p.parts * 3; },
  gameOver(win) { this.phase = 'over'; this.win = win; FX.over(win); },
});
