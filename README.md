# Brain Shift

會學習的殭屍 × 跑酷逃生。Game Jam 主題：**Shift**。

你是跑酷專家，殺不死殭屍，只能翻牆、放障礙、設陷阱、丟肉把牠們甩掉。你用哪一招，屍群就進化出破解那一招的類型。

## 開始

```bash
npm install
npm run dev      # 開發伺服器（存檔自動更新；同一個 Wi-Fi 的手機也能連終端機顯示的 Network 網址）
```

## 指令

| 指令 | 作用 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run sim` | 模擬玩家跑 30 局，檢查平衡與有沒有卡死（`-- --runs 100`、`-- --nobuild`） |
| `npm run build` | 建置到 `dist/` |
| `npm run preview` | 本機預覽 `dist/`（跟上線後一樣的檔案） |
| `npm run zip` | 建置並壓成 `brain-shift-itch.zip`，手動上傳 itch.io |
| `npm run itch` | 建置並用 butler 直接推上 itch.io（需設定 `ITCH_TARGET`） |

## 發佈

**GitHub Pages**：推到 `main` 會自動建置並發佈（`.github/workflows/deploy.yml`）。第一次要到 repo 的 Settings → Pages → Source 選「GitHub Actions」。

**itch.io**：Kind of project 選 HTML，上傳 `npm run zip` 產生的檔案，勾 *This file will be played in the browser*。建議 Viewport 960×600、勾 Mobile friendly（Landscape）、Fullscreen button。

## 文件

- [`docs/DESIGN.md`](docs/DESIGN.md)：遊戲設計、目前數值、設計決定與原因、已知問題
- [`CLAUDE.md`](CLAUDE.md)：給 Claude Code 的專案說明與工作守則
- [`archive/`](archive/)：v1–v4 的單檔舊版本
