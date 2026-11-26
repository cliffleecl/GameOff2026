/* 進入點：初始化各模組，跑主迴圈。 */
import './style.css';
import { Game } from './game.js';
import { View } from './view.js';
import { UI } from './ui.js';
import { InputDOM } from './input.js';
import { initTuning } from './tuning.js';

function boot() {
  initTuning();   // 先套用調過的參數（?tune 面板存的），再開局
  Game.reset();
  UI.init(); View.init(); View.bindFX(); InputDOM.init();
  View.buildRocks(); View.drawOverlay(); UI.sync();
  let last = performance.now();
  (function frame(now) {
    const real = Math.min(0.05, (now - last) / 1000); last = now;   // 限制 dt，切回分頁時不會暴衝
    let dt = real;
    if (Game.hitstop > 0) { Game.hitstop -= real; dt = 0; }          // 打擊停頓
    else if (Game.slowT > 0) { Game.slowT -= real; dt *= 0.3; }      // 慢動作
    for (let k = 0; k < UI.speed && dt > 0; k++) Game.update(dt);    // 加速 = 多跑幾次相同步長
    View.sync(dt * UI.speed, real);
    UI.tick(real);
    requestAnimationFrame(frame);
  })(last);
}
boot();

// 方便在瀏覽器主控台除錯：window.BS.Game、window.BS.Memory …
import { CFG } from './config.js';
import { Grid } from './grid.js';
import { Memory } from './memory.js';
import { I18N } from './i18n.js';
window.BS = { CFG, Game, Grid, Memory, View, UI, I18N };
