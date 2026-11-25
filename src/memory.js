/* 屍群記憶與族群進化。不碰 DOM。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Grid } from './grid.js';

/* ============================== Memory ==============================
 * 行為記憶（沿用 v3）：habit/pick 熱點 → 埋伏；turn/lead → 預判；看過你撿零件 → 守零件
 * danger：被陷阱絆住的位置（盲衝型學不會，其他會繞開）
 * weights：族群組成，每次屍腦更新依你的打法進化
 * ================================================================= */
export const Memory = {
  danger: new Float32Array(N), habit: new Float32Array(N), pick: new Float32Array(N), flee: new Float32Array(8), stuck: new Float32Array(N),
  wDanger: new Float32Array(N), wHabit: new Float32Array(N), wPick: new Float32Array(N), wFlee: new Float32Array(8), wStuck: new Float32Array(N),
  turn: new Float32Array(3), wTurn: new Float32Array(3),
  lead: 0, wEscape: 0, partGuard: false, top: [], updates: 0, weights: null, lastShare: null,
  trapAware: 0, baitWise: 0,   // 屍群認得陷阱、識破誘餌的程度（0~1）
  reset() {
    for (const k of ['danger', 'habit', 'pick', 'flee', 'stuck', 'wDanger', 'wHabit', 'wPick', 'wFlee', 'wStuck', 'turn', 'wTurn']) this[k].fill(0);
    this.lead = 0; this.wEscape = 0; this.partGuard = false; this.top = []; this.updates = 0; this.trapAware = 0; this.baitWise = 0;
    this.weights = Object.assign({}, CFG.MEMORY.evo.start); this.lastShare = this.share();
  },
  share() { const w = this.weights, s = TYPES.reduce((a, t) => a + w[t], 0); const o = {}; for (const t of TYPES) o[t] = w[t] / s; return o; },
  fleeBest() {
    let b = 0, sum = 0;
    for (let k = 0; k < 8; k++) { sum += this.flee[k]; if (this.flee[k] > this.flee[b]) b = k; }
    return { dir: b, share: sum > 0 ? this.flee[b] / sum : 0 };
  },
  turnBias() { const s = this.turn[0] + this.turn[1] + this.turn[2]; return s > 0 ? (this.turn[2] - this.turn[0]) / s * 0.9 : 0; },
  heat(i) { return this.habit[i] + this.pick[i] * CFG.MEMORY.pickWeight; },
  /** 族群進化：哪招對牠們有效，就多生能破解那招的類型 */
  /** 族群進化：你用哪招，就多生能破解那招的類型（用得越多，進化得越快） */
  evolve(p) {
    const E = CFG.MEMORY.evo, w = this.weights;
    this.lastShare = this.share();
    w.breaker = Math.min(E.max.breaker, w.breaker + E.blockToBreaker * p.stuck + E.placedToBreaker * p.placed);       // 障礙 → 拆除
    w.vaulter = Math.min(E.max.vaulter, w.vaulter + E.vaultToVaulter * p.vaults);                                      // 翻越 → 跑酷
    w.pathfinder = Math.min(E.max.pathfinder, w.pathfinder + E.baitToPath * p.baited + E.losToPath * p.losEsc + E.trapToPath * p.snared);   // 誘餌、躲廢墟、陷阱 → 繞路
    if (p.stuck + p.vaults + p.snared + p.baited + p.losEsc > 0) w.rusher = Math.max(E.rusherMin, w.rusher - E.rusherDecay);
  },
  commit(p, obstacles) {
    const M = CFG.MEMORY;
    let hs = 0, ps = 0, fs = 0;
    for (let i = 0; i < N; i++) { hs += this.wHabit[i]; ps += this.wPick[i]; }
    for (let k = 0; k < 8; k++) fs += this.wFlee[k];
    for (let i = 0; i < N; i++) {
      this.danger[i] = Math.min(M.dangerMax, this.danger[i] * M.dangerDecay + this.wDanger[i]);
      this.habit[i] = this.habit[i] * M.habitDecay + (hs > 0 ? this.wHabit[i] / hs : 0);
      this.pick[i] = this.pick[i] * M.habitDecay + (ps > 0 ? this.wPick[i] / ps : 0);
      this.stuck[i] = this.stuck[i] * M.dangerDecay + this.wStuck[i];
    }
    for (let k = 0; k < 8; k++) this.flee[k] = this.flee[k] * M.fleeDecay + (fs > 0.5 ? this.wFlee[k] / fs : 0);
    const ts = this.wTurn[0] + this.wTurn[1] + this.wTurn[2];
    for (let k = 0; k < 3; k++) this.turn[k] = this.turn[k] * M.fleeDecay + (ts > 0.5 ? this.wTurn[k] / ts : 0);
    this.lead = Math.min(M.leadMax, this.lead * 0.8 + M.leadBase + M.leadPerEscape * this.wEscape);
    // 被陷阱夾越多次，屍群越認得陷阱；被誘餌騙越多次，越能識破誘餌（認的是「這種東西」，不是某一格）
    this.trapAware = Math.min(M.evo.trapMax, this.trapAware + M.evo.trapLearn * p.snared);
    this.baitWise = Math.min(M.evo.baitMax, this.baitWise + M.evo.baitLearn * p.baited);
    this.evolve(p);
    const blur = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const h = this.heat(i); if (!h) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = ix(i) + dx, y = iy(i) + dy; if (inB(x, y)) blur[idx(x, y)] += h; }
    }
    const order = Array.from({ length: N }, (_, i) => i).filter(i => blur[i] > 0 && !Grid.rock[i]).sort((a, b) => blur[b] - blur[a]);
    this.top = [];
    for (const i of order) {
      if (this.top.length >= 3) break;
      if (this.top.every(t => Math.abs(ix(t) - ix(i)) + Math.abs(iy(t) - iy(i)) >= 6)) this.top.push(i);
    }
    for (const k of ['wDanger', 'wHabit', 'wPick', 'wFlee', 'wStuck', 'wTurn']) this[k].fill(0);
    this.wEscape = 0;
    this.updates++;
  },
};

/** 陷阱學習全屍群即時生效：屍群認得的比例一上升，場上的殭屍（包括遊蕩的）立刻跟著變聰明。
 *  繞路型天生繞開；盲衝型只學得到一半。 */
export function knowsTrap(z) { return z.type === 'pathfinder' || z.trapRoll < Memory.trapAware * (z.type === 'rusher' ? 0.5 : 1); }
