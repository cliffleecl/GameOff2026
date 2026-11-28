/* 調參數：參數面板和 sim --cfg 共用的套用／比對／還原。 */
import { describe, it, expect, afterEach } from 'vitest';
import { CFG, CFG_DEFAULTS, applyCfg, cfgDiff, resetCfg } from '../../src/config.js';

afterEach(resetCfg);

describe('applyCfg／cfgDiff／resetCfg', () => {
  it('只改指定欄位，其他保持原值', () => {
    applyCfg({ PLAYER: { speed: 3.4 }, ITEM_COST: 6 });
    expect(CFG.PLAYER.speed).toBe(3.4);
    expect(CFG.ITEM_COST).toBe(6);
    expect(CFG.PLAYER.hp).toBe(CFG_DEFAULTS.PLAYER.hp);
  });
  it('打錯字的欄位、型別不對的值會被略過', () => {
    applyCfg({ PLAYER: { sped: 9, hp: 'abc' }, NOPE: 1 });
    expect(CFG.PLAYER.sped).toBeUndefined();
    expect(CFG.PLAYER.hp).toBe(CFG_DEFAULTS.PLAYER.hp);
    expect(CFG.NOPE).toBeUndefined();
  });
  it('地圖尺寸不能即時改', () => {
    applyCfg({ COLS: 99 });
    expect(CFG.COLS).toBe(CFG_DEFAULTS.COLS);
  });
  it('cfgDiff 只列出改過的欄位，還原後是空的', () => {
    applyCfg({ ZOMBIE: { vaulter: { speed: 4 } } });
    expect(cfgDiff()).toEqual({ ZOMBIE: { vaulter: { speed: 4 } } });
    resetCfg();
    expect(cfgDiff()).toEqual({});
  });
});
