import { defineConfig } from 'vite';

// base 用相對路徑：同一份 dist 可以直接丟到 itch.io（zip）和 GitHub Pages（子路徑）都能跑
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
