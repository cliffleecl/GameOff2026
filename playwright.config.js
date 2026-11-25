import { defineConfig, devices } from '@playwright/test';

// E2E：測「打包後的 dist」——同時驗證相對路徑（itch.io zip／GitHub Pages 子路徑）能跑。
// 遊戲畫面是 WebGL，不做逐像素比對；改成檢查狀態（window.BS）＋存截圖給人看。
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: 2,   // WebGL 用軟體繪圖很吃 CPU，開太多同時跑會讓幀率掉到測不準
  retries: process.env.CI ? 1 : 0,
  expect: { timeout: 15_000 },   // 軟體繪圖下幀率低，等待條件要寬一點
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 760 } }, testIgnore: /mobile/ },
    { name: 'mobile-landscape', use: { ...devices['Pixel 7 landscape'], viewport: { width: 844, height: 390 } }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
