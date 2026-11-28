/* 整局冒煙測試：用 sim/ 的模擬玩家跑完整局，確認不會卡死、不會丟例外。
 * 這不是平衡測試（平衡看 `npm run sim` 的前後比較），只是保證「每一局都會結束」。 */
import { describe, it, expect, afterEach } from 'vitest';
import { run } from '../../sim/sim.mjs';
import { Game } from '../../src/game.js';
import { seedRandom, restoreRandom } from '../helpers/seed.js';

afterEach(restoreRandom);

describe('模擬玩家整局', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const nobuild of [false, true]) {
      it(`種子 ${seed}${nobuild ? '（不用道具）' : ''}：900 秒內結束`, () => {
        seedRandom(seed);
        const r = run({ nobuild });
        expect(r.timeout).toBe(false);
        expect(Game.phase).toBe('over');
        for (const z of Game.zombies) { expect(Number.isFinite(z.x) && Number.isFinite(z.y)).toBe(true); }
      });
    }
  }
});

describe('id 不重複（曾經因為註解吃掉欄位而全部共用同一個 id）', () => {
  it('同一局內每隻殭屍 id 都不同', () => {
    seedRandom(9);
    Game.reset(); Game.begin();
    for (let k = 0; k < 20; k++) Game.spawnZombie('rusher');
    const ids = Game.zombies.map(z => z.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
