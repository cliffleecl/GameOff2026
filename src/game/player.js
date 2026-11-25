/* 玩家移動、翻越加速、回血、（已關閉的）推開，以及記錄玩家習慣。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 玩家 ---------- */
  playerCost(i) { return Grid.rock[i] ? Infinity : Grid.isVaultable(i) ? 2 : 1; },   // 能跨，但跨越會減速，路徑會盡量繞開
  moveTo(x, y) {
    const P = this.player;
    if (this.phase !== 'play') return;
    let goal = cellOf(x, y);
    if (Grid.rock[goal]) {
      let best = -1, bd = 9;
      for (const [dx, dy] of DIR4) {
        const nx = ix(goal) + dx, ny = iy(goal) + dy;
        if (Grid.solid(nx, ny, true)) continue;
        const d = Math.hypot(nx + 0.5 - P.x, ny + 0.5 - P.y);
        if (d < bd) { bd = d; best = idx(nx, ny); }
      }
      if (best < 0) return;
      goal = best; x = ix(goal) + 0.5; y = iy(goal) + 0.5;
    }
    const path = Path.find(cellOf(P.x, P.y), goal, i => this.playerCost(i));
    if (!path) return;
    P.path = path; P.pi = 0; P.dest = { x: clamp(x, ix(goal) + 0.3, ix(goal) + 0.7), y: clamp(y, iy(goal) + 0.3, iy(goal) + 0.7) };
  },
  updatePlayer(dt) {
    const P = this.player, S = CFG.PLAYER, ox = P.x, oy = P.y;
    let mx = 0, my = 0;
    if (Input.kx || Input.ky) { mx = Input.kx; my = Input.ky; P.path = null; P.dest = null; }
    else if (P.path) {
      if (clearLine(P.x, P.y, P.dest.x, P.dest.y, P.r, true)) P.pi = P.path.length - 1;
      else P.pi = lookAhead(P, P.path, P.pi);
      const last = P.pi >= P.path.length - 1;
      const t = last ? P.dest : { x: ix(P.path[P.pi]) + 0.5, y: iy(P.path[P.pi]) + 0.5 };
      const dx = t.x - P.x, dy = t.y - P.y, d = Math.hypot(dx, dy);
      if (d < (last ? 0.08 : 0.25)) { P.pi++; if (P.pi >= P.path.length) { P.path = null; P.dest = null; } }
      else { mx = dx / d; my = dy / d; if (last && d < 0.6) { mx *= d / 0.6; my *= d / 0.6; } }
    }
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    // 翻越：在障礙／矮牆上時稍微減速；落地後短暫加速（跑酷的衝勁）
    const onObs = Grid.isVaultable(cellOf(P.x, P.y));
    if (!onObs && P.vaulting) { P.boostT = S.boostTime; FX.boost(P); }
    if (P.boostT > 0) P.boostT -= dt;
    if (onObs && !P.vaulting) {
      let near = false; for (const z of this.zombies) if (Math.hypot(z.x - P.x, z.y - P.y) < 3.5) { near = true; break; }
      if (near) this.period.vaults++;                // 被追時翻越 → 跑酷殭屍會學起來
      FX.vault(P);
    }
    P.vaulting = onObs;
    steer(P, mx, my, S.speed * (onObs ? S.vaultSlow : P.boostT > 0 ? S.boost : 1), 14, dt);
    if (ml > 0.05 && P.shoveT <= 0) P.face = Math.atan2(my, mx);
    if (Math.abs(P.kx) + Math.abs(P.ky) > 0.05) { P.x += P.kx * dt; P.y += P.ky * dt; const k = Math.exp(-10 * dt); P.kx *= k; P.ky *= k; }
    resolve(P);
    P.vx = (P.x - ox) / dt; P.vy = (P.y - oy) / dt;
    if (P.iframe > 0) P.iframe -= dt;
    P.safeT += dt;
    if (P.safeT > S.regenDelay && P.hp < S.hp) {
      let near = false; for (const z of this.zombies) if (Math.hypot(z.x - P.x, z.y - P.y) < S.regenSafe) { near = true; break; }
      if (!near) { P.regenAcc += S.regen * dt; if (P.regenAcc >= 1) { const k = Math.floor(P.regenAcc); P.hp = Math.min(S.hp, P.hp + k); P.regenAcc -= k; } }
    }
    // 盾推（非致命：推開＋暈眩）
    P.shoveCd -= dt; P.shoveT -= dt;
    if (S.shoveEnabled && P.shoveCd <= 0) {
      let best = null, bd = Infinity;
      for (const z of this.zombies) { const d = Math.hypot(z.x - P.x, z.y - P.y); if (d < P.r + z.r + S.shoveTrigger && d < bd) { bd = d; best = z; } }
      if (best) {
        const dir = Math.atan2(best.y - P.y, best.x - P.x);
        P.shoveCd = S.shoveCd; P.shoveT = S.shoveTime; P.shoveDir = dir; P.face = dir;
        FX.shove(P.x, P.y, dir);
        for (const z of this.zombies) {
          const d = Math.hypot(z.x - P.x, z.y - P.y);
          if (d > S.shoveRange + z.r) continue;
          const a = Math.atan2(z.y - P.y, z.x - P.x), k = S.shoveKnock * (z.type === 'breaker' ? 0.4 : 1);
          if (Feel.knockback) { z.kx = Math.cos(a) * k; z.ky = Math.sin(a) * k; }
          z.stun = Math.max(z.stun, S.shoveStun * (z.type === 'breaker' ? 0.5 : 1)); z.flash = 0.1;
          FX.hit(z, a);
        }
        if (Feel.hitstop) this.hitstop = Math.max(this.hitstop, 0.06);
      }
    }
    Memory.wHabit[cellOf(P.x, P.y)] += dt;
    if (Math.hypot(P.vx, P.vy) > 1) {
      let nz = null, nd = 3;
      for (const z of this.zombies) { const d = Math.hypot(z.x - P.x, z.y - P.y); if (d < nd) { nd = d; nz = z; } }
      if (nz) {
        Memory.wFlee[((Math.round(Math.atan2(P.vy, P.vx) / (Math.PI / 4)) % 8) + 8) % 8] += dt;
        const ax = P.x - nz.x, ay = P.y - nz.y, a = Math.atan2(ax * P.vy - ay * P.vx, ax * P.vx + ay * P.vy);
        Memory.wTurn[a < -0.35 ? 0 : a > 0.35 ? 2 : 1] += dt;
      }
    }
  },
  hurtPlayer(z) {
    const P = this.player;
    if (P.iframe > 0) return;
    P.hp = Math.max(0, P.hp - z.def.dmg); P.iframe = CFG.PLAYER.iframe; P.safeT = 0;
    if (Feel.knockback) { const a = Math.atan2(P.y - z.y, P.x - z.x); P.kx = Math.cos(a) * 4; P.ky = Math.sin(a) * 4; }
    if (Feel.slowmo && P.hp > 0 && P.hp <= 30) this.slowT = 0.5;
    FX.hurt(z.def.dmg);
  },
});
