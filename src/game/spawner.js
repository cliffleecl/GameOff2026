/* 殭屍生成：類型比例來自族群進化；遊蕩殭屍、被發現、屍潮。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { t } from '../i18n.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 生成：類型比例來自族群進化 ---------- */
  rollType(anyTime) {
    if (!anyTime && this.time < CFG.SPAWN.rusherOnly) return 'rusher';
    const w = Memory.weights, s = TYPES.reduce((a, t) => a + w[t], 0);
    let r = Math.random() * s;
    for (const t of TYPES) { r -= w[t]; if (r <= 0) return t; }
    return 'rusher';
  },
  spawnZombie(type, dir, at) {
    const S = CFG.SPAWN, P = this.player, def = CFG.ZOMBIE[type];
    let x = -1, y = -1;
    if (at !== undefined) { x = ix(at); y = iy(at); }
    else {
      for (let t = 0; t < 14; t++) {
        const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + rnd(-0.6, 0.6), r = rnd(S.ringMin, S.ringMax);
        const cx = Math.floor(P.x + Math.cos(a) * r), cy = Math.floor(P.y + Math.sin(a) * r);
        if (inB(cx, cy) && !Grid.blocks(idx(cx, cy), false)) { x = cx; y = cy; break; }
      }
      if (x < 0) return null;
    }
    const z = { id: this.nextId++, type, def, x: x + 0.5, y: y + 0.5, r: def.radius, vault: type === 'vaulter',
                cell: idx(x, y), path: [], pi: 0, mvx: 0, mvy: 0, repath: 0, atkCd: 0.6, kx: 0, ky: 0, slow: 0, stun: 0, flash: 0,
                mode: 'chase', modeT: 0, waiting: false, ambush: -1, roam: -1, baitT: -1, baitSeen: {}, alertT: 0, farT: 0, lostT: 0,
                lastSeen: null, stuckT: 0, stuckCells: {}, detourT: 0, stuckMark: 0, vaulting: false, baitCheckT: 0, hadSight: false, unseenT: 0,
                trapRoll: Math.random(),   // 個體差異：屍群「認得陷阱」的比例超過這個值，這隻就會繞開（見 knowsTrap）
                dir: 0, moving: false, attacking: false, seed: Math.random() * 1e9 | 0, sense: 0.6 + Math.random() * 0.8 };
    this.zombies.push(z);
    // 新類型第一次出現：提示牠的特性
    if (this.phase === 'play' && !this.seenTypes[type]) {
      this.seenTypes[type] = true;
      const intro = type === 'rusher' ? null : t('intro.' + type);
      if (intro) FX.msg(intro);
    }
    return z;
  },
  /** 一般生成：類型照族群比例；部分個體再套用學到的戰術（埋伏、預判） */
  spawnLearned() {
    const type = this.rollType(), P = this.player, n = Memory.updates;
    // 拆除殭屍：場上有你放的障礙，就直接衝去拆
    if (type === 'breaker' && Grid.count('obstacle') > 0) { const z = this.spawnZombie(type); if (z) z.mode = 'demolish'; return; }
    // 繞路殭屍：從你「正在跑去的方向」冒出來包抄，並預判你的路線
    if (type === 'pathfinder') {
      const sp = Math.hypot(P.mvx, P.mvy), z = this.spawnZombie(type, sp > 0.5 ? Math.atan2(P.mvy, P.mvx) : undefined);
      if (z) z.mode = 'predict'; return;
    }
    if (n >= 1 && Math.random() < this.learnedRatio()) {
      if (Memory.top.length && Math.random() < 0.4) {
        const t = Memory.top[Math.random() * Memory.top.length | 0];
        if (Math.hypot(ix(t) + 0.5 - P.x, iy(t) + 0.5 - P.y) > 10) {
          const ax = clamp(ix(t) + (Math.random() * 5 | 0) - 2, 0, C - 1), ay = clamp(iy(t) + (Math.random() * 5 | 0) - 2, 0, R - 1);
          if (!Grid.blocks(idx(ax, ay), false)) { const z = this.spawnZombie(type, undefined, idx(ax, ay)); if (z) { z.mode = 'ambush'; z.ambush = t; } return; }
        }
      }
      if (type === 'pathfinder') { const z = this.spawnZombie(type); if (z) z.mode = 'predict'; return; }   // 只有繞路型會預判
    }
    this.spawnZombie(type);
  },
  aliveCap() { const S = CFG.SPAWN; return Math.min(S.maxAlive, Math.floor(S.aliveBase + S.alivePerMin * this.minutes()) + (this.evac === 'active' || this.evac === 'pickup' ? CFG.EVAC.extraCap : 0)); },
  /** 讓殭屍進入遊蕩狀態：在 home 附近慢慢晃，看到你才追 */
  makeWanderer(z) { if (!z) return; z.mode = 'wander'; z.home = cellOf(z.x, z.y); z.roam = -1; z.lastSeen = null; z.lostT = 0; z.farT = 0; z.close = false; z.repath = 0; },
  /** 被看到了：這隻開始追；第一次被發現時，屍群才開始派追兵 */
  spot(z) {
    z.mode = 'chase'; z.alertT = 0.9; z.repath = 0; FX.alert(z);
    if (!this.spotted) { this.spotted = true; this.spawnT = 2; this.hordeT = CFG.HORDE.first; FX.msg(t('msg.spotted')); }
  },
  chasers() { let n = 0; for (const z of this.zombies) if (z.mode !== 'wander') n++; return n; },
  updateSpawning(dt) {
    if (!this.spotted) return;                       // 還沒被發現：只有遊蕩殭屍
    const S = CFG.SPAWN, H = CFG.HORDE;
    const mul = this.evac === 'active' || this.evac === 'pickup' ? CFG.EVAC.spawnMul : 1;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(S.minInterval, S.startInterval - S.ramp * this.time) / mul;
      if (this.chasers() < this.aliveCap()) this.spawnLearned();   // 上限只算追兵，不算遊蕩的
    }
    this.hordeT -= dt;
    if (!this.hordeWarned && this.hordeT <= H.warn) {
      this.hordeWarned = true;
      const fb = Memory.fleeBest();
      if (fb.share > 0.25) { const [fx, fy] = DIR8[fb.dir]; this.hordeDir = Math.atan2(fy, fx); }
      else this.hordeDir = Math.random() * Math.PI * 2;
      FX.horde(this.hordeDir, true);
    }
    if (this.hordeT <= 0) {
      this.hordeQueue += H.base + H.per * Math.floor(this.time / H.every);
      this.hordeT = H.every; this.hordeWarned = false; this.hordeGap = 0;
      FX.horde(this.hordeDir, false);
    }
    if (this.hordeQueue > 0) {
      this.hordeGap -= dt;
      if (this.hordeGap <= 0) {
        this.hordeGap = H.gap; this.hordeQueue--;
        const z = this.spawnZombie(this.rollType(), this.hordeDir);
        if (z && z.type === 'pathfinder' && Math.random() < this.learnedRatio()) z.mode = 'predict';
      }
    }
  },
});
