/* 族群進化：玩家做的事 → 哪一型變多，要直接對應（DESIGN.md 6.2）。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CFG } from '../../src/config.js';
import { Memory, knowsTrap } from '../../src/memory.js';
import { Game } from '../../src/game.js';

const E = CFG.MEMORY.evo;
const period = over => { Game.newPeriod(); return Object.assign(Game.period, over); };

beforeEach(() => Memory.reset());

describe('族群進化對應', () => {
  it('障礙擋住殭屍 → 拆除型變多', () => {
    const before = Memory.weights.breaker;
    Memory.evolve(period({ stuck: 10 }));
    expect(Memory.weights.breaker).toBeGreaterThan(before);
    expect(Memory.weights.vaulter).toBe(E.start.vaulter);
  });

  it('翻越甩掉 → 跑酷型變多', () => {
    Memory.evolve(period({ vaults: 10 }));
    expect(Memory.weights.vaulter).toBeGreaterThan(E.start.vaulter);
    expect(Memory.weights.breaker).toBe(E.start.breaker);
  });

  it('陷阱、誘餌、躲廢墟 → 繞路型變多', () => {
    for (const k of ['snared', 'baited', 'losEsc']) {
      Memory.reset();
      Memory.evolve(period({ [k]: 10 }));
      expect(Memory.weights.pathfinder, k).toBeGreaterThan(E.start.pathfinder);
    }
  });

  it('有用招 → 盲衝變少，但不低於下限', () => {
    for (let k = 0; k < 50; k++) Memory.evolve(period({ stuck: 1 }));
    expect(Memory.weights.rusher).toBe(E.rusherMin);
  });

  it('什麼都沒做 → 族群不變', () => {
    Memory.evolve(period({}));
    expect(Memory.weights).toEqual(E.start);
  });

  it('各型權重有上限', () => {
    for (let k = 0; k < 100; k++) Memory.evolve(period({ stuck: 50, vaults: 50, baited: 50 }));
    expect(Memory.weights.breaker).toBe(E.max.breaker);
    expect(Memory.weights.vaulter).toBe(E.max.vaulter);
    expect(Memory.weights.pathfinder).toBe(E.max.pathfinder);
  });
});

describe('全屍群學習（即時生效）', () => {
  it('陷阱夾越多，認得陷阱越多，上限 trapMax', () => {
    Game.reset();
    Memory.commit(period({ snared: 3 }), 0);
    expect(Memory.trapAware).toBeCloseTo(E.trapLearn * 3);
    for (let k = 0; k < 30; k++) Memory.commit(period({ snared: 5 }), 0);
    expect(Memory.trapAware).toBe(E.trapMax);
  });

  it('knowsTrap：繞路型天生認得；盲衝只學到一半；其他照 trapRoll', () => {
    Memory.trapAware = 0.6;
    expect(knowsTrap({ type: 'pathfinder', trapRoll: 0.99 })).toBe(true);
    expect(knowsTrap({ type: 'vaulter', trapRoll: 0.5 })).toBe(true);
    expect(knowsTrap({ type: 'vaulter', trapRoll: 0.7 })).toBe(false);
    expect(knowsTrap({ type: 'rusher', trapRoll: 0.29 })).toBe(true);
    expect(knowsTrap({ type: 'rusher', trapRoll: 0.31 })).toBe(false);
  });

  it('學習不是出生時決定：trapAware 上升，同一隻殭屍立刻變聰明', () => {
    const z = { type: 'breaker', trapRoll: 0.4 };
    Memory.trapAware = 0.2; expect(knowsTrap(z)).toBe(false);
    Memory.trapAware = 0.5; expect(knowsTrap(z)).toBe(true);
  });
});
