/* 用 itch.io 官方的 butler 直接上傳 dist/。
 * 先安裝 butler 並登入（butler login），再設定目標：
 *   Windows PowerShell： $env:ITCH_TARGET="你的帳號/brain-shift:html5"; npm run itch
 *   macOS / Linux：      ITCH_TARGET=你的帳號/brain-shift:html5 npm run itch */
import { spawnSync } from 'node:child_process';

const target = process.env.ITCH_TARGET;
if (!target) { console.error('請先設定環境變數 ITCH_TARGET，例如：你的帳號/brain-shift:html5'); process.exit(1); }
const r = spawnSync('butler', ['push', 'dist', target], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
