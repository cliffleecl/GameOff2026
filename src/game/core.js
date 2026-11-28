/* Game 的狀態欄位、重置與共用小函式。其他檔案用 Object.assign(Game, {...}) 把方法掛上來。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from '../config.js';
import { Feel, FX, Input } from '../fx.js';
import { t } from '../i18n.js';
import { Grid } from '../grid.js';
import { resolve, clearLine, sight, lineHasTrap, lookAhead, steer, hash01 } from '../physics.js';
import { Memory, knowsTrap } from '../memory.js';
import { Path } from '../path.js';

export const Game = {
  phase: 'title', time: 0, materials: 0, parts: 0, zombies: [], player: null, scraps: [], part: null, partT: 0,
  spawnT: 0, hordeT: 0, hordeWarned: false, hordeQueue: 0, hordeDir: 0, hordeGap: 0, memGap: 0,
  evac: 'none', evacT: 0, period: null, nextId: 1, scrapId: 1, hitstop: 0, slowT: 0, win: false, spotted: false,
  portrait: false,

  reset() {
    Grid.reset(); Grid.generate(); Memory.reset();
    this.zombies = []; this.scraps = []; this.part = null; this.partT = 2;
    this.time = 0; this.materials = CFG.START_MATERIALS; this.parts = 0; this.nextId = 1; this.scrapId = 1;
    this.spawnT = 2; this.hordeT = CFG.HORDE.first; this.hordeWarned = false; this.hordeQueue = 0;
    this.memGap = 0; this.evac = 'none'; this.evacT = 0; this.hitstop = 0; this.slowT = 0; this.win = false;
    this.player = { x: RADIO.x + 0.5, y: RADIO.y + 1.5, r: CFG.PLAYER.radius, vault: true, hp: CFG.PLAYER.hp, vx: 0, vy: 0, mvx: 0, mvy: 0, face: -Math.PI / 2,
                    kx: 0, ky: 0, iframe: 0, shoveCd: 0, shoveT: 0, shoveDir: 0, path: null, pi: 0, dest: null, safeT: 0, regenAcc: 0, vaulting: false, boostT: 0 };
    this.newPeriod();
    for (let k = 0; k < CFG.SCRAP.count; k++) this.spawnScrap(true);
    this.spotted = false; this.seenTypes = {};
    this.stats = { items: 0, scraps: 0, escapes: 0 };   // 結算畫面用：用了幾個道具、撿了幾箱材料、甩掉幾次追兵
    for (let k = 0; k < CFG.WANDER.count; k++) {
      const i = this.randomFreeCell((x, y) => Math.hypot(x - RADIO.x, y - RADIO.y) > CFG.WANDER.minDist);
      if (i >= 0) this.makeWanderer(this.spawnZombie(this.rollType(true), undefined, i));
    }
    this.phase = 'title';
  },
  begin() { this.phase = 'play'; FX.msg(t('msg.begin')); },
  newPeriod() { this.period = { picks: 0, parts: 0, escapes: 0, stuck: 0, vaults: 0, snared: 0, baited: 0, placed: 0, losEsc: 0, dodged: 0, esc: { rusher: 0, pathfinder: 0, breaker: 0, vaulter: 0 } }; },
  minutes() { return this.time / 60; },
  learnedRatio() { return Math.min(CFG.MEMORY.learnedMax, CFG.MEMORY.learnedPerUpdate * Memory.updates); },
};

/* 遊戲時間計時器（跟著遊戲速度、暫停時不走） */
export const gameTimers = [];
export function setTimeoutGame(fn, sec) { gameTimers.push({ fn, t: sec }); }
export function tickGameTimers(dt) { for (let k = gameTimers.length - 1; k >= 0; k--) { const g = gameTimers[k]; g.t -= dt; if (g.t <= 0) { gameTimers.splice(k, 1); g.fn(); } } }
