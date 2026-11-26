/* 殭屍 AI：路徑成本、預判、誘餌、各類型的移動與互動。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { t } from '../i18n.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 殭屍 ---------- */
  /** 各類型的路徑成本：怎麼對待障礙，就是牠們的差別 */
  zCost(z) {
    const t = z.type;
    return i => {
      if (Grid.rock[i]) return Infinity;
      let c = 1 + hash01(i, z.seed) * 0.6;
      const cell = Grid.cells[i];
      if (Game.knowsTrap(z) && cell && cell.type === 'trap') c += 8;          // 認得陷阱：任何陷阱都繞開
      if (Grid.low[i]) { if (t === 'vaulter') c += z.def.vaultCost; else return Infinity; }   // 矮牆：只有跑酷型過得去
      else if (Grid.isObstacle(i)) {
        if (t === 'breaker') c += z.def.wallCost;
        else if (t === 'vaulter') c += z.def.vaultCost;
        else return Infinity;                                           // 盲衝、繞路：過不去
      }
      return c;
    };
  },
  /** 陷阱學習全屍群即時生效：屍群認得的比例一上升，場上的殭屍（包括遊蕩的）立刻跟著變聰明
   *  繞路型天生繞開；盲衝型只學得到一半 */
  knowsTrap(z) { return knowsTrap(z); },   // 實作在 memory.js（physics.js 的路徑拉直也要用）
  predictPos(z) {
    const P = this.player, sp = Math.hypot(P.mvx, P.mvy), lead = Memory.lead * (0.6 + z.sense * 0.5);
    let a = sp > 0.5 ? Math.atan2(P.mvy, P.mvx) : Math.atan2(P.y - z.y, P.x - z.x);
    a += Memory.turnBias() * 0.5;
    const d = Math.max(sp, 2) * lead;
    return { x: clamp(P.x + Math.cos(a) * d, 0.5, C - 0.5), y: clamp(P.y + Math.sin(a) * d, 0.5, R - 0.5) };
  },
  planZombie(z) {
    const P = this.player, B = CFG.BUILD.bait;
    z.repath = (z.type === 'vaulter' ? 0.4 : 0.6) + Math.random() * 0.3;
    if (z.baitT >= 0 && !(Grid.cells[z.baitT] && Grid.cells[z.baitT].type === 'bait')) z.baitT = -1;
    let goal = cellOf(P.x, P.y);
    if (z.mode === 'wander' && z.baitT < 0) {
      if (z.roam < 0 || cellOf(z.x, z.y) === z.roam || Math.random() < 0.08) {
        const hx = ix(z.home), hy = iy(z.home), r = CFG.WANDER.homeRadius;
        for (let t = 0; t < 10; t++) {
          const x = clamp(hx + Math.round(rnd(-r, r)), 0, C - 1), y = clamp(hy + Math.round(rnd(-r, r)), 0, R - 1);
          if (!Grid.blocks(idx(x, y), z.vault)) { z.roam = idx(x, y); break; }
        }
      }
      z.repath = 1 + Math.random();
      z.path = Path.find(cellOf(z.x, z.y), z.roam < 0 ? z.home : z.roam, this.zCost(z)) || []; z.pi = 0;
      return;
    }
    const dP = Math.hypot(P.x - z.x, P.y - z.y);
    const far = (z.mode === 'chase' || z.mode === 'predict') && dP > 13 && !(z.type === 'rusher' && z.lastSeen);
    if (far) {
      if (z.roam < 0 || cellOf(z.x, z.y) === z.roam || Math.random() < 0.05) {
        const t = Memory.top.length && Math.random() < 0.7 ? Memory.top[Math.random() * Memory.top.length | 0] : -1;
        z.roam = t >= 0 ? t : this.randomFreeCell(() => true);
      }
      goal = z.roam;
    }
    if (z.type === 'rusher' && z.lastSeen && z.mode === 'chase') goal = cellOf(z.lastSeen.x, z.lastSeen.y);
    if (z.baitT >= 0) goal = z.baitT;
    else if (z.mode === 'ambush') goal = z.ambush;
    else if (z.mode === 'demolish') {
      let best = -1, bd = 20;
      for (let i = 0; i < N; i++) if (Grid.isObstacle(i)) { const d = Math.hypot(ix(i) + 0.5 - z.x, iy(i) + 0.5 - z.y); if (d < bd) { bd = d; best = i; } }
      if (best < 0) z.mode = 'chase'; else if (Math.hypot(P.x - z.x, P.y - z.y) > 2) goal = best;
    }
    else if (z.mode === 'predict' && !far) { const p = this.predictPos(z), g = cellOf(p.x, p.y); if (!Grid.blocks(g, z.vault)) goal = g; }
    z.path = Path.find(cellOf(z.x, z.y), goal, this.zCost(z)) || [];
    z.pi = 0;
  },
  /** 誘餌檢查：每隻殭屍（包括正在衝的盲衝型）定期看附近有沒有誘餌 */
  checkBait(z) {
    const B = CFG.BUILD.bait, zx = ix(z.cell), zy = iy(z.cell);
    for (let y = Math.max(0, zy - B.lure); y <= Math.min(R - 1, zy + B.lure); y++)
      for (let x = Math.max(0, zx - B.lure); x <= Math.min(C - 1, zx + B.lure); x++) {
        const i = idx(x, y), c = Grid.cells[i];
        if (!c || c.type !== 'bait' || z.baitSeen[i] || Math.hypot(x - zx, y - zy) > B.lure) continue;
        z.baitSeen[i] = 1;
        const chance = B.chance * (1 - Memory.baitWise) * (z.def.baitMul || 1);
        if (Math.random() < chance) { z.baitT = i; z.repath = 0; z.lastSeen = null; z.waiting = false; return; }
      }
  },
  updateZombie(z, dt) {
    const P = this.player;
    if (z.flash > 0) z.flash -= dt;
    if (z.alertT > 0) z.alertT -= dt;
    if (z.slow > 0) z.slow -= dt;
    if (z.stuckMark > 0) z.stuckMark -= dt;
    if (z.trapMark > 0) z.trapMark -= dt;
    if (z.detourT > 0) z.detourT -= dt;
    z.atkCd -= dt; z.repath -= dt; z.modeT += dt; z.attacking = false;
    if (Math.abs(z.kx) + Math.abs(z.ky) > 0.05) {
      z.x += z.kx * dt; z.y += z.ky * dt; const k = Math.exp(-9 * dt); z.kx *= k; z.ky *= k; resolve(z);
      if (Math.abs(z.kx) + Math.abs(z.ky) > 1.2) { z.moving = false; this.trackCell(z); return; }
    }
    if (z.stun > 0) { z.stun -= dt; z.moving = false; return; }

    const dxp = P.x - z.x, dyp = P.y - z.y, dp = Math.hypot(dxp, dyp);
    if (z.mode === 'wander' && dp < CFG.WANDER.sight && sight(z.x, z.y, P.x, P.y)) this.spot(z);
    if ((z.baitCheckT -= dt) <= 0) { z.baitCheckT = 0.4; if (z.baitT < 0) this.checkBait(z); }
    if (z.mode === 'ambush') {
      if (dp < 5 || z.modeT > (z.guard ? 90 : 30)) { z.mode = 'chase'; z.waiting = false; z.repath = 0; if (dp < 5) { z.alertT = 0.9; FX.alert(z); } }
    }
    if (dp < P.r + z.r + 0.12) {
      z.moving = false; z.mvx *= 0.5; z.mvy *= 0.5; z.dir = Math.atan2(dyp, dxp);
      if (z.atkCd <= 0) { z.atkCd = 1; this.hurtPlayer(z); }
      return;
    }
    if (z.waiting) { z.moving = false; z.mvx = z.mvy = 0; return; }

    // 盲衝型：看得到你就直直衝過去（不尋路）——所以會被障礙擋住
    if (z.type === 'rusher' && z.mode === 'chase' && z.baitT < 0 && z.detourT <= 0) {
      const see = dp < z.def.sight && sight(z.x, z.y, P.x, P.y);
      if (see && !(this.knowsTrap(z) && lineHasTrap(z.x, z.y, P.x, P.y))) { z.lastSeen = { x: P.x, y: P.y }; z.lostT = 0; this.rushStraight(z, P.x, P.y, dt); return; }
      if (z.lastSeen && Math.hypot(z.lastSeen.x - z.x, z.lastSeen.y - z.y) < 0.6) z.lastSeen = null;
      if (z.lastSeen && sight(z.x, z.y, z.lastSeen.x, z.lastSeen.y)) { this.rushStraight(z, z.lastSeen.x, z.lastSeen.y, dt); return; }
    }

    if (z.repath <= 0 || z.pi >= z.path.length) this.planZombie(z);
    let tx, ty;
    if (z.mode === 'chase' && z.type !== 'rusher' && z.baitT < 0 && dp < 5 && clearLine(z.x, z.y, P.x, P.y, z.r * 0.8, z.vault) && !(this.knowsTrap(z) && lineHasTrap(z.x, z.y, P.x, P.y))) { tx = P.x; ty = P.y; }
    else if (z.mode === 'predict' && z.baitT < 0 && dp < 7) {
      const p = dp <= 1.6 ? P : this.predictPos(z);
      if (clearLine(z.x, z.y, p.x, p.y, z.r * 0.8, z.vault) && !(this.knowsTrap(z) && lineHasTrap(z.x, z.y, p.x, p.y))) { tx = p.x; ty = p.y; }
    }
    if (tx === undefined) {
      if (z.pi < z.path.length && !Grid.blocks(z.path[z.pi], z.vault)) z.pi = lookAhead(z, z.path, z.pi);
      const next = z.path[z.pi];
      if (next === undefined) {
        if (z.baitT >= 0) { if (z.cell === z.baitT && Grid.cells[z.cell]) this.eatBait(z, z.cell); else z.baitT = -1; z.repath = 0; return; }
        if (z.mode === 'ambush') z.waiting = true;
        z.moving = false; return;
      }
      if (Grid.blocks(next, z.vault)) {
        const s = Grid.cells[next];
        if (!s || z.type !== 'breaker') { z.repath = 0; z.pi = z.path.length; return; }
        z.attacking = true; z.moving = false; z.mvx = z.mvy = 0; z.dir = Math.atan2(iy(next) + 0.5 - z.y, ix(next) + 0.5 - z.x);
        s.hp -= z.def.wallDps * dt;
        if (s.hp <= 0) this.destroyStructure(next);
        return;
      }
      tx = ix(next) + 0.5; ty = iy(next) + 0.5;
      const wd = Math.hypot(tx - z.x, ty - z.y);
      if (wd < 0.25 || (wd < 0.6 && (tx - z.x) * z.mvx + (ty - z.y) * z.mvy < 0)) { z.pi++; this.trackCell(z); return; }
    }
    this.moveZombie(z, tx, ty, dt);
  },
  moveZombie(z, tx, ty, dt) {
    // 認得陷阱的殭屍看到前方有陷阱：停頓一下（頭上冒黃色標記、陷阱閃一下），然後繞開
    if (this.knowsTrap(z) && (z.trapScanT = (z.trapScanT || 0) - dt) <= 0) {
      z.trapScanT = 0.25;
      const zx = Math.floor(z.x), zy = Math.floor(z.y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = zx + dx, y = zy + dy; if (!inB(x, y)) continue;
        const c = idx(x, y), s = Grid.cells[c];
        if (!s || s.type !== 'trap' || Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) > 2.5 || (z.seenTrap || (z.seenTrap = {}))[c]) continue;
        z.seenTrap[c] = 1; z.trapMark = 0.8; z.repath = 0; this.period.dodged++;   // 只在頭上冒黃色標記，不停頓、不轉頭
        dy = 3; break;
      }
    }
    const dx = tx - z.x, dy = ty - z.y, d = Math.hypot(dx, dy) || 1;
    const onObs = z.vault && Grid.isVaultable(cellOf(z.x, z.y));
    if (onObs && !z.vaulting) FX.vault(z);
    z.vaulting = onObs;
    const sp = z.def.speed * (z.slow > 0 ? CFG.BUILD.trap.slow : 1) * (onObs ? z.def.vaultSlow : 1) * (z.mode === 'wander' ? CFG.WANDER.speedMul : 1);
    steer(z, dx / d, dy / d, sp, z.type === 'vaulter' ? 9 : 6, dt);
    if (Math.hypot(z.mvx, z.mvy) > 0.1) z.dir = Math.atan2(z.mvy, z.mvx);
    z.moving = true;
    resolve(z);
    this.trackCell(z);
  },
  /** 盲衝：直線前進，偵測「被障礙卡住」 */
  rushStraight(z, tx, ty, dt) {
    const a = Math.atan2(ty - z.y, tx - z.x);
    const ahead = cellOf(z.x + Math.cos(a) * (z.r + 0.2), z.y + Math.sin(a) * (z.r + 0.2));
    // 正前方是障礙：不會沿著障礙滑開，只會一直往前頂（這就是「只照視線跑」）
    if (Grid.isVaultable(ahead)) { z.mvx = z.mvy = 0; z.moving = true; z.dir = a; }
    else this.moveZombie(z, tx, ty, dt);
    if (Grid.isVaultable(ahead)) {
      z.stuckT += dt;
      if (z.stuckT > 0.8 && !z.stuckCells[ahead] && Grid.isObstacle(ahead)) {   // 只有「你放的」障礙算進進化
        z.stuckCells[ahead] = 1; this.period.stuck++; Memory.wStuck[ahead] += 1;
        z.stuckMark = 1.2; FX.stuck(z);
      }
      if (z.stuckT > 4) { z.stuckT = 0; z.detourT = 2.5; z.repath = 0; }     // 卡太久：笨笨地亂繞一下再回來衝
    } else z.stuckT = Math.max(0, z.stuckT - dt);
  },
  trackCell(z) {
    const c = cellOf(z.x, z.y);
    if (c === z.cell) return;
    z.cell = c;
    const s = Grid.cells[c];
    if (!s) return;
    if (s.type === 'trap') {
      const T = CFG.BUILD.trap;
      z.stun = Math.max(z.stun, T.stun); z.slow = T.slowTime; z.flash = 0.15; this.period.snared++;
      if (--s.uses <= 0) { Grid.remove(c); FX.msg(t('msg.trapBroke')); }
    } else if (s.type === 'bait' && z.baitSeen[c] !== 2) this.eatBait(z, c);
  },
  eatBait(z, c) {
    const s = Grid.cells[c];
    z.baitSeen[c] = 2; z.baitT = -1;
    if (!s || s.type !== 'bait') return;
    z.stun = CFG.BUILD.bait.stall; this.period.baited++;
    // 被肉引走的遊蕩殭屍、守衛會留在這一帶晃（守衛就這樣離開崗位了）
    if (z.mode === 'wander' || z.mode === 'ambush') { z.mode = 'wander'; z.home = c; z.roam = -1; z.guard = false; }
  },
  destroyStructure(i) {
    const s = Grid.cells[i]; if (!s) return;
    Grid.remove(i);
    FX.broke(i, s.type); FX.msg(t('msg.broke', { item: t('item.' + s.type) }));
    for (const z of this.zombies) z.repath = 0;
  },
  despawn(z) { z.dead = true; const i = this.zombies.indexOf(z); if (i >= 0) this.zombies.splice(i, 1); FX.despawn(z); },
});
