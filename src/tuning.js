/* 調參數（瀏覽器端）：開局前套用存在這台瀏覽器的覆寫值；網址加 ?tune 或按 ` 鍵打開面板。
 * 面板本體在 tune-panel.js，第一次打開才載入（一般玩家不會下載到）。
 * 存的值只在這台瀏覽器有效；要變成正式數值，用面板的「複製修改」貼給開發者，或自己改進 src/config.js。 */
import { CFG, applyCfg, cfgDiff } from './config.js';

export const TUNE_KEY = 'bs-tune';
const read = () => { try { return JSON.parse(localStorage.getItem(TUNE_KEY) || '{}'); } catch { return {}; } };
export const saveTune = () => {
  const d = cfgDiff();
  try { Object.keys(d).length ? localStorage.setItem(TUNE_KEY, JSON.stringify(d)) : localStorage.removeItem(TUNE_KEY); } catch { /* 存不了就只在這次有效 */ }
  updateBadge();
  return d;
};

/** 右下角的小標籤：提醒「現在的數值不是預設值」，避免忘記自己改過 */
function updateBadge() {
  let b = document.getElementById('tuneBadge');
  const n = Object.keys(cfgDiff()).length;
  if (!n) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('button'); b.id = 'tuneBadge';
    b.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:30;min-height:0;padding:3px 8px;font-size:11px;border-radius:8px;background:#5a2a8a;color:#fff;border:0;opacity:.85';
    b.addEventListener('click', openPanel);
    document.body.appendChild(b);
  }
  b.textContent = '⚙ 已套用調整參數';
}

let panel = null;
export async function openPanel() {
  if (panel) { panel.toggle(); return; }
  const m = await import('./tune-panel.js');
  panel = m.createPanel({ onChange: saveTune });
}

export function initTuning() {
  applyCfg(read());
  updateBadge();
  if (new URLSearchParams(location.search).has('tune')) openPanel();
  window.addEventListener('keydown', e => { if (e.code === 'Backquote') openPanel(); });
}
export { CFG };
