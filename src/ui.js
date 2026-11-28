/* DOM 介面：標題畫面、如何遊玩、HUD、訊息、進化報告、小地圖、指引箭頭、血條＋材料條、結算、語言切換。 */
import { CFG, C, R, N, ix, iy, clamp, RADIO, TYPES } from './config.js';
import { Grid } from './grid.js';
import { Memory } from './memory.js';
import { Game, gameTimers } from './game.js';
import { View } from './view.js';
import { I18N, LANGS, t, guessLang } from './i18n.js';
import { ICONS } from './icons.js';
import { buildHowto, HOWTO_PAGES } from './howto.js';

const LS_LANG = 'bs-lang';
const store = {   // localStorage 可能被擋（無痕、iframe），讀寫都包起來
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } },
};
const ZCOL = { rusher: '#ff5a4e', pathfinder: '#f0c94a', breaker: '#b77cf0', vaulter: '#34d1c0' };
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ============================== UI ============================== */
export const UI = {
  speed: 1, mem: false, el: {}, tickT: 0, resetArm: 0, mmT: 0, hordeDir: 0, hordeFlash: 0, reportT: 0, lastParts: -1, lastMat: -1,
  init() {
    const $ = id => document.getElementById(id);
    for (const id of ['pbar', 'pfill', 'mfill', 'mseg', 'vTime', 'ticker', 'report', 'rTitle', 'rBody', 'builds', 'minimap', 'arPart', 'arRadio',
                      'evac', 'brainFill', 'brainStat', 'sParts', 'title', 'howto', 'result', 'btnStart', 'btnHow', 'btnLang', 'btnHowBack',
                      'btnAgain', 'btnMenu', 'resTitle', 'resTag', 'resStats', 'resComp', 'hwPages', 'hwTabs', 'hwDots', 'hwPrev', 'hwNext']) this.el[id] = $(id);
    const e = this.el;
    // 圖示：data-icon="clock" → 換成 SVG
    for (const i of document.querySelectorAll('[data-icon]')) i.innerHTML = ICONS[i.dataset.icon];
    // 零件：六格，每格是一種通訊器零件的圖示，撿到就亮起來
    e.sParts.innerHTML = Array.from({ length: CFG.PARTS.goal }, (_, k) => `<i class="slot" data-k="${k}">${ICONS['part' + (k % 6)]}</i>`).join('');
    // 材料條分格：每格＝一個道具
    const segs = Math.round(CFG.MAX_MATERIALS / CFG.ITEM_COST);
    e.mseg.innerHTML = '<i></i>'.repeat(Math.max(0, segs - 1));

    e.builds.addEventListener('pointerdown', ev => { const b = ev.target.closest('.bld'); if (b) { ev.preventDefault(); Game.drop(b.dataset.b); this.sync(); } });
    e.btnStart.addEventListener('click', () => this.start());
    // 如何遊玩：分頁（上方分頁籤、下方上一頁／下一頁；最後一頁的「下一頁」變成「開始遊戲」）
    buildHowto(e.hwPages, e.hwTabs, e.hwDots);
    e.btnHow.addEventListener('click', () => { this.howPage = 0; this.show('howto'); });
    e.btnHowBack.addEventListener('click', () => this.show('title'));
    e.hwTabs.addEventListener('click', ev => { const b = ev.target.closest('.hw-tab'); if (b) this.setHowPage(+b.dataset.k); });
    e.hwPrev.addEventListener('click', () => this.stepHow(-1));
    e.hwNext.addEventListener('click', () => this.stepHow(1));
    // 手機：左右滑動換頁
    let sx = null;
    e.hwPages.addEventListener('pointerdown', ev => { sx = ev.clientX; });
    e.hwPages.addEventListener('pointerup', ev => { if (sx !== null && Math.abs(ev.clientX - sx) > 50) this.stepHow(ev.clientX < sx ? 1 : -1); sx = null; });
    e.btnLang.addEventListener('click', () => this.setLang(LANGS[(LANGS.indexOf(I18N.lang) + 1) % LANGS.length]));
    e.btnAgain.addEventListener('click', () => this.restart(true));
    e.btnMenu.addEventListener('click', () => this.restart(false));

    this.setLang(store.get(LS_LANG) || guessLang(navigator.language));
    this.sizeMinimap();
    this.show('title');
  },

  /* ---------- 畫面切換：title／howto／result／null（遊戲中） ---------- */
  show(which) {
    for (const k of ['title', 'howto', 'result']) this.el[k].classList.toggle('hide', k !== which);
    document.body.classList.toggle('menu', !!which);       // 選單開著時藏 HUD、道具按鈕、搖桿
    this.screen = which;
    if (which === 'howto') this.setHowPage(this.howPage || 0);
  },
  /* ---------- 如何遊玩：換頁 ---------- */
  howPage: 0,
  setHowPage(k) {
    const e = this.el; this.howPage = clamp(k, 0, HOWTO_PAGES - 1);
    for (const g of [e.hwPages, e.hwTabs, e.hwDots]) for (const c of g.children) c.classList.toggle('on', +c.dataset.k === this.howPage);
    e.hwPrev.disabled = this.howPage === 0;
    const last = this.howPage === HOWTO_PAGES - 1;
    e.hwNext.textContent = t(last ? 'btn.start' : 'btn.next');
    e.hwNext.dataset.last = last ? '1' : '';
  },
  /** 下一頁／上一頁；最後一頁再按下一頁＝開始遊戲 */
  stepHow(d) {
    if (d > 0 && this.howPage === HOWTO_PAGES - 1) { this.show('title'); this.start(); return; }
    this.setHowPage(this.howPage + d);
  },
  /** 從標題進場：鏡頭從標題鏡位滑到遊玩鏡位；「再玩一次」直接切過去 */
  start() { const fromTitle = this.screen === 'title'; this.show(null); Game.begin(); if (fromTitle) View.startIntro(); else View.camSnap = true; },
  restart(play) {
    for (const o of View.zMap.values()) View.scene.remove(o.g);
    for (const c of View.corpses) View.scene.remove(c.o.g);
    View.zMap.clear(); View.corpses = []; gameTimers.length = 0;
    Game.reset(); View.buildRocks(); View.drawOverlay(); View.resetEvac && View.resetEvac(); this.hideReport();
    this.lastParts = -1; this.lastMat = -1;
    if (play) this.start(); else this.show('title');
    this.sync();
  },
  /** 連按兩次 R 才重新開始（避免誤觸） */
  pressReset() {
    if (Game.phase !== 'play') return;
    if (Date.now() - this.resetArm < 2500) { this.resetArm = 0; this.restart(true); }
    else { this.resetArm = Date.now(); this.msg(t('msg.reset')); }
  },

  /* ---------- 語言 ---------- */
  setLang(lang) {
    I18N.lang = LANGS.includes(lang) ? lang : 'en'; store.set(LS_LANG, I18N.lang);
    document.documentElement.lang = I18N.lang;
    for (const n of document.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll('[data-i18n-html]')) n.innerHTML = t(n.dataset.i18nHtml);   // 只有自己寫的翻譯字串，沒有外部輸入
    this.el.btnLang.textContent = t('btn.lang', { lang: t('lang.name') });
    if (this.screen === 'howto') this.setHowPage(this.howPage);
    if (Game.phase === 'over' && this.lastWin !== undefined) this.over(this.lastWin);
  },

  cycleSpeed() { this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1; this.msg(t('msg.speed', { n: this.speed })); },
  toggleMem() { this.mem = !this.mem; if (this.mem) { View.drawOverlay(); this.msg(t('msg.mem')); } },
  msg(m) { const tk = this.el.ticker; if (!tk) return; tk.textContent = m; tk.classList.remove('fade', 'alarm'); this.tickT = 2.4; },
  alarm(m) { const tk = this.el.ticker; if (!tk) return; tk.textContent = m; tk.classList.remove('fade'); tk.classList.add('alarm'); this.tickT = 4; },
  showReport(n, lines) {
    const e = this.el; e.rTitle.textContent = t('rep.title', { n }); e.rBody.textContent = '';
    for (const l of lines) { if (!l.t) continue; const li = document.createElement('li'); li.textContent = l.t; if (l.c) li.className = l.c; e.rBody.appendChild(li); }
    e.report.classList.remove('hide'); this.reportT = 5;
  },
  hideReport() { this.el.report.classList.add('hide'); this.reportT = 0; },
  /** 撿到材料：材料條閃一下（取代「+8 材料」的文字提示） */
  flashMat() { const b = this.el.pbar; b.classList.remove('got'); void b.offsetWidth; b.classList.add('got'); },

  /* ---------- 結算 ---------- */
  over(win) {
    this.lastWin = win;
    const e = this.el;
    e.result.className = 'screen ' + (win ? 'win' : 'lose');
    e.resTitle.textContent = t(win ? 'res.win' : 'res.lose');
    e.resTag.textContent = t(win ? 'res.winTag' : 'res.loseTag');
    const stats = [
      ['res.time', fmtTime(Game.time)],
      ['res.parts', Game.parts],
      ['res.evo', Memory.updates],
      ['res.items', Game.stats.items],
      ['res.escapes', Game.stats.escapes],
    ];
    e.resStats.innerHTML = stats.map(([k, v]) => `<div class="st"><b>${v}</b><small>${t(k)}</small></div>`).join('');
    // 最後的族群：放大的堆疊長條，各種類文字直接寫在對應區塊裡面
    const sh = Memory.share();
    e.resComp.innerHTML = TYPES.filter(ty => sh[ty] > 0)
      .map(ty => `<span style="flex:${sh[ty]};background:${ZCOL[ty]}" title="${t('z.' + ty)}">${t('z.' + ty)}</span>`).join('');
    this.show('result');
  },

  /* ---------- 小地圖 ---------- */
  sizeMinimap() {
    const mm = this.el.minimap; if (!mm) return;
    const port = window.innerHeight > window.innerWidth, sc = port || document.body.classList.contains('touch') ? 3 : window.innerHeight >= 900 ? 6 : 5;
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
    const cellTL = i => port ? map(ix(i), iy(i) + 1) : map(ix(i), iy(i));
    g.fillStyle = 'rgba(120,130,160,.55)';
    for (let i = 0; i < N; i++) if (Grid.rock[i]) { const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    g.fillStyle = 'rgba(190,170,140,.45)';
    for (let i = 0; i < N; i++) if (Grid.low[i]) { const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    for (let i = 0; i < N; i++) { const c = Grid.cells[i]; if (!c) continue; g.fillStyle = c.type === 'obstacle' ? '#e9a23b' : c.type === 'trap' ? '#a8713f' : '#f2cb52'; const [a, b] = cellTL(i); g.fillRect(a, b, sc, sc); }
    const dot = (x, y, r, col) => { const [a, b] = map(x, y); g.fillStyle = col; g.beginPath(); g.arc(a, b, r, 0, 6.283); g.fill(); };
    for (const s of Game.scraps) dot(s.x, s.y, 2, '#f2cb52');
    dot(RADIO.x, RADIO.y, 3.5, Game.evac === 'none' ? '#8a93a8' : '#6fdc8c');
    for (const z of Game.zombies) dot(z.x, z.y, 1.7, ZCOL[z.type]);
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
    const inside = !s.behind && s.x > m && s.x < w - m && s.y > 70 && s.y < h - 110;
    if (inside) { el.style.display = 'none'; return; }
    const cx = w / 2, cy = h / 2;
    let dx = s.x - cx, dy = s.y - cy; if (s.behind) { dx = -dx; dy = -dy; }
    const k = Math.min((w / 2 - m) / Math.abs(dx || 1e-3), (h / 2 - 90) / Math.abs(dy || 1e-3));
    el.style.display = 'block';
    el.style.transform = `translate(${cx + dx * k - 11}px, ${cy + dy * k - 11}px) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
  },
  tick(real) {
    const e = this.el, play = Game.phase === 'play';
    // 血條＋材料條貼在角色腳下
    if (play) { const s = View.toScreen(Game.player.x, Game.player.y, 0); e.pbar.style.display = 'block'; e.pbar.style.transform = `translate(${s.x}px, ${s.y + 14}px)`; }
    else e.pbar.style.display = 'none';
    if (this.tickT > 0) { this.tickT -= real; if (this.tickT <= 0) e.ticker.classList.add('fade'); }
    if (this.reportT > 0) { this.reportT -= real; if (this.reportT <= 0) this.hideReport(); }
    if (this.hordeFlash > 0) this.hordeFlash -= real;
    this.mmT -= real; if (this.mmT <= 0) { this.mmT = 0.1; this.drawMinimap(); }
    if (Game.part && play) this.placeArrow(e.arPart, Game.part.x, Game.part.y); else e.arPart.style.display = 'none';
    if ((Game.evac === 'ready' || Game.evac === 'pickup') && play) this.placeArrow(e.arRadio, RADIO.x, RADIO.y); else e.arRadio.style.display = 'none';
    if ((Game.evac === 'active' || Game.evac === 'pickup') && play) {
      const pick = Game.evac === 'pickup';
      e.evac.style.display = 'block'; e.evac.classList.toggle('out', pick);
      e.evac.textContent = pick ? t('evac.wait') : t('evac.count', { n: Math.ceil(Game.evacT) });
      const sm = document.createElement('small'); sm.textContent = t(pick ? 'evac.waitSub' : 'evac.countSub'); e.evac.appendChild(sm);
    } else e.evac.style.display = 'none';
    this.sync();
  },
  sync() {
    const e = this.el, P = Game.player; if (!e.vTime || !P) return;
    if (this.lastParts !== Game.parts) {
      this.lastParts = Game.parts;
      for (const s of e.sParts.children) s.classList.toggle('on', +s.dataset.k < Game.parts);
    }
    const m = Math.floor(Game.materials);
    if (this.lastMat !== m) {
      this.lastMat = m;
      e.mfill.style.width = (Math.min(1, m / CFG.MAX_MATERIALS) * 100) + '%';
      const poor = m < CFG.ITEM_COST;
      for (const b of e.builds.children) b.classList.toggle('poor', poor);
    }
    e.pfill.style.width = (P.hp / CFG.PLAYER.hp * 100) + '%';
    e.pbar.classList.toggle('low', P.hp <= 30);
    e.vTime.textContent = fmtTime(Game.time);
    const bp = Math.min(1, Game.learnPoints() / CFG.MEMORY.evolveAt);       // 屍腦：下一次進化的進度
    e.brainFill.style.width = (bp * 100) + '%'; e.brainStat.classList.toggle('full', bp >= 1);
  },
};
