/* 電腦版（1280×760）：開場 → 移動 → 放道具 → 結算 → 再玩一次。 */
import { test, expect } from '@playwright/test';
import { boot, start, state, canvasHasContent } from './helpers.js';

test('載入沒有錯誤，3D 畫面有畫出東西', async ({ page }, info) => {
  const errors = await boot(page);
  await expect(page.locator('#oTitle')).toHaveText('Brain Shift');
  expect(await canvasHasContent(page)).toBeGreaterThan(5);
  await info.attach('title', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('按開始 → 進入遊戲，時間會走', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  const t0 = (await state(page)).time;
  await expect.poll(async () => (await state(page)).time, { timeout: 15000 }).toBeGreaterThan(t0 + 0.5);
  await expect(page.locator('#pbar')).toBeVisible();   // 血條跟在腳下
  expect(errors).toEqual([]);
});

test('Enter 也能開始', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
});

test('WASD 移動玩家', async ({ page }) => {
  await boot(page);
  await start(page);
  const a = await state(page);
  await page.keyboard.down('KeyA');
  // 用條件等待而不是固定毫秒：軟體繪圖（CI）幀率很低，時間不可靠
  await expect.poll(async () => (await state(page)).x, { timeout: 15000 }).toBeLessThan(a.x - 0.5);
  await page.keyboard.up('KeyA');
  expect(Math.abs((await state(page)).y - a.y)).toBeLessThan(0.5);
});

test('滑鼠點地面 → 走過去', async ({ page }) => {
  await boot(page);
  await start(page);
  const a = await state(page);
  const target = await page.evaluate(({ x, y }) => BS.View.toScreen(x + 3, y), a);
  await page.mouse.click(target.x, target.y);
  await expect.poll(async () => (await state(page)).x, { timeout: 15000 }).toBeGreaterThan(a.x + 2);
});

test('1／2／3 放障礙、陷阱、誘餌，扣材料、按鈕狀態更新', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  const a = await state(page);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit3');
  const b = await state(page);
  expect(b.obstacles).toBeGreaterThanOrEqual(1);
  expect(b.traps).toBe(1);
  expect(b.baits).toBe(1);
  expect(b.materials).toBe(a.materials - 8 - 10 - 10);
  await expect(page.locator('#vMat')).toHaveText(String(b.materials));
  // 材料 2 個 → 三個按鈕都變灰
  await expect(page.locator('.bld.poor')).toHaveCount(3);
  await page.waitForTimeout(500);   // 等誘餌拋物線落地
  await info.attach('items', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('按道具按鈕也能放（滑鼠）', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.locator('.bld[data-b="trap"]').click();
  await expect.poll(async () => (await state(page)).traps).toBe(1);
});

test('血量歸零 → 結算畫面 → 再玩一次會重開', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  await page.evaluate(() => { BS.Game.player.hp = 0; });
  await expect(page.locator('#overlay')).not.toHaveClass(/hide/);
  await expect(page.locator('#oTitle')).toHaveText('你被抓到了');
  await expect(page.locator('#obtn')).toHaveText('再玩一次');
  await info.attach('gameover', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#obtn').click();
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
  const s = await state(page);
  expect(s.hp).toBe(100);
  expect(s.time).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('撤離成功 → 勝利畫面', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { const G = BS.Game; G.evac = 'pickup'; G.player.x = 20.5; G.player.y = 15.5; });
  await expect(page.locator('#oTitle')).toHaveText('救援到了');
});

test('記憶圖層、速度按鈕可切換', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.keyboard.press('KeyH');
  await expect(page.locator('#btnMem')).toHaveClass(/on/);
  await page.keyboard.press('KeyF');
  await expect(page.locator('#btnSpeed')).toHaveText('速度 2x');
});

test('重置要按兩次', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.keyboard.press('Digit2');
  // 第二下要在 2.5 秒（真實時間）內按，機器忙的時候 Playwright 兩次點擊可能隔太久，所以在頁面裡連按
  const r = await page.evaluate(() => {
    const b = document.getElementById('btnReset');
    b.click(); const afterFirst = { text: b.textContent, traps: BS.Grid.count('trap') };
    b.click(); return { afterFirst, traps: BS.Grid.count('trap') };
  });
  expect(r.afterFirst).toEqual({ text: '再按一次', traps: 1 });   // 按一次不會重置
  expect(r.traps).toBe(0);
});

test('進化報告會顯示，5 秒後消失', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { const G = BS.Game; G.period.stuck = 40; G.memGap = 99; });
  await expect(page.locator('#report')).not.toHaveClass(/hide/);
  await expect(page.locator('#rTitle')).toHaveText('屍群進化 #1');
  const lines = await page.locator('#rBody li').count();
  expect(lines).toBeLessThanOrEqual(5);   // 族群一行＋最多 4 行重點
  // 報告按幀倒數（每幀最多 0.05 秒），CI 的軟體繪圖一秒只有幾幀，等 5 秒要將近一分鐘；
  // 所以確認出現後直接把倒數快轉到最後，只驗證「時間到會自己消失」
  await page.evaluate(() => { BS.UI.reportT = 0.01; });
  await expect(page.locator('#report')).toHaveClass(/hide/);
});

test('效能：40 隻殭屍時的幀時間（記錄用，軟體繪圖下只當相對比較）', async ({ page }, info) => {
  test.setTimeout(150_000);   // CI 機器用軟體繪圖，一幀可能要好幾百毫秒
  await boot(page);
  await start(page);
  await page.evaluate(() => {
    const G = BS.Game; G.player.hp = 1e9;
    for (let k = 0; k < 40; k++) G.spawnZombie(['rusher', 'pathfinder', 'breaker', 'vaulter'][k % 4]);
  });
  const ms = await page.evaluate(() => new Promise(res => {
    const ts = []; let last = performance.now();
    const f = now => { ts.push(now - last); last = now; if (ts.length < 30) requestAnimationFrame(f); else res(ts.sort((a, b) => a - b)); };
    requestAnimationFrame(f);
  }));
  const med = ms[ms.length >> 1], p95 = ms[Math.floor(ms.length * 0.95)];
  info.annotations.push({ type: 'perf', description: `中位數 ${med.toFixed(1)} ms、p95 ${p95.toFixed(1)} ms` });
  const calls = await page.evaluate(() => BS.View.r.info.render.calls);
  info.annotations.push({ type: 'draw calls', description: String(calls) });
  await info.attach('40-zombies', { body: await page.screenshot(), contentType: 'image/png' });
  expect(med).toBeLessThan(1000);
});
