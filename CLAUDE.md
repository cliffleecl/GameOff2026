# Brain Shift — 給 Claude Code 的專案說明

H5 遊戲（Game Jam 主題「Shift」）：跑酷逃生 × 會進化的殭屍。目標平台是 **itch.io（HTML 模式）** 和 **GitHub Pages**，不移植 Unity。

開始任何工作前，先讀 `docs/DESIGN.md`：裡面有目前的規則、每個設計決定的原因，以及已知問題。

## 溝通

- 使用者用**繁體中文**。回覆、遊戲內文字、程式註解都用繁體中文。
- 使用者是遊戲設計者，會直接玩了再給回饋。回報時先講結論和玩起來會有什麼不同，再講實作細節。
- 設計上有疑慮就直接說（例如「這樣會讓 X 變成最佳解」），並盡量用 `npm run sim` 的數據佐證，不要只憑感覺。

## Git 分支策略與 Commit 習慣

- **分支策略（Semi-linear）**：
  - `main` 為唯一常駐主分支（推送至 `main` 會透過 `.github/workflows/deploy.yml` 自動建置並發佈到 GitHub Pages）。
  - 開發新功能或調整時，從 `main` 開立 `<作者>/<kebab-case-主題>` 分支（例如 `kepler/improve-gameplay-and-presentation`）。
  - 合併回 `main` 前先 `rebase` 到最新的 `main`（保持半線性歷史），再以 `--no-ff` 建立 Merge Commit 合入 `main`，合併後刪除功能分支。
  - 若為自己開發，可直接在本機 `rebase` + `--no-ff` 合回 `main` 並推送，不需經過 PR；協作或需要 Review 時再開立 PR。
  - **預設交付流程**：先在功能分支修改 → 開啟 Preview 讓使用者試玩確認 → 使用者確認後再 `rebase` + `--no-ff` 合回 `main` 並推送。
- **Commit 習慣**：
  - 格式為 `[Tag] <英文簡述>`（首字大寫方括號標籤 + 空格 + 簡潔英文描述）。
  - 常用標籤：`[Init]`、`[Feature]`、`[UI]`、`[Visual]`、`[Refactor]`、`[Update]`、`[Fix]`、`[Remove]`、`[Docs]`、`[Test]`、`[Tool]`。
  - Commit message 一律使用**英文**；PR 標題／內文可使用**繁體中文**（PR 標題可複合標籤，如 `[UI][Feature]`）。

## 指令

```bash
npm install
npm run dev        # Vite 開發伺服器（--host，手機可用同網段連進來）
npm run sim        # 模擬玩家 30 局；-- --runs 100 指定局數；-- --nobuild 不用道具的對照組
npm run build      # 輸出到 dist/
npm run preview    # 預覽 dist/
npm run zip        # build + 壓成 brain-shift-itch.zip
npm run itch       # build + butler push（需環境變數 ITCH_TARGET=帳號/遊戲:html5）
```

## 架構

```
index.html            頁面骨架（HUD、按鈕、開場／結算卡片）
src/
  main.js             進入點與主迴圈（打擊停頓、慢動作、加速都在這裡）
  config.js           ★ 所有數值（CFG）與共用小工具（idx、cellOf、clamp…）
  fx.js               Feel（手感開關）、FX（邏輯→表現的事件）、Input（移動輸入）
  grid.js             地圖：rock 廢墟、low 矮牆、cells 玩家放的設施；地圖生成
  physics.js          碰撞、視線、直線檢查、路徑拉直（lookAhead）、速度混合（steer）
  memory.js           屍群記憶、族群進化（evolve）、knowsTrap
  path.js             A*（二元堆積）
  game.js             把 src/game/*.js 的方法掛到同一個 Game 物件
  game/
    core.js           Game 的狀態欄位、reset、遊戲內計時器
    resources.js      材料箱、零件
    player.js         玩家移動、翻越加速、回血、記錄玩家習慣
    items.js          放道具（障礙前方、陷阱腳下、誘餌往前丟）
    spawner.js        生成、遊蕩殭屍、被發現、屍潮
    zombies.js        殭屍 AI（路徑成本、各類型移動、陷阱／誘餌互動）
    loop.js           撤離、每幀 update、進化觸發、勝負
    report.js         進化報告文字
  view.js             three.js 場景、模型、特效、鏡頭、霧
  ui.js               DOM：狀態列、訊息、報告、小地圖、箭頭、血條
  input.js            鍵盤、滑鼠、觸控虛擬搖桿
  style.css
sim/sim.mjs           模擬玩家（Node 直接跑邏輯層）
scripts/              zip-itch.mjs、push-itch.mjs
archive/              v1–v4 單檔舊版本，只供對照，不要改
docs/DESIGN.md        設計文件
```

