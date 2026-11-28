/* 調參數面板（lil-gui）。所有 CFG 數值依群組列出，改了馬上生效。
 * 大部分數值是每幀即時讀取的（速度、傷害、偵測距離…）；開局才用到的（材料箱數量、遊蕩殭屍數、地圖生成）要按「重開一局」。 */
import GUI from 'lil-gui';
import { CFG, CFG_DEFAULTS, CFG_LOCKED, cfgDiff, resetCfg } from './config.js';
import { UI } from './ui.js';

const LABEL = {
  _: '一般', PLAYER: '玩家', PARTS: '零件', SCRAP: '材料箱', SPAWN: '殭屍生成', HORDE: '屍潮', EVAC: '撤離', WANDER: '遊蕩殭屍',
  MAP: '地圖生成（重開一局生效）', BUILD: '道具', ZOMBIE: '殭屍各型', MEMORY: '學習與進化',
  obstacle: '障礙', trap: '陷阱', bait: '誘餌', rusher: '盲衝', pathfinder: '繞路', breaker: '拆除', vaulter: '跑酷', evo: '族群進化', start: '開場權重', max: '權重上限',
};

/** 依預設值的大小猜一個合理的拖拉範圍 */
function range(def) {
  // 5 以上的整數多半是數量（血量、個數、次數）→ 一格 1；小的整數（例如速度 3）仍要能調小數
  if (Number.isInteger(def) && def >= 5) return [0, def * 3, 1];
  if (def >= 0 && def <= 1) return [0, 1, 0.01];
  return [0, Math.max(1, def * 3), def < 10 ? 0.05 : 0.5];
}

function addAll(gui, obj, base, onChange) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') { const f = gui.addFolder(LABEL[k] || k); f.close(); addAll(f, v, base[k], onChange); continue; }
    if (typeof v === 'boolean') gui.add(obj, k).onChange(onChange);
    else if (typeof v === 'number') { const [a, b, s] = range(base[k]); gui.add(obj, k, a, b, s).onChange(onChange); }
  }
}

export function createPanel({ onChange }) {
  const gui = new GUI({ title: '調參數（改了馬上生效）', width: 320 });
  gui.domElement.style.zIndex = 40;
  const actions = {
    restart: () => UI.restart(true),
    copy: async () => {
      const txt = JSON.stringify(cfgDiff(), null, 2);
      try { await navigator.clipboard.writeText(txt); UI.msg('已複製修改過的數值（JSON）'); }
      catch { window.prompt('複製下面的 JSON：', txt); }
    },
    reset: () => { resetCfg(); gui.controllersRecursive().forEach(c => c.updateDisplay()); onChange(); UI.msg('已還原成預設數值'); },
  };
  gui.add(actions, 'restart').name('▶ 重開一局（套用開局數值）');
  gui.add(actions, 'copy').name('📋 複製修改（JSON）');
  gui.add(actions, 'reset').name('↺ 全部還原');
  // 最上層的單一數值（起始材料、道具價格…）放在「一般」
  const top = gui.addFolder(LABEL._);
  for (const k of Object.keys(CFG)) if (typeof CFG[k] !== 'object' && !CFG_LOCKED.includes(k)) { const [a, b, s] = range(CFG_DEFAULTS[k]); top.add(CFG, k, a, b, s).onChange(onChange); }
  for (const k of Object.keys(CFG)) if (typeof CFG[k] === 'object') { const f = gui.addFolder(LABEL[k] || k); f.close(); addAll(f, CFG[k], CFG_DEFAULTS[k], onChange); }
  // 面板上的操作不要被遊戲當成移動或快捷鍵
  for (const ev of ['pointerdown', 'keydown']) gui.domElement.addEventListener(ev, e => e.stopPropagation());
  return { toggle: () => gui.show(gui._hidden) };
}
