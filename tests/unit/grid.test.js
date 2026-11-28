import { describe, it, expect, afterEach } from 'vitest';
import { CFG, C, R, N, idx, ix, iy, inB, cellOf, DIR4, RADIO } from '../../src/config.js';
import { Grid } from '../../src/grid.js';
import { seedRandom, restoreRandom } from '../helpers/seed.js';

afterEach(restoreRandom);

/** 從無線電出發、不翻牆（不走 rock 也不走 low）能走到的格子 */
function reachable() {
  const seen = new Uint8Array(N), q = [cellOf(RADIO.x, RADIO.y)]; seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop();
    for (const [dx, dy] of DIR4) {
      const x = ix(c) + dx, y = iy(c) + dy; if (!inB(x, y)) continue;
      const n = idx(x, y);
      if (!seen[n] && !Grid.rock[n] && !Grid.low[n]) { seen[n] = 1; q.push(n); }
    }
  }
  return seen;
}

describe('地圖生成', () => {
  for (const seed of [1, 2, 3, 42, 1234, 9999]) {
    it(`種子 ${seed}：不翻牆也能走到所有空地（殭屍一定追得到你）`, () => {
      seedRandom(seed); Grid.reset(); Grid.generate();
      const seen = reachable();
      for (let i = 0; i < N; i++) if (!Grid.rock[i] && !Grid.low[i]) expect(seen[i], `格子 (${ix(i)},${iy(i)}) 是孤島`).toBe(1);
    });
  }

  it('無線電周圍保持淨空', () => {
    for (const seed of [5, 6, 7]) {
      seedRandom(seed); Grid.reset(); Grid.generate();
      for (let i = 0; i < N; i++) {
        if (Math.hypot(ix(i) + 0.5 - RADIO.x, iy(i) + 0.5 - RADIO.y) < CFG.MAP.clearRadius - 1) {
          expect(Grid.rock[i] || Grid.low[i]).toBeFalsy();
        }
      }
    }
  });

  it('同一個種子產生同一張地圖（測試可重現）', () => {
    seedRandom(77); Grid.generate(); const a = Grid.rock.slice();
    seedRandom(77); Grid.generate(); const b = Grid.rock.slice();
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('有矮牆可以翻（跑酷玩法的前提）', () => {
    seedRandom(3); Grid.generate();
    expect(Grid.low.reduce((a, v) => a + v, 0)).toBeGreaterThan(5);
  });
});

describe('翻越規則', () => {
  it('矮牆和障礙：能翻的實體過得去，其他擋住；廢墟誰都過不去', () => {
    Grid.rock.fill(0); Grid.low.fill(0); Grid.reset();
    const lowI = idx(2, 2), obsI = idx(3, 3), rockI = idx(4, 4);
    Grid.low[lowI] = 1; Grid.place(obsI, 'obstacle'); Grid.rock[rockI] = 1;
    for (const i of [lowI, obsI]) { expect(Grid.blocks(i, true)).toBe(false); expect(Grid.blocks(i, false)).toBe(true); }
    expect(Grid.blocks(rockI, true)).toBe(true);
    expect(Grid.solid(-1, 0, true)).toBe(true);   // 地圖外
  });

  it('陷阱、誘餌不擋路', () => {
    Grid.rock.fill(0); Grid.low.fill(0); Grid.reset();
    Grid.place(idx(1, 1), 'trap'); Grid.place(idx(2, 1), 'bait');
    expect(Grid.blocks(idx(1, 1), false)).toBe(false);
    expect(Grid.blocks(idx(2, 1), false)).toBe(false);
    expect(Grid.count('trap')).toBe(1);
  });
});