## 一定要守的規則

1. **邏輯層不碰 DOM、不 import three**。`config / fx / grid / physics / memory / path / game/*` 必須能在 Node 直接跑，`sim/` 靠這個運作。邏輯要通知畫面，就呼叫 `FX.xxx()`（預設是空函式，`view.js` 的 `bindFX()` 會接上）。
2. **數值都放 `CFG`**，不要在邏輯裡寫死數字。新增數值時在旁邊寫一句註解說明用途。
3. **改完平衡或 AI，先跑 `npm run sim`**，再跑一次 `-- --nobuild`。看三件事：
   - 有沒有「超過 900 秒沒結束」的警告（代表卡死）。
   - 勝率、平均存活時間跟改之前比怎麼變。
   - 「用道具」不應該比「不用道具」差太多（詳見 DESIGN.md 已知問題 2）。
   模擬玩家很笨，數字只能做前後比較，不能當成真人難度。
4. **改完畫面或操作，要實際在瀏覽器看**：電腦（約 1280×760）和手機橫向（約 844×390，觸控）。直向觸控會顯示「請轉成橫向」，這是預期行為。
5. **發佈路徑必須是相對路徑**（`vite.config.js` 的 `base: './'`）。同一份 `dist/` 要能同時放在 itch.io 的 zip 和 GitHub Pages 的子路徑。不要引用外部 CDN，three 走 npm（固定 `0.128.0`，升版要整個重測 view.js）。
6. **更新文件**：改了規則、數值範圍或設計決定，同步改 `docs/DESIGN.md`（第 9 節的決定紀錄、第 10 節的已知問題）。

## 設計原則（做決定時用這些判斷）

- **破解型殭屍是「不同」，不是「更強」**：每一型都要有明確弱點。新增能力時，同時想好牠怕什麼。
- **進化要看得懂**：玩家做的事 → 哪一型變多，對應要直接。報告文字要短（每行一個重點、最多 4 行），不能擋畫面。
- **學習要感覺得到**：屍群學到的東西要讓場上所有殭屍立刻反應，並且有看得見的表現（例如頭上的標記）。但表現本身不能讓道具變得更強（例如發現陷阱時不可以停頓）。
- **不要有「站著不動」或「只靠走位」的最佳解**：玩家應該需要移動、用地形、用道具。
- **玩家不看畫面上方**：重要的即時資訊放在角色附近或場景裡。
- **手機是橫向、單手一邊**：左手搖桿、右手道具，不要加需要精準點選場景的操作。

## 容易踩的坑

- `Game` 是一個物件，方法分散在 `src/game/*.js` 用 `Object.assign` 掛上去。新增方法時放到對應的檔案；方法之間用 `this.xxx()` 呼叫。
- 座標有兩套：邏輯座標（格子單位，x 向右、y 向下）和 three 世界座標（`W2()` 轉換）。手機直向時鏡頭會轉 90°，報告裡的方位文字和鍵盤方向都有對應處理（搜尋 `portrait`）；現在觸控一律要求橫向，但電腦把視窗拉成直的仍會走這段。
- 殭屍的「模式」（`z.mode`）：`wander` 遊蕩、`chase` 追擊、`predict` 預判、`ambush` 埋伏／守零件、`demolish` 拆障礙。新增模式時要檢查 `loop.js` 裡「跟丟就回到遊蕩」的排除條件，否則可能被誤判成跟丟。
- `Grid.blocks(i, vault)`、`Grid.solid(x, y, vault)`、`clearLine(..., vault)` 的 `vault` 參數代表「這個實體能不能翻越」。玩家和跑酷殭屍是 `true`。視線檢查一律用 `sight()`（矮牆和障礙不擋視線）。
- 遊戲內的延遲要用 `setTimeoutGame`（跟著遊戲速度、重置時會清掉），不要用瀏覽器的 `setTimeout`。
- 陷阱的學習是即時判斷（`knowsTrap(z)` 用 `z.trapRoll` 跟 `Memory.trapAware` 比），不是出生時決定。
- 行內註解不要寫在「同一行後面還有程式碼」的位置；曾經因此把一整行的欄位初始值吃掉，造成所有殭屍共用同一個 id。

## 目前最值得做的事（細節見 DESIGN.md 第 10 節）

1. 關掉推開之後難度太高，需要真人試玩數據，再決定補償方式。
2. 讓障礙在真人手上明確有價值。
3. 遊蕩殭屍越積越多的上限。
4. 手機實機測試觸控手感與效能。
