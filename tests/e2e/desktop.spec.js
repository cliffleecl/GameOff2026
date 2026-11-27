/* 電腦版（1280×760）：標題 → 如何遊玩 → 語言 → 開始 → 移動 → 道具 → 結算 → 再玩一次／回標題。 */
import { test, expect } from '@playwright/test';
import { boot, start, state, canvasHasContent } from './helpers.js';

test('標題畫面：Logo、三個選項，3D 背景有畫出東西，沒有錯誤', async ({ page }, info) => {
  const errors = await boot(page);
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('.logo')).toBeVisible();
  await expect(page.locator('#btnStart')).toHaveText('開始遊戲');
  await expect(page.locator('#btnHow')).toHaveText('如何遊玩');
  await expect(page.locator('#btnLang')).toHaveText('語言：繁體中文');
  await expect(page.locator('#hud')).toBeHidden();          // 選單時藏 HUD
  expect(await canvasHasContent(page)).toBeGreaterThan(2);
  await info.attach('title', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('語言切換：繁中 → 簡中 → 英文，會記住', async ({ page }) => {
  await boot(page);
  await page.locator('#btnLang').click();
  await expect(page.locator('#btnStart')).toHaveText('开始游戏');
  await page.locator('#btnLang').click();
  await expect(page.locator('#btnStart')).toHaveText('Start Game');
  await expect(page.locator('#btnLang')).toHaveText('Language: English');
  await expect(page.locator('.bld[data-b="obstacle"] span')).toHaveText('Barrier');
  expect(await page.evaluate(() => localStorage.getItem('bs-lang'))).toBe('en');   // 下次開啟會讀這個值
});

test('沒存過語言：英文瀏覽器預設英文', async ({ page }) => {
  await boot(page, { lang: null });   // 不寫入 bs-lang，用瀏覽器語言（Playwright 預設 en-US）
  await expect(page.locator('#btnStart')).toHaveText('Start Game');
});

test('如何遊玩 → 返回', async ({ page }, info) => {
  await boot(page);
  await page.locator('#btnHow').click();
  await expect(page.locator('#howto')).toBeVisible();
  await expect(page.locator('#howto h2')).toHaveText('如何遊玩');
  await info.attach('howto', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
});

test('開始遊戲 → HUD 置中三格（零件六格圖示、時間、屍腦），時間會走', async ({ page }) => {
  const errors = await boot(page);
  await start(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#sParts .slot')).toHaveCount(6);
  await expect(page.locator('#hud h1')).toHaveCount(0);      // 不顯示遊戲名稱
  const boxes = await Promise.all(['#sParts', '#sTime', '#brainStat'].map(s => page.locator(s).boundingBox()));
  const widths = boxes.map(b => b.width);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);          // 三格一樣大
  const mid = (boxes[0].x + boxes[2].x + boxes[2].width) / 2;
  expect(Math.abs(mid - 640)).toBeLessThan(4);                                  // 置中
  const t0 = (await state(page)).time;
  await expect.poll(async () => (await state(page)).time, { timeout: 15000 }).toBeGreaterThan(t0 + 0.3);
  await expect(page.locator('#pbar')).toBeVisible();          // 血條＋材料條跟在腳下
  expect(errors).toEqual([]);
});

test('Enter 也能開始', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
});

test('遊戲中沒有重置／記憶／速度按鈕', async ({ page }) => {
  await boot(page);
  await start(page);
  for (const id of ['#btnSpeed', '#btnMem', '#btnReset']) await expect(page.locator(id)).toHaveCount(0);
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
  // CI 一秒只有 1～2 幀，走 2 格要十幾秒：門檻 1 格、等久一點
  await expect.poll(async () => (await state(page)).x, { timeout: 40000 }).toBeGreaterThan(a.x + 1);
});

test('主角在畫面正中央', async ({ page }) => {
  await boot(page);
  await start(page);
  // 鏡頭從標題畫面的位置慢慢移過來，等它到位
  const off = () => page.evaluate(() => { const s = BS.View.toScreen(BS.Game.player.x, BS.Game.player.y, 0.5); return Math.hypot(s.x - innerWidth / 2, s.y - innerHeight / 2); });
  await expect.poll(off, { timeout: 30000 }).toBeLessThan(40);
});

test('1／2／3 放障礙、陷阱、誘餌；價格都一樣，材料條跟著變', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  const a = await state(page), cost = await page.evaluate(() => BS.CFG.ITEM_COST);
  const w0 = await page.evaluate(() => parseFloat(document.getElementById('mfill').style.width));
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit3');
  const b = await state(page);
  expect(b.obstacles).toBeGreaterThanOrEqual(1);
  expect(b.traps).toBe(1);
  expect(b.baits).toBe(1);
  expect(b.materials).toBe(a.materials - cost * 3);
  await expect.poll(() => page.evaluate(() => parseFloat(document.getElementById('mfill').style.width))).toBeLessThan(w0);
  await expect(page.locator('.bld small')).toHaveCount(0);   // 按鈕上不顯示價格
  if (b.materials < cost) await expect(page.locator('.bld.poor')).toHaveCount(3);
  await page.waitForTimeout(500);
  await info.attach('items', { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('路障轉向：面向哪裡，就橫擋在哪裡', async ({ page }) => {
  await boot(page);
  await start(page);
  const faces = await page.evaluate(() => {
    const G = BS.Game; G.player.face = Math.PI / 2; G.drop('obstacle');
    return BS.Grid.cells.filter(c => c && c.type === 'obstacle').map(c => c.face);
  });
  for (const f of faces) expect(f).toBeCloseTo(Math.PI / 2);
  await expect.poll(() => page.evaluate(() => [...BS.View.sMap.values()].filter(o => o.type === 'obstacle').map(o => +o.g.rotation.y.toFixed(3)))).toEqual(faces.map(() => 0));
});

test('按道具按鈕也能放（滑鼠）', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.locator('.bld[data-b="trap"]').click();
  await expect.poll(async () => (await state(page)).traps).toBe(1);
});

test('撿到零件 → HUD 那一格亮起來', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { const G = BS.Game; G.part = { x: G.player.x, y: G.player.y }; });
  await expect(page.locator('#sParts .slot.on')).toHaveCount(1);
});

test('血量歸零 → 大字結算 → 再玩一次', async ({ page }, info) => {
  const errors = await boot(page);
  await start(page);
  await page.evaluate(() => { BS.Game.player.hp = 0; });
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resTitle')).toHaveText('你被抓到了');
  await expect(page.locator('#resStats .st')).toHaveCount(5);
  await expect(page.locator('#resLegend span')).toHaveCount(4);
  await info.attach('gameover', { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('#btnAgain').click();
  await expect.poll(() => page.evaluate(() => BS.Game.phase)).toBe('play');
  const s = await state(page);
  expect(s.hp).toBe(await page.evaluate(() => BS.CFG.PLAYER.hp));
  expect(s.time).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test('結算 → 回標題', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { BS.Game.player.hp = 0; });
  await page.locator('#btnMenu').click();
  await expect(page.locator('#title')).toBeVisible();
  expect(await page.evaluate(() => BS.Game.phase)).toBe('title');
});

test('撤離：直升機降落 → 上機 → 飛走 → 勝利結算', async ({ page }, info) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { BS.Game.evac = 'pickup'; });
  await expect.poll(() => page.evaluate(() => BS.View.heli.g.visible)).toBe(true);
  await page.evaluate(() => { const G = BS.Game, r = BS.CFG; G.player.x = 20.5; G.player.y = 15.5; });
  await expect.poll(() => page.evaluate(() => BS.View.boarded)).toBe(true);
  await info.attach('heli', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(page.locator('#resTitle')).toHaveText('救援到了', { timeout: 20000 });
});

test('快捷鍵：F 速度、H 記憶圖、R 連按兩次才重開', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.keyboard.press('KeyF');
  expect(await page.evaluate(() => BS.UI.speed)).toBe(2);
  await page.keyboard.press('KeyH');
  expect(await page.evaluate(() => BS.UI.mem)).toBe(true);
  await page.keyboard.press('Digit2');
  // 第二下要在 2.5 秒（真實時間）內按，機器忙的時候兩次按鍵可能隔太久，所以在頁面裡連按
  const r = await page.evaluate(() => {
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    press(); const afterFirst = BS.Grid.count('trap');
    press(); return { afterFirst, traps: BS.Grid.count('trap') };
  });
  expect(r.afterFirst).toBe(1);   // 按一次不會重開
  expect(r.traps).toBe(0);
});

test('進化報告會顯示，時間到會消失', async ({ page }) => {
  await boot(page);
  await start(page);
  await page.evaluate(() => { const G = BS.Game; G.period.stuck = 40; G.memGap = 99; });
  await expect(page.locator('#report')).not.toHaveClass(/hide/);
  await expect(page.locator('#rTitle')).toHaveText('屍群進化 #1');
  const lines = await page.locator('#rBody li').count();
  expect(lines).toBeLessThanOrEqual(5);   // 族群一行＋最多 4 行重點
  // 報告按幀倒數，CI 的軟體繪圖一秒只有幾幀；確認出現後把倒數快轉到最後，只驗證「時間到會自己消失」
  await page.evaluate(() => { BS.UI.reportT = 0.01; });
  await expect(page.locator('#report')).toHaveClass(/hide/);
});

test('調參數面板：?tune 打開，改值立即生效、會記住、可還原', async ({ page }) => {
  await boot(page);
  await page.goto('./?tune');
  await page.waitForFunction(() => window.BS && window.BS.View.r);
  await expect(page.locator('.lil-gui.root')).toBeVisible();
  // 透過面板的 onChange 存檔：直接改面板上的控制項
  await page.locator('.lil-gui .title', { hasText: '玩家' }).click();
  const input = page.locator('.lil-gui .controller', { hasText: 'speed' }).first().locator('input');
  await input.fill('3.9'); await input.press('Enter');
  expect(await page.evaluate(() => BS.CFG.PLAYER.speed)).toBe(3.9);
  await expect(page.locator('#tuneBadge')).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('bs-tune'))).PLAYER.speed).toBe(3.9);
  await page.locator('.lil-gui button', { hasText: '全部還原' }).click();
  expect(await page.evaluate(() => BS.CFG.PLAYER.speed)).toBe(3);
  await expect(page.locator('#tuneBadge')).toHaveCount(0);
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
  expect(med).toBeLessThan(1500);
});
