/* E2E 共用：固定亂數種子、固定語言、收集錯誤、等遊戲載入。 */
import { expect } from '@playwright/test';

/** 在頁面任何程式執行前，把 Math.random 換成固定種子（同一張地圖、同一批殭屍），並固定語言 */
export async function seed(page, s = 12345, lang = 'zh-Hant') {
  await page.addInitScript(({ s0, l }) => {
    let a = s0 >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    try { if (l) localStorage.setItem('bs-lang', l); localStorage.removeItem('bs-tune'); } catch { /* 沒有 storage 也沒關係 */ }
  }, { s0: s, l: lang });
}

/** 收集 console.error 與未捕捉的例外；測試結束時應該是空的 */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}

export async function boot(page, { seedValue = 12345, lang = 'zh-Hant' } = {}) {
  await seed(page, seedValue, lang);
  const errors = collectErrors(page);
  await page.goto('./');
  await page.waitForFunction(() => window.BS && window.BS.View.r);
  return errors;
}

/** 從標題畫面按「開始遊戲」 */
export async function start(page) {
  await page.locator('#btnStart').click();
  await expect(page.locator('#title')).toHaveClass(/hide/);
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
}

export const state = page => page.evaluate(() => {
  const G = BS.Game, P = G.player;
  return { phase: G.phase, time: G.time, hp: P.hp, x: P.x, y: P.y, materials: G.materials, zombies: G.zombies.length,
           obstacles: BS.Grid.count('obstacle'), traps: BS.Grid.count('trap'), baits: BS.Grid.count('bait') };
});

/** 畫面有沒有真的畫出東西（不是一片黑／一片單色）：取 canvas 像素的變異量 */
export async function canvasHasContent(page) {
  return page.evaluate(() => {
    const src = document.getElementById('cv'), c = document.createElement('canvas'); c.width = 64; c.height = 40;
    BS.View.r.render(BS.View.scene, BS.View.cam);   // 確保 drawing buffer 有東西可讀
    const g = c.getContext('2d'); g.drawImage(src, 0, 0, 64, 40);
    const d = g.getImageData(0, 0, 64, 40).data; let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; s += v; s2 += v * v; n++; }
    return Math.sqrt(s2 / n - (s / n) ** 2);
  });
}
