/* 手機橫向（844×390，觸控）：虛擬搖桿、右手道具按鈕、版面不重疊。 */
import { test, expect } from '@playwright/test';
import { boot, start, state } from './helpers.js';

const box = l => l.boundingBox();
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('觸控版面：搖桿在左、道具按鈕在右下、都在畫面內、不互相重疊', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  await expect(page.locator('body')).toHaveClass(/touch/);
  await expect(page.locator('#rotate')).toBeHidden();
  const vw = 844, vh = 390;
  const btns = await Promise.all(['obstacle', 'trap', 'bait'].map(b => box(page.locator(`.bld[data-b="${b}"]`))));
  for (const b of btns) {
    expect(b.x + b.width).toBeLessThanOrEqual(vw); expect(b.y + b.height).toBeLessThanOrEqual(vh);
    expect(b.x).toBeGreaterThan(vw / 2);                 // 右手
    expect(b.width).toBeGreaterThanOrEqual(44);          // 手指按得到
  }
  const stick = await box(page.locator('#stick'));
  expect(stick.x + stick.width / 2).toBeLessThan(vw / 2);  // 左手
  const mm = await box(page.locator('#minimap'));
  for (const b of btns) expect(overlap(b, mm)).toBe(false);
  // HUD 三格在畫面內、不跟小地圖重疊
  for (const id of ['#sParts', '#sTime', '#brainStat']) {
    const o = await box(page.locator(id));
    expect(o.x).toBeGreaterThanOrEqual(0); expect(o.x + o.width).toBeLessThanOrEqual(vw);
    expect(overlap(o, mm), id).toBe(false);
  }
  await info.attach('mobile', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('左半邊按住拖曳＝虛擬搖桿，玩家往拖的方向走', async ({ page }) => {
  await boot(page);
  await start(page);
  const a = await state(page);
  // 用 pointer 事件模擬手指（Playwright 的 touchscreen 只有 tap）
  await page.mouse.move(150, 250);
  await page.mouse.down();
  await page.mouse.move(200, 250, { steps: 4 });   // 往右拖
  await expect.poll(async () => (await state(page)).x, { timeout: 15000 }).toBeGreaterThan(a.x + 0.5);
  await page.mouse.up();
  // 放開後停下來
  const c = await state(page); await page.waitForTimeout(300); const d = await state(page);
  expect(Math.abs(d.x - c.x)).toBeLessThan(0.3);
});

test('點道具按鈕放陷阱', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.locator('.bld[data-b="trap"]').tap();
  await expect.poll(async () => (await state(page)).traps).toBe(1);
});

test('直向顯示「請轉成橫向」', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await expect(page.locator('#rotate')).toBeVisible();
});

test('手機橫向：標題畫面的按鈕都在畫面內、按得到', async ({ page }, info) => {
  await boot(page);
  for (const id of ['#btnStart', '#btnHow', '#btnLang']) {
    const b = await box(page.locator(id));
    expect(b.y + b.height, id).toBeLessThanOrEqual(390);
    expect(b.height, id).toBeGreaterThanOrEqual(40);
  }
  await info.attach('mobile-title', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#btnStart').tap();
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
});

test('手機橫向：結算畫面放得下、按鈕看得到', async ({ page }, info) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { BS.Game.player.hp = 0; });
  await expect(page.locator('#result')).toBeVisible();
  const b = await box(page.locator('#btnAgain'));
  expect(b.y + b.height).toBeLessThanOrEqual(390);
  await info.attach('mobile-result', { body: await page.screenshot(), contentType: 'image/png' });
});
