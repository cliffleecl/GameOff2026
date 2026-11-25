import { describe, it, expect } from 'vitest';
import { C, R, idx, ix, iy } from '../../src/config.js';
import { Path } from '../../src/path.js';

const open = () => 1;

describe('A* 尋路', () => {
  it('空地：走最短的曼哈頓距離', () => {
    const p = Path.find(idx(0, 0), idx(5, 3), open);
    expect(p).not.toBeNull();
    expect(p.length).toBe(8);
    expect(p.at(-1)).toBe(idx(5, 3));
  });

  it('路徑每一步只走上下左右一格', () => {
    const p = [idx(1, 1), ...Path.find(idx(1, 1), idx(20, 15), open)];
    for (let k = 1; k < p.length; k++) expect(Math.abs(ix(p[k]) - ix(p[k - 1])) + Math.abs(iy(p[k]) - iy(p[k - 1]))).toBe(1);
  });

  it('被牆圍住時回傳 null', () => {
    const wall = new Set();
    for (let y = 0; y < R; y++) wall.add(idx(10, y));
    expect(Path.find(idx(2, 2), idx(20, 2), i => wall.has(i) ? Infinity : 1)).toBeNull();
  });

  it('會繞開高成本的格子（例如殭屍認得的陷阱）', () => {
    const trap = idx(3, 0);
    const p = Path.find(idx(0, 0), idx(6, 0), i => i === trap ? 50 : 1);
    expect(p).not.toContain(trap);
  });

  it('連續呼叫不會互相干擾（共用緩衝區）', () => {
    const a = Path.find(idx(0, 0), idx(C - 1, R - 1), open);
    Path.find(idx(5, 5), idx(6, 6), open);
    const b = Path.find(idx(0, 0), idx(C - 1, R - 1), open);
    expect(b.length).toBe(a.length);
  });
});
