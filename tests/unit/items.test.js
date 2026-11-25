/* 放道具：障礙放前方一道 3 格、陷阱放腳下、誘餌往前丟（DESIGN.md 第 4 節）。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CFG, N, idx, ix, iy, cellOf } from '../../src/config.js';
import { Grid } from '../../src/grid.js';
import { Game, gameTimers } from '../../src/game.js';
import { seedRandom, restoreRandom } from '../helpers/seed.js';

/** 開一局，清空地形與殭屍，玩家站在 (10.5, 10.5) 面向右 */
function setup() {
  seedRandom(11); gameTimers.length = 0;
  Game.reset(); Game.begin();
  Grid.rock.fill(0); Grid.low.fill(0); Grid.reset();
  Game.zombies = []; Game.scraps = []; Game.part = null;
  Object.assign(Game.player, { x: 10.5, y: 10.5, face: 0 });
}
const cellsOf = type => Grid.cells.map((c, i) => c && c.type === type ? i : -1).filter(i => i >= 0);

beforeEach(setup);
afterEach(restoreRandom);

describe('障礙', () => {
  it('放在正前方，一道 3 格寬，扣 8 材料', () => {
    const m = Game.materials;
    expect(Game.drop('obstacle')).toBe(true);
    const cs = cellsOf('obstacle');
    expect(cs.length).toBe(3);
    expect(cs.every(i => ix(i) === 11)).toBe(true);                 // 前方一格的那一排
    expect(cs.map(iy).sort((a, b) => a - b)).toEqual([9, 10, 11]);
    expect(Game.materials).toBe(m - CFG.BUILD.obstacle.cost);
    expect(Game.period.placed).toBe(1);
  });

  it('放下時跟殭屍重疊 → 撞暈牠', () => {
    const z = Game.spawnZombie('rusher', undefined, idx(11, 10));
    Game.drop('obstacle');
    expect(z.stun).toBeGreaterThan(0);
  });

  it('前方被擋住就往旁邊偏，不會放在玩家腳下', () => {
    Grid.rock[idx(11, 10)] = 1; Grid.rock[idx(12, 10)] = 1;
    expect(Game.drop('obstacle')).toBe(true);
    expect(Grid.cells[cellOf(10.5, 10.5)]).toBeNull();
  });
});

describe('陷阱', () => {
  it('放在腳下', () => {
    expect(Game.drop('trap')).toBe(true);
    expect(Grid.cells[cellOf(10.5, 10.5)]?.type).toBe('trap');
  });
  it('腳下已經有陷阱 → 改放後方', () => {
    Game.drop('trap'); Game.drop('trap');
    const cs = cellsOf('trap');
    expect(cs.length).toBe(2);
    expect(cs).toContain(idx(9, 10));
  });
});

describe('誘餌', () => {
  it('往前丟約 5 格', () => {
    expect(Game.drop('bait')).toBe(true);
    const [b] = cellsOf('bait');
    expect(ix(b)).toBe(15); expect(iy(b)).toBe(10);
  });
  it('廢墟擋住就丟近一點', () => {
    Grid.rock[idx(13, 10)] = 1;
    Game.drop('bait');
    const [b] = cellsOf('bait');
    expect(ix(b)).toBeLessThan(13);
  });
});

describe('限制', () => {
  it('材料不夠就放不了，也不扣錢', () => {
    Game.materials = 5;
    expect(Game.drop('obstacle')).toBe(false);
    expect(Game.materials).toBe(5);
    expect(Grid.count()).toBe(0);
  });
  it('還沒開始（標題畫面）不能放', () => {
    Game.phase = 'title';
    expect(Game.drop('trap')).toBe(false);
  });
});
