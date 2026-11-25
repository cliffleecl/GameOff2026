/* DOM 介面：狀態列、訊息、進化報告、小地圖、指引箭頭、血條、開場與結算。 */
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Grid } from './grid.js';
import { Memory } from './memory.js';
import { Game, gameTimers } from './game.js';
import { View } from './view.js';

/* ============================== UI ============================== */
export const UI = {
  speed: 1, mem: false, el: {}, tickT: 0, resetArm: 0, mmT: 0, hordeDir: 0, hordeFlash: 0, reportT: 0,
  init() {
    const $ = id => document.getElementById(id);
    for (const id of ['vParts', 'vMat', 'pbar', 'pfill', 'vTime', 'ticker', 'report', 'rTitle', 'rBody', 'overlay', 'ocard', 'oTitle', 'oTag', 'oBody', 'obtn',
                      'btnSpeed', 'btnMem', 'btnReset', 'builds', 'minimap', 'arPart', 'arRadio', 'evac', 'brainFill', 'brainStat']) this.el[id] = $(id);
    const e = this.el;
    e.builds.addEventListener('pointerdown', ev => { const b = ev.target.closest('.bld'); if (b) { ev.preventDefault(); Game.drop(b.dataset.b); this.sync(); } });
    e.btnSpeed.addEventListener('click', () => this.cycleSpeed());
    e.btnMem.addEventListener('click', () => this.toggleMem());
    e.btnReset.addEventListener('click', () => {
      if (Date.now() - this.resetArm < 2500) { this.resetArm = 0; e.btnReset.classList.remove('arm'); e.btnReset.textContent = '重置'; this.restart(true); }
      else { this.resetArm = Date.now(); e.btnReset.classList.add('arm'); e.btnReset.textContent = '再按一次';
        setTimeout(() => { if (Date.now() - this.resetArm >= 2400) { e.btnReset.classList.remove('arm'); e.btnReset.textContent = '重置'; } }, 2500); }
    });
    e.obtn.addEventListener('click', () => { if (Game.phase === 'over') this.restart(false); e.overlay.classList.add('hide'); Game.begin(); });
    this.sizeMinimap();
  },
  restart(play) {
    for (const o of View.zMap.values()) View.scene.remove(o.g);
    for (const c of View.corpses) View.scene.remove(c.o.g);
    View.zMap.clear(); View.corpses = []; gameTimers.length = 0;
    Game.reset(); View.buildRocks(); View.drawOverlay(); this.hideReport();
    if (play) { Game.begin(); this.el.overlay.classList.add('hide'); }
    this.sync();
  },
  cycleSpeed() { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.el.btnSpeed.textContent = `速度 ${this.speed}x`; this.el.btnSpeed.classList.toggle('on', this.speed > 1); },
  toggleMem() { this.mem = !this.mem; this.el.btnMem.classList.toggle('on', this.mem); if (this.mem) { View.drawOverlay(); this.msg('紫：你常去的地方　橘：殭屍被障礙卡住的地方'); } },
  msg(m) { const t = this.el.ticker; if (!t) return; t.textContent = m; t.classList.remove('fade', 'alarm'); this.tickT = 2.4; },
  alarm(m) { const t = this.el.ticker; if (!t) return; t.textContent = m; t.classList.remove('fade'); t.classList.add('alarm'); this.tickT = 4; },
  showReport(n, lines) {
    const e = this.el; e.rTitle.textContent = `屍群進化 #${n}`; e.rBody.textContent = '';
    for (const l of lines) { if (!l.t) continue; const li = document.createElement('li'); li.textContent = l.t; if (l.c) li.className = l.c; e.rBody.appendChild(li); }
    e.report.classList.remove('hide'); this.reportT = 5;
  },
  hideReport() { this.el.report.classList.add('hide'); this.reportT = 0; },
  over(win) {
    const e = this.el, m = Math.floor(Game.time / 60), s = Math.floor(Game.time % 60);
    e.ocard.className = win ? 'win' : 'lose';
    e.oTitle.textContent = win ? '救援到了' : '你被抓到了';
    e.oTag.textContent = win ? `撐了 ${m}:${String(s).padStart(2, '0')}，成功撤離。` : `撐了 ${m}:${String(s).padStart(2, '0')}，找到 ${Game.parts}/${CFG.PARTS.goal} 個零件。`;
    e.oBody.textContent = '';
    const p = document.createElement('p');
    p.textContent = (win ? '屍群進化了 ' + Memory.updates + ' 次，還是沒堵到你。' : '屍群進化了 ' + Memory.updates + ' 次。') + ' 最後的族群：' + Game.compositionLine();
    e.oBody.appendChild(p);
    e.obtn.textContent = '再玩一次';
    e.overlay.classList.remove('hide');
  },
  sizeMinimap() {
    const mm = this.el.minimap; if (!mm) return;
    const port = window.innerHeight > window.innerWidth, sc = port || document.body.classList.contains('touch') ? 3 : 4;
    const w = (port ? R : C) * sc, h = (port ? C : R) * sc, dpr = Math.min(window.devicePixelRatio || 1, 2);
    mm.width = w * dpr; mm.height = h * dpr; mm.style.width = w + 'px'; mm.style.height = h + 'px';
    this.mmScale = sc; this.mmDpr = dpr; this.mmPort = port;
  },
  /** 小地圖：方向跟螢幕一致（直向時也轉 90°） */
  drawMinimap() {
    const mm = this.el.minimap, g = mm.getContext('2d'), sc = this.mmScale, port = this.mmPort;
    g.setTransform(this.mmDpr, 0, 0, this.mmDpr, 0, 0);
    const W = (port ? R : C) * sc, H = (port ? C : R) * sc;
    g.clearRect(0, 0, W, H);
    const map = (x, y) => port ? [(R - y) * sc, x * sc] : [x * sc, y * sc];
    const cellTL = i => port ? map(ix(i), iy(i) + 1) : map(ix(i), iy(i));     // 格子在小地圖上的左上角
    g.fillStyle = 'rgba(120,130,160,.55)';
    for (let i = 0; i < N; i++) if (Grid.rock[i]) { const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    g.fillStyle = 'rgba(190,170,140,.45)';
    for (let i = 0; i < N; i++) if (Grid.low[i]) { const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    for (let i = 0; i < N; i++) { const c = Grid.cells[i]; if (!c) continue; g.fillStyle = c.type === 'obstacle' ? '#e9a23b' : c.type === 'trap' ? '#a8713f' : '#f2cb52'; const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    const dot = (x, y, r, col) => { const [a, b] = map(x, y); g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, 6.283); g.fill(); };
    for (const s of Game.scraps) dot(s.x, s.y, 2, '#f2cb52');
    dot(RADIO.x, RADIO.y, 3.5, Game.evac === 'none' ? '#8a93a8' : '#6fdc8c');
    const zc = { rusher: '#ff5a4e', pathfinder: '#f0c94a', breaker: '#b77cf0', vaulter: '#34d1c0' };
    for (const z of Game.zombies) dot(z.x, z.y, 1.7, zc[z.type]);
    if (Game.part) dot(Game.part.x, Game.part.y, 3.5 + Math.sin(performance.now() / 150), '#5fe0ff');
    dot(Game.player.x, Game.player.y, 3, '#ffffff');
    if (this.hordeFlash > 0 && Math.floor(performance.now() / 250) % 2 === 0) {       // 屍潮方向：小地圖邊緣閃紅
      const P = Game.player, [a, b] = map(P.x + Math.cos(this.hordeDir) * 14, P.y + Math.sin(this.hordeDir) * 14);
      g.strokeStyle = '#ff3b30'; g.lineWidth = 3; g.beginPath(); g.arc(clamp(a, 4, W - 4), clamp(b, 4, H - 4), 6, 0, 6.283); g.stroke();
    }
  },
  /** 指引箭頭：目標在畫面外時，貼著畫面邊緣指過去 */
  placeArrow(el, x, y) {
    const s = View.toScreen(x, y), w = window.innerWidth, h = window.innerHeight, m = 40;
    const inside = !s.behind && s.x > m && s.x < w - m && s.y > 90 && s.y < h - 150;
    if (inside) { el.style.display = 'none'; return; }
    const cx = w / 2, cy = h / 2;
    let dx = s.x - cx, dy = s.y - cy; if (s.behind) { dx = -dx; dy = -dy; }
    const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-3), (h / 2 - 120) / Math.abs(dy || 1e-3));
    el.style.display = 'block';
    el.style.transform = `translate(${cx + dx * k - 11}px, ${cy + dy * k - 11}px) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
  },
  tick(real) {
    const e = this.el;
    // 血條貼在角色腳下
    if (Game.phase === 'play') { const s = View.toScreen(Game.player.x, Game.player.y, 0); e.pbar.style.display = 'block'; e.pbar.style.transform = `translate(${s.x}px, ${s.y + 14}px)`; }
    else e.pbar.style.display = 'none';
    if (this.tickT > 0) { this.tickT -= real; if (this.tickT <= 0) e.ticker.classList.add('fade'); }
    if (this.reportT > 0) { this.reportT -= real; if (this.reportT <= 0) this.hideReport(); }
    if (this.hordeFlash > 0) this.hordeFlash -= real;
    this.mmT -= real; if (this.mmT <= 0) { this.mmT = 0.1; this.drawMinimap(); }
    if (Game.part && Game.phase === 'play') this.placeArrow(e.arPart, Game.part.x, Game.part.y); else e.arPart.style.display = 'none';
    if ((Game.evac === 'ready' || Game.evac === 'pickup') && Game.phase === 'play') this.placeArrow(e.arRadio, RADIO.x, RADIO.y); else e.arRadio.style.display = 'none';
    if ((Game.evac === 'active' || Game.evac === 'pickup') && Game.phase === 'play') {
      const pick = Game.evac === 'pickup';
      e.evac.style.display = 'block'; e.evac.classList.toggle('out', pick);
      e.evac.textContent = pick ? '直升機在等你！' : `救援 ${Math.ceil(Game.evacT)} 秒後抵達`;
      const sm = document.createElement('small'); sm.textContent = pick ? '跟著綠色箭頭回到無線電' : '活下去，去哪都行'; e.evac.appendChild(sm);
    } else e.evac.style.display = 'none';
    this.sync();
  },
  sync() {
    const e = this.el, P = Game.player; if (!e.vMat || !P) return;
    e.vParts.textContent = `${Game.parts}/${CFG.PARTS.goal}`;
    const m = Math.floor(Game.materials);
    if (e.vMat.textContent !== String(m)) {
      e.vMat.textContent = String(m);
      for (const b of e.builds.children) {
        const c = Game.costOf(b.dataset.b);
        b.classList.toggle('poor', m < c);
        const sm = b.querySelector('small'); if (sm.textContent !== c + ' 材料') sm.textContent = c + ' 材料';
      }
    }
    e.pfill.style.width = (P.hp / CFG.PLAYER.hp * 100) + '%';
    e.pbar.classList.toggle('low', P.hp <= 30); e.pbar.classList.toggle('full', P.hp >= CFG.PLAYER.hp);
    e.vTime.textContent = `${Math.floor(Game.time / 60)}:${String(Math.floor(Game.time % 60)).padStart(2, '0')}`;
    const bp = Math.min(1, Game.learnPoints() / CFG.MEMORY.evolveAt);       // 屍腦：下一次進化的進度
    e.brainFill.style.width = (bp * 100) + '%'; e.brainStat.classList.toggle('full', bp >= 1);
  },
};
