/* 進化報告的文字（精簡版）。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { t } from '../i18n.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';
import { Game, gameTimers, setTimeoutGame, tickGameTimers } from './core.js';

Object.assign(Game, {
  /* ---------- 屍腦更新 ---------- */
  zoneName(i) {
    const sx = this.portrait ? (R - 1 - iy(i)) / R : ix(i) / C, sy = this.portrait ? ix(i) / C : iy(i) / R;
    const cx = sx < 0.35 ? 0 : sx < 0.65 ? 1 : 2, cy = sy < 0.35 ? 0 : sy < 0.65 ? 1 : 2;
    return t('zone.' + (cy * 3 + cx));
  },
  compositionLine() {
    const a = Memory.lastShare, b = Memory.share();
    return TYPES.map(ty => {
      const p = Math.round(b[ty] * 100), d = Math.round((b[ty] - a[ty]) * 100);
      return `${t('z.' + ty)} ${p}%${d >= 3 ? '↑' : d <= -3 ? '↓' : ''}`;
    }).join(' ');
  },
  buildReport() {
    const s = this.period, n = Memory.updates + 1, L = !CFG.MEMORY.reportFade ? 0 : n <= 2 ? 0 : n <= 4 ? 1 : 2, out = [];
    const pick = (a, b, c) => [a, b, c][L];
    const obs = Grid.count('obstacle');
    // 族群進化的原因
    // 精簡版：每行一個重點，最多 4 行，不擋畫面
    const pct = v => Math.round(v * 100) + '%';
    if (s.stuck + s.placed >= 2) out.push({ t: t('rep.stuck', { n: s.stuck }) });
    if (s.vaults >= 1) out.push({ t: t('rep.vault', { n: s.vaults }) });
    if (s.snared + s.baited + s.losEsc >= 1) out.push({ t: t('rep.path', { a: s.snared, b: s.baited, c: s.losEsc }) });
    if (s.dodged >= 1) out.push({ t: t('rep.dodged', { n: s.dodged }) });
    if (s.snared >= 2) out.push({ t: t('rep.trapAware', { p: pct(Math.min(CFG.MEMORY.evo.trapMax, Memory.trapAware + CFG.MEMORY.evo.trapLearn * s.snared)) }) });
    if (s.baited >= 2) out.push({ t: t('rep.baitRate', { p: pct(CFG.BUILD.bait.chance * (1 - Math.min(CFG.MEMORY.evo.baitMax, Memory.baitWise + CFG.MEMORY.evo.baitLearn * s.baited))) }) });
    // 行為學習（沿用 v3）
    const zoneSum = arr => { const z = {}; let t = 0; for (let i = 0; i < N; i++) if (arr[i]) { const k = this.zoneName(i); z[k] = (z[k] || 0) + arr[i]; t += arr[i]; } return [Object.entries(z).sort((a, b) => b[1] - a[1])[0], t]; };
    const [pz, pt] = zoneSum(Memory.wPick);
    if (pz && pt >= 2) out.push({ t: t('rep.ambush', { zone: pz[0] }) });
    const ts = Memory.wTurn[0] + Memory.wTurn[1] + Memory.wTurn[2];
    if (ts > 1.5) {
      const l = Memory.wTurn[0] / ts, r = Memory.wTurn[2] / ts;
      if (Math.max(l, r) > 0.4) { const side = t(r > l ? 'side.right' : 'side.left'); out.push({ t: t('rep.turn', { side }) }); }
    }
    if (s.parts && !Memory.partGuard) out.push({ t: t('rep.guard') });
    if (!out.length) out.push({ t: t('rep.none') });
    return out.slice(0, 4);
  },
});
