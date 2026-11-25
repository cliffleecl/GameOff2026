/* 進化報告的文字（精簡版）。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
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
    return [['左上', '上方', '右上'], ['左側', '中央', '右側'], ['左下', '下方', '右下']][cy][cx];
  },
  compositionLine() {
    const a = Memory.lastShare, b = Memory.share();
    return TYPES.map(t => {
      const p = Math.round(b[t] * 100), d = Math.round((b[t] - a[t]) * 100);
      return `${CFG.ZOMBIE[t].name}${p}%${d >= 3 ? '↑' : d <= -3 ? '↓' : ''}`;
    }).join(' ');
  },
  buildReport() {
    const s = this.period, n = Memory.updates + 1, L = !CFG.MEMORY.reportFade ? 0 : n <= 2 ? 0 : n <= 4 ? 1 : 2, out = [];
    const pick = (a, b, c) => [a, b, c][L];
    const obs = Grid.count('obstacle');
    // 族群進化的原因
    // 精簡版：每行一個重點，最多 4 行，不擋畫面
    const pct = v => Math.round(v * 100) + '%';
    if (s.stuck + s.placed >= 2) out.push({ t: `障礙擋住 ×${s.stuck} → 拆除↑` });
    if (s.vaults >= 1) out.push({ t: `翻越 ×${s.vaults} → 跑酷↑` });
    if (s.snared + s.baited + s.losEsc >= 1) out.push({ t: `陷阱 ×${s.snared}・誘餌 ×${s.baited}・躲廢墟 ×${s.losEsc} → 繞路↑` });
    if (s.dodged >= 1) out.push({ t: `閃過陷阱 ×${s.dodged}（牠們看得出那是陷阱了）` });
    if (s.snared >= 2) out.push({ t: `認得陷阱 ${pct(Math.min(CFG.MEMORY.evo.trapMax, Memory.trapAware + CFG.MEMORY.evo.trapLearn * s.snared))}` });
    if (s.baited >= 2) out.push({ t: `誘餌上鉤率剩 ${pct(CFG.BUILD.bait.chance * (1 - Math.min(CFG.MEMORY.evo.baitMax, Memory.baitWise + CFG.MEMORY.evo.baitLearn * s.baited)))}` });
    // 行為學習（沿用 v3）
    const zoneSum = arr => { const z = {}; let t = 0; for (let i = 0; i < N; i++) if (arr[i]) { const k = this.zoneName(i); z[k] = (z[k] || 0) + arr[i]; t += arr[i]; } return [Object.entries(z).sort((a, b) => b[1] - a[1])[0], t]; };
    const [pz, pt] = zoneSum(Memory.wPick);
    if (pz && pt >= 2) out.push({ t: `常在${pz[0]}撿東西 → 那裡有埋伏` });
    const ts = Memory.wTurn[0] + Memory.wTurn[1] + Memory.wTurn[2];
    if (ts > 1.5) {
      const l = Memory.wTurn[0] / ts, r = Memory.wTurn[2] / ts;
      if (Math.max(l, r) > 0.4) { const side = r > l ? '右' : '左'; out.push({ t: `被追常往${side}拐 → 從${side}邊包` }); }
    }
    if (s.parts && !Memory.partGuard) out.push({ t: '零件旁開始有守衛' });
    if (!out.length) out.push({ t: '沒學到新東西' });
    return out.slice(0, 4);
  },
});
