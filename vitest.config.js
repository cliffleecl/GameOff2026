import { defineConfig } from 'vitest/config';

// 單元測試只測邏輯層（Node 直接跑，不開瀏覽器）；E2E 在 tests/e2e，用 Playwright 跑
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node' },
});
