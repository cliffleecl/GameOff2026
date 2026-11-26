/* 多國語言：三種語言的 key 要一致，參數 {x} 也要一致，不然切語言會出現 key 或少字。 */
import { describe, it, expect, afterEach } from 'vitest';
import { I18N, LANGS, t, guessLang } from '../../src/i18n.js';

afterEach(() => { I18N.lang = 'en'; });

describe('i18n', () => {
  it('每個英文 key 在三種語言都翻譯了，參數也一樣', async () => {
    const mod = await import('../../src/i18n.js');
    const D = mod.__DICT;
    for (const lang of LANGS) {
      for (const k of Object.keys(D.en)) {
        expect(D[lang][k], `${lang} 缺少 ${k}`).toBeTypeOf('string');
        const ps = s => (s.match(/\{\w+\}/g) || []).sort().join();
        expect(ps(D[lang][k]), `${lang} ${k} 參數不同`).toBe(ps(D.en[k]));
      }
      expect(Object.keys(D[lang]).length).toBe(Object.keys(D.en).length);
    }
  });
  it('代入參數', () => {
    I18N.lang = 'zh-Hant';
    expect(t('msg.part', { part: '天線', n: 2, goal: 6 })).toBe('找到天線（2/6）');
    I18N.lang = 'en';
    expect(t('rep.vault', { n: 3 })).toBe('Vaulted away ×3 → more Runners');
  });
  it('找不到的 key 回傳 key 本身', () => { expect(t('no.such.key')).toBe('no.such.key'); });
  it('依瀏覽器語言猜預設', () => {
    expect(guessLang('zh-TW')).toBe('zh-Hant');
    expect(guessLang('zh-HK')).toBe('zh-Hant');
    expect(guessLang('zh-CN')).toBe('zh-Hans');
    expect(guessLang('en-US')).toBe('en');
    expect(guessLang('ja')).toBe('en');
  });
});
