/* 模擬玩家：不開瀏覽器，直接跑遊戲邏輯，用來檢查平衡與「有沒有卡死」。
 *
 *   npm run sim                  → 跑 30 局「會用道具」的模擬玩家
 *   npm run sim -- --runs 100    → 指定局數
 *   npm run sim -- --nobuild     → 完全不用道具（對照組：道具有沒有價值）
 *
 * 模擬玩家很笨：只會衝向最近的目標、被追時挑離殭屍遠的方向、在殭屍從背後追來時往前放障礙。
 * 它不會利用廢墟擋視線，也不會刻意把誘餌丟到有用的位置，所以勝率只能當「相對比較」用，
 * 不能直接當成真人的難度。改完數值後，看的是「改之前 vs 改之後」的差異。 */
import { pathToFileURL } from 'node:url';
import { CFG, RADIO, TYPES } from '../src/config.js';
import { Grid } from '../src/grid.js';
import { Memory } from '../src/memory.js';
import { Game, gameTimers } from '../src/game.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const RUNS = +opt('runs', 30), MAX_T = 900, DT = 0.033;
let NOBUILD = !!opt('nobuild', false);

export const agg = { dmg: {}, spawned: {}, evolutions: 0, stuck: 0, vaults: 0, snared: 0, baited: 0, dodged: 0, shares: [] };
const hurt0 = Game.hurtPlayer.bind(Game);
Game.hurtPlayer = function (z) { if (this.player.iframe <= 0) agg.dmg[z.type] = (agg.dmg[z.type] || 0) + z.def.dmg; hurt0(z); };
const spawn0 = Game.spawnZombie.bind(Game);
Game.spawnZombie = function (...a) { const z = spawn0(...a); if (z) agg.spawned[z.type] = (agg.spawned[z.type] || 0) + 1; return z; };
const period0 = Game.newPeriod.bind(Game);
Game.newPeriod = function () { const p = this.period; if (p) for (const k of ['stuck', 'vaults', 'snared', 'baited', 'dodged']) agg[k] += p[k]; period0(); };

const minZ = (x, y) => { let s = 99; for (const z of Game.zombies) if (z.mode !== 'wander') s = Math.min(s, Math.hypot(z.x - x, z.y - y)); return s; };

/** 跑一局。測試（tests/unit/sim.test.js）也會直接呼叫這個函式。 */
export function run({ nobuild = NOBUILD } = {}) {
  NOBUILD = nobuild;
  gameTimers.length = 0; Game.reset(); Game.begin();
  let t = 0, think = 0, lastDrop = -9, maxGap = 0, lastProgress = 0;
  while (Game.phase === 'play' && t < MAX_T) {
    Game.update(DT); t += DT; think -= DT;
    if (think > 0) continue;
    think = 0.4;
    const P = Game.player, near = minZ(P.x, P.y);
    let target = null;
    if (Game.evac === 'ready' || Game.evac === 'pickup') target = [RADIO.x + 0.5, RADIO.y + 0.5];
    else if (Game.part) target = [Game.part.x, Game.part.y];
    else { let bd = 1e9; for (const s of Game.scraps) { const d = Math.hypot(s.x - P.x, s.y - P.y) + (minZ(s.x, s.y) < 3 ? 15 : 0); if (d < bd) { bd = d; target = [s.x, s.y]; } } }
    if (near < 4) {                       // 被追：在周圍取樣，挑離殭屍遠、又不要離目標太遠的點
      let best = null, bs = -1e9;
      for (let k = 0; k < 20; k++) {
        const a = Math.random() * 6.283, r = 2 + Math.random() * 4, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r;
        if (Grid.solid(Math.floor(x), Math.floor(y), true)) continue;
        let s = Math.min(minZ(x, y), 6) * 2; if (target) s -= Math.hypot(target[0] - x, target[1] - y) * 0.3;
        if (s > bs) { bs = s; best = [x, y]; }
      }
      if (best) Game.moveTo(best[0], best[1]);
      if (!NOBUILD && t - lastDrop > 1.5 && near < 3.5) {
        let nz = null, nd = 9;
        for (const z of Game.zombies) { const d = Math.hypot(z.x - P.x, z.y - P.y); if (d < nd) { nd = d; nz = z; } }
        if (nz) {
          const back = Math.atan2(nz.y - P.y, nz.x - P.x), fb = P.face + Math.PI;
          const da = Math.abs(Math.atan2(Math.sin(back - fb), Math.cos(back - fb)));
          if (da < 0.8 && Game.materials >= CFG.BUILD.obstacle.cost) { Game.drop(nz.type === 'vaulter' ? 'trap' : 'obstacle'); lastDrop = t; }
        }
      }
    } else if (target) Game.moveTo(target[0], target[1]);
  }
  agg.evolutions += Memory.updates; agg.shares.push(Game.compositionLine());
  return { win: Game.win, t: Math.round(t), parts: Game.parts, timeout: t >= MAX_T };
}

// 直接用 node 執行才跑統計；被測試 import 時只提供 run()
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
const res = []; for (let i = 0; i < RUNS; i++) res.push(run());
const avg = f => (res.reduce((a, r) => a + f(r), 0) / res.length);
console.log(`${NOBUILD ? '[不用道具] ' : '[用道具]   '}勝率 ${res.filter(r => r.win).length}/${res.length}　平均 ${avg(r => r.t).toFixed(0)} 秒　平均零件 ${avg(r => r.parts).toFixed(1)}/${CFG.PARTS.goal}　平均進化 ${(agg.evolutions / RUNS).toFixed(1)} 次`);
if (res.some(r => r.timeout)) console.log(`⚠ 有 ${res.filter(r => r.timeout).length} 局超過 ${MAX_T} 秒沒結束（可能卡死，要查）`);
console.log('各類型生成數：', TYPES.map(t => `${CFG.ZOMBIE[t].name} ${agg.spawned[t] || 0}`).join('　'));
console.log('各類型造成傷害：', TYPES.map(t => `${CFG.ZOMBIE[t].name} ${agg.dmg[t] || 0}`).join('　'));
console.log(`學習事件（總計）：障礙擋住 ${agg.stuck}　翻越甩掉 ${agg.vaults}　陷阱夾到 ${agg.snared}　閃過陷阱 ${agg.dodged}　誘餌騙到 ${agg.baited}`);
console.log('最後族群（前 3 局）：', agg.shares.slice(0, 3).join('  ||  '));
}
