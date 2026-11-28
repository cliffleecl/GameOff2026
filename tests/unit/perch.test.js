/* 站在矮牆／障礙上不是安全區；材料箱一箱補一格（DESIGN.md 第 3、4 節）。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG, idx } from '../../src/config.js';
import { Grid } from '../../src/grid.js';
import { Game, gameTimers } from '../../src/game.js';
import { seedRandom, restoreRandom } from '../helpers/seed.js';

/** 空地圖，中間一道直的矮牆（x = 10，y 5–15），玩家站在牆上 (10.5, 10.5) */
function setup() {
  seedRandom(7); gameTimers.length = 0;
  Game.reset(); Game.begin();
  Grid.rock.fill(0); Grid.low.fill(0); Grid.reset();
  for (let y = 5; y <= 15; y++) Grid.low[idx(10, y)] = 1;
  Game.zombies = []; Game.scraps = []; Game.part = null; Game.spotted = true;
  Object.assign(Game.player, { x: 10.5, y: 10.5, face: 0, hp: CFG.PLAYER.hp });
}
beforeEach(setup);
afterEach(restoreRandom);

/** 只跑玩家和指定殭屍（不生新殭屍），回傳玩家剩下的血 */
function runFor(sec, zs) {
  const dt = 1 / 30;
  for (let t = 0; t < sec; t += dt) { Game.updatePlayer(dt); for (const z of zs) Game.updateZombie(z, dt); }
  return Game.player.hp;
}

describe('站在矮牆上', () => {
  for (const type of ['rusher', 'pathfinder', 'breaker']) {
    it(`${type}（翻不過牆）走到牆邊也抓得到你`, () => {
      const z = Game.spawnZombie(type, undefined, idx(6, 10));
      z.mode = 'chase'; z.repath = 0;
      expect(runFor(8, [z])).toBeLessThan(CFG.PLAYER.hp);
    });
  }

  it('從牆後面繞過來也一樣（目標格過不去 → 改走到旁邊）', () => {
    const z = Game.spawnZombie('pathfinder', undefined, idx(14, 3));
    z.mode = 'chase'; z.repath = 0;
    expect(runFor(10, [z])).toBeLessThan(CFG.PLAYER.hp);
  });

  it('站在空地上時，攻擊距離沒有變長', () => {
    Grid.low.fill(0);
    Object.assign(Game.player, { x: 10.5, y: 10.5 });
    const z = Game.spawnZombie('rusher', undefined, idx(11, 10));
    Object.assign(z, { x: 10.5 + CFG.PLAYER.radius + z.r + 0.2, y: 10.5, mode: 'chase', stun: 99 });
    Game.updatePlayer(1 / 30); Game.updateZombie(z, 1 / 30);
    expect(Game.player.hp).toBe(CFG.PLAYER.hp);
  });
});

describe('材料箱', () => {
  it('一箱補材料條一格（＝一個道具的價格）', () => {
    Game.materials = 0;
    Game.spawnScrap(true);
    const s = Game.scraps[0];
    Object.assign(Game.player, { x: s.x, y: s.y });
    Game.updatePickups(1 / 30);
    expect(Game.materials).toBe(CFG.ITEM_COST);
  });
});
