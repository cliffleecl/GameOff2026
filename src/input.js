/* 輸入：電腦用鍵盤＋滑鼠點地面；觸控裝置用左半邊的浮動虛擬搖桿。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Input } from './fx.js';
import { Game } from './game.js';
import { View } from './view.js';
import { UI } from './ui.js';

/* ============================== 輸入 ============================== */
export const InputDOM = {
  keys: {}, down: false, lastT: 0,
  init() {
    const cv = document.getElementById('cv');
    const go = (x, y) => { const p = View.pick(x, y); if (p) Game.moveTo(p[0], p[1]); };
    // 觸控裝置：左半邊是浮動虛擬搖桿（按哪裡、搖桿就出現在哪裡）；電腦：點地面移動
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (touch) document.body.classList.add('touch');
    const stick = document.getElementById('stick'), knob = document.getElementById('knob'), RAD = 52;
    const rest = () => { stick.classList.add('idle'); stick.style.left = (90 + (parseFloat(getComputedStyle(document.body).paddingLeft) || 0)) + 'px'; stick.style.top = (window.innerHeight - 100) + 'px'; knob.style.transform = ''; };
    if (touch) { rest(); window.addEventListener('resize', () => { if (this.stickId === undefined) rest(); }); }
    this.stickId = undefined;
    const setStick = (cx, cy) => {
      let dx = cx - this.sx, dy = cy - this.sy; const d = Math.hypot(dx, dy);
      if (d > RAD) { dx *= RAD / d; dy *= RAD / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      let x = dx / RAD, y = dy / RAD;
      if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }                 // 死區
      if (Game.portrait) { const t = x; x = y; y = -t; }             // 直向時畫面轉了 90°
      Input.kx = x; Input.ky = y;
    };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (touch) {
        if (this.stickId !== undefined || e.clientX > window.innerWidth * 0.55) return;   // 右半邊不當搖桿
        this.stickId = e.pointerId; this.sx = e.clientX; this.sy = e.clientY;
        stick.classList.remove('idle'); stick.style.left = this.sx + 'px'; stick.style.top = this.sy + 'px'; setStick(e.clientX, e.clientY);
        return;
      }
      this.down = true; this.lastT = performance.now(); go(e.clientX, e.clientY);
    });
    cv.addEventListener('pointermove', e => {
      if (touch) { if (e.pointerId === this.stickId) setStick(e.clientX, e.clientY); return; }
      if (!this.down) return;
      const now = performance.now(); if (now - this.lastT < 110) return;
      this.lastT = now; go(e.clientX, e.clientY);
    });
    const release = e => {
      this.down = false;
      if (touch && e.pointerId === this.stickId) { this.stickId = undefined; Input.kx = 0; Input.ky = 0; rest(); }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    const map = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
    // 直向時畫面轉了 90°，鍵盤方向也要跟著轉，按「上」才會往螢幕上方走
    const upd = () => {
      let x = 0, y = 0; for (const k in this.keys) if (this.keys[k] && map[k]) { x += map[k][0]; y += map[k][1]; }
      if (Game.portrait) { const t = x; x = y; y = -t; }
      Input.kx = x; Input.ky = y;
    };
    window.addEventListener('keydown', e => {
      if (map[e.code]) { this.keys[e.code] = true; upd(); e.preventDefault(); return; }
      // 選單畫面：Enter／空白鍵＝主要按鈕，Esc＝返回
      if (UI.screen) {
        const ok = e.code === 'Enter' || e.code === 'Space';
        if (UI.screen === 'title' && ok) UI.start();
        else if (UI.screen === 'howto' && (ok || e.code === 'Escape')) UI.show('title');
        else if (UI.screen === 'result' && ok) UI.restart(true);
        if (ok) e.preventDefault();
        return;
      }
      // 遊戲中：1 2 3 道具；F 速度、H 記憶圖、R 連按兩次重新開始（畫面上沒有按鈕，只有快捷鍵）
      const b = { Digit1: 'obstacle', Digit2: 'trap', Digit3: 'bait' }[e.code];
      if (b) { Game.drop(b); UI.sync(); }
      else if (e.code === 'KeyF') UI.cycleSpeed();
      else if (e.code === 'KeyH') UI.toggleMem();
      else if (e.code === 'KeyR') UI.pressReset();
    });
    window.addEventListener('keyup', e => { if (map[e.code]) { this.keys[e.code] = false; upd(); } });
    window.addEventListener('blur', () => { this.keys = {}; upd(); });
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => e.preventDefault());
  },
};
