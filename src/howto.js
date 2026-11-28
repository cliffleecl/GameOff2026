/* 「如何遊玩」：全畫面、分成幾個段落（一頁一個重點），每頁一張示意圖＋短文字。
 * 圖都是內嵌 SVG（不用外部檔案）；文字走 i18n（data-i18n／data-i18n-html，切語言時 ui.js 會更新）。 */
import { ICONS } from './icons.js';

/* ---------- 顏色（跟遊戲裡一致） ---------- */
const COL = {
  skin: '#93ad6c', player: '#e9773b', jeans: '#3c4f7a', sand: '#b39a6c', sandDark: '#8a744c', ground: '#2a2d3b',
  rusher: '#d9483f', pathfinder: '#f0c94a', breaker: '#9b62d9', vaulter: '#34d1c0', part: '#5fe0ff', gold: '#f2cb52',
  stripe: '#e9a23b', dark: '#3a3f52', mark: '#ffd34d', alert: '#ff3b30', brain: '#ef8fab', meat: '#b8452f', bone: '#f1e9d6',
};

/* ---------- 小零件 ---------- */
const svg = (body, vb = '0 0 320 200') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** 內嵌一個介面圖示（24×24 的 SVG）到 (x, y)，大小 s */
const icon = (name, x, y, s, color) => `<g transform="translate(${x} ${y}) scale(${s / 24})" color="${color}"><g fill="none" stroke="currentColor" stroke-width="2">${ICONS[name].replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g></g>`;
const ground = (y = 170, x0 = 0, x1 = 320) => `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${200 - y}" fill="${COL.ground}"/><path d="M${x0} ${y}H${x1}" stroke="#454a5e" stroke-width="2"/>`;
const arrow = (x1, y1, x2, y2, c = '#a3a8bb') => {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 8, l = [x2 - h * Math.cos(a - 0.5), y2 - h * Math.sin(a - 0.5)], r = [x2 - h * Math.cos(a + 0.5), y2 - h * Math.sin(a + 0.5)];
  return `<path d="M${x1} ${y1}L${x2} ${y2}M${l[0]} ${l[1]}L${x2} ${y2}L${r[0]} ${r[1]}" stroke="${c}" stroke-width="3" fill="none"/>`;
};
/**
 * 側面的小人：腳底在 (x, y)，面向右（flip = 往左）。
 * kind：player／rusher／pathfinder／breaker／vaulter，外型跟遊戲裡的輪廓一樣（駝背、兜帽背包、安全帽鐵鎚、瘦長壓低）。
 */
function figure(kind, x, y, { s = 1, flip = false, run = 0, air = false } = {}) {
  const isP = kind === 'player', shirt = isP ? COL.player : COL[kind], skin = isP ? '#e8c39e' : COL.skin;
  const big = kind === 'breaker' ? 1.25 : kind === 'vaulter' ? 0.85 : 1;
  const lean = kind === 'rusher' ? 18 : kind === 'vaulter' ? 24 : isP ? 8 : kind === 'pathfinder' ? 6 : 4;
  const leg = air ? `<path d="M-4 -26L-12 -16L-6 -8M4 -26L10 -12L18 -14" stroke="${COL.jeans}" stroke-width="6" fill="none"/>`
    : `<path d="M-3 -26L${-6 - run * 6} 0M3 -26L${6 + run * 6} 0" stroke="${COL.jeans}" stroke-width="6" fill="none"/>`;
  let extra = '', arms;
  if (isP) arms = `<path d="M2 -46L14 -36L20 -42M-2 -46L-12 -34" stroke="${shirt}" stroke-width="5" fill="none"/>`;
  else arms = `<path d="M2 -46L24 -42M-2 -46L20 -38" stroke="${skin}" stroke-width="5" fill="none"/>`;      // 殭屍：雙手往前伸
  if (kind === 'pathfinder') extra = `<rect x="-16" y="-54" width="10" height="20" rx="3" fill="#6b5a3a"/><path d="M-8 -66a10 10 0 0 1 18 2" stroke="${shirt}" stroke-width="5" fill="none"/>`;
  if (kind === 'breaker') { extra = `<path d="M-10 -68a11 9 0 0 1 22 0z" fill="#e8e8e8"/>`; arms = `<path d="M2 -46L16 -58M-2 -46L12 -56" stroke="${skin}" stroke-width="6" fill="none"/><path d="M14 -58L6 -80" stroke="#8a6a44" stroke-width="4"/><rect x="-2" y="-88" width="18" height="10" rx="2" fill="#9aa0ae"/>`; }
  if (kind === 'vaulter') extra = `<path d="M-8 -64H10" stroke="${COL.alert}" stroke-width="3"/>`;
  if (isP) extra = `<path d="M-8 -66a9 9 0 0 1 16 0" stroke="${shirt}" stroke-width="5" fill="none"/>`;
  const eyes = isP ? '' : `<circle cx="6" cy="-62" r="2" fill="#bff6ff"/>`;
  return `<g transform="translate(${x} ${y}) scale(${(flip ? -1 : 1) * s * big} ${s * big})">${leg}<g transform="translate(0 -26) rotate(${lean}) translate(0 26)">
    <rect x="-8" y="-50" width="16" height="26" rx="5" fill="${shirt}"/>${arms}<circle cx="1" cy="-60" r="9" fill="${skin}"/>${eyes}${extra}</g></g>`;
}
const sandbags = (x, y, w = 40, rows = 2) => {
  let o = '';
  for (let r = 0; r < rows; r++) for (let k = 0; k < Math.round(w / 20) - (r % 2); k++) o += `<rect x="${x + k * 20 + (r % 2) * 10}" y="${y - (r + 1) * 12}" width="20" height="12" rx="5" fill="${r % 2 ? COL.sand : COL.sandDark}" stroke="#5b4b30" stroke-width="1.5"/>`;
  return o;
};
const barrier = (x, y, w = 44) => `<rect x="${x}" y="${y - 30}" width="${w}" height="12" fill="${COL.stripe}"/>${[0, 1, 2, 3].map(k => `<path d="M${x + 4 + k * 11} ${y - 18}l8 -12" stroke="${COL.dark}" stroke-width="4"/>`).join('')}<path d="M${x + 5} ${y - 18}V${y}M${x + w - 5} ${y - 18}V${y}" stroke="${COL.dark}" stroke-width="4"/>`;
const trap = (x, y) => `<ellipse cx="${x}" cy="${y - 3}" rx="18" ry="5" fill="#5a3a1f"/><path d="M${x - 16} ${y - 4}l4 -9 4 8 4 -9 4 8 4 -9 4 8 4 -9 4 9" stroke="#c9cdd8" stroke-width="2" fill="none"/>`;
const meat = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-8" rx="12" ry="8" fill="${COL.meat}"/><circle cx="3" cy="-11" r="3.5" fill="#e9a48c"/><path d="M10 -8h12" stroke="${COL.bone}" stroke-width="4"/><circle cx="23" cy="-10" r="3" fill="${COL.bone}"/><circle cx="23" cy="-6" r="3" fill="${COL.bone}"/></g>`;
const speed = (x, y, n = 4) => Array.from({ length: n }, (_, k) => `<path d="M${x - 6 - k * 3} ${y - 50 + k * 13}h${-22 - (k % 2) * 14}" stroke="#fff1d6" stroke-width="2.5" opacity="${0.9 - k * 0.12}"/>`).join('');
const dust = (x, y) => [[-14, -4, 5], [-6, -7, 6], [6, -6, 5], [14, -3, 4]].map(([dx, dy, r]) => `<circle cx="${x + dx}" cy="${y + dy}" r="${r}" fill="#8f8678" opacity=".7"/>`).join('');
const mark = (x, y, c = COL.mark) => `<path d="M${x - 6} ${y - 10}h12l-6 10z" fill="${c}"/>`;
const stars = (x, y) => `<g fill="${COL.mark}">${[[-10, 0], [0, -6], [10, 0]].map(([dx, dy]) => `<path transform="translate(${x + dx} ${y + dy})" d="M0 -4L1 -1L4 0L1 1L0 4L-1 1L-4 0L-1 -1z"/>`).join('')}</g>`;
const radio = (x, y) => `<rect x="${x - 22}" y="${y - 22}" width="44" height="22" rx="3" fill="#45506b"/><rect x="${x - 16}" y="${y - 16}" width="22" height="4" fill="#6fdc8c"/><path d="M${x + 10} ${y - 22}V${y - 78}" stroke="#b7bccb" stroke-width="3"/><circle cx="${x + 10}" cy="${y - 80}" r="4" fill="#ff4040"/>
  <g transform="translate(${x - 44} ${y})"><path d="M-10 0l20 -6M-10 -6l20 6" stroke="#4a3222" stroke-width="4"/><path d="M-8 -4q8 -26 16 0z" fill="#ff7a28"/><path d="M-4 -4q4 -14 8 0z" fill="#ffe27a"/></g>`;
const heli = (x, y) => `<g transform="translate(${x} ${y})"><ellipse cx="0" cy="-16" rx="22" ry="12" fill="#5d6a4a"/><path d="M18 -18h26" stroke="#5d6a4a" stroke-width="5"/><path d="M-30 -30h60" stroke="#c9cdd8" stroke-width="3"/><path d="M0 -28v-2" stroke="#c9cdd8" stroke-width="3"/><path d="M-14 -2h28" stroke="#9aa0ae" stroke-width="3"/><ellipse cx="-8" cy="-18" rx="8" ry="6" fill="#bfe6ff" opacity=".8"/></g>`;
const step = (x, y, n) => `<circle cx="${x}" cy="${y}" r="11" fill="#171a28" stroke="#34d1c0" stroke-width="2"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="#34d1c0" font-family="sans-serif">${n}</text>`;

/* ---------- 每一頁的圖 ---------- */
const ART = {
  // 1. 目標：找零件 → 回無線電呼叫 → 撐 30 秒 → 上直升機
  goal: () => svg(`${ground(170)}
    ${[0, 1, 2, 3, 4, 5].map(k => `<rect x="${14 + (k % 3) * 28}" y="${52 + (k / 3 | 0) * 30}" width="24" height="24" rx="6" fill="#171a28" stroke="#2c3350"/>${icon('part' + k, 17 + (k % 3) * 28, 55 + (k / 3 | 0) * 30, 18, COL.part)}`).join('')}
    ${arrow(100, 82, 128, 82)}${radio(166, 170)}
    ${arrow(208, 82, 232, 82)}${icon('clock', 236, 64, 30, '#ece6d8')}
    ${heli(286, 150)}${arrow(266, 82, 272, 104)}
    ${step(46, 30, 1)}${step(166, 30, 2)}${step(251, 30, 3)}`),
  // 2. 你沒辦法打：翻過矮牆，落地加速；殭屍被擋在牆後
  run: () => svg(`${ground(170)}${sandbags(120, 170, 60, 3)}
    ${figure('rusher', 92, 170, { s: 1.05, run: 0.3 })}${mark(98, 92)}
    <path d="M150 128q30 -60 70 -30" stroke="#fff" stroke-width="2" stroke-dasharray="4 6" fill="none" opacity=".5"/>
    ${figure('player', 250, 170, { s: 1.05, run: 1 })}${speed(238, 170, 4)}${dust(232, 170)}
    ${figure('player', 150, 128, { s: 0.75, air: true }).replace('<g ', '<g opacity=".45" ')}`),
  // 3. 道具：障礙在前方、陷阱在腳下、誘餌往前丟
  items: () => svg(`${ground(170)}
    <path d="M106 20V190M214 20V190" stroke="#2c3350" stroke-width="2"/>
    ${figure('player', 22, 170, { s: 0.8 })}${barrier(44, 170, 30)}${figure('rusher', 92, 170, { s: 0.8, flip: true })}${mark(86, 104)}
    ${icon('obstacle', 40, 18, 26, COL.gold)}
    ${trap(140, 172)}${figure('pathfinder', 140, 170, { s: 0.8, flip: false })}${stars(142, 100)}${figure('player', 196, 170, { s: 0.8, run: 1 })}
    ${icon('trap', 148, 18, 26, COL.gold)}
    ${figure('player', 228, 170, { s: 0.8 })}<path d="M240 118q30 -50 60 40" stroke="#fff" stroke-width="2" stroke-dasharray="3 6" fill="none" opacity=".6"/>${meat(290, 170)}
    ${figure('rusher', 270, 170, { s: 0.62, flip: false, run: 0.5 }).replace('<g ', '<g opacity=".8" ')}
    ${icon('bait', 256, 18, 26, COL.gold)}`),
  // 4. 屍群會學：你做的事 → 哪一型變多
  evo: () => svg(`
    ${icon('brain', 12, 4, 26, COL.brain)}<rect x="46" y="12" width="150" height="10" rx="5" fill="#3a2836"/><rect x="46" y="12" width="104" height="10" rx="5" fill="${COL.brain}"/>
    ${[['breaker', 96], ['vaulter', 156], ['pathfinder', 216]].map(([k, y], r) => `
      <rect x="8" y="${y - 30}" width="304" height="50" rx="10" fill="#171a28"/>
      ${r === 0 ? icon('obstacle', 26, y - 22, 32, COL.gold) : r === 1 ? `<g transform="translate(10 ${y + 14}) scale(.55)">${sandbags(10, 0, 40, 2)}</g><path d="M22 ${y - 6}q12 -22 26 0" stroke="#fff" stroke-width="2.5" fill="none"/>` : `${icon('trap', 14, y - 20, 26, COL.gold)}${icon('bait', 42, y - 20, 26, COL.gold)}`}
      ${arrow(92, y - 5, 150, y - 5, COL[k])}
      ${figure(k, 196, y + 16, { s: 0.55, flip: true })}${figure(k, 230, y + 16, { s: 0.55, flip: true })}${figure(k, 264, y + 16, { s: 0.55, flip: true })}`).join('')}`, '0 0 320 240'),
  // 5. 四種殭屍：每一型都有弱點（圖放在卡片裡）
  zombie: k => svg(`<ellipse cx="50" cy="96" rx="26" ry="5" fill="#000" opacity=".35"/>${figure(k, 46, 96, { s: 1.05, run: 0.25 })}`, '0 -28 100 132'),
  // 6. 操作：電腦鍵盤、手機橫向
  keys: () => {
    const key = (x, y, label, w = 30) => `<rect x="${x}" y="${y}" width="${w}" height="28" rx="6" fill="#232838" stroke="#4a5170" stroke-width="2"/><text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-size="13" font-weight="700" fill="#ece6d8" font-family="sans-serif">${label}</text>`;
    return svg(`${key(46, 20, 'W')}${key(12, 52, 'A')}${key(46, 52, 'S')}${key(80, 52, 'D')}
      ${key(140, 36, '1')}${key(174, 36, '2')}${key(208, 36, '3')}
      ${icon('obstacle', 144, 70, 22, COL.gold)}${icon('trap', 178, 70, 22, COL.gold)}${icon('bait', 212, 70, 22, COL.gold)}
      <rect x="262" y="18" width="40" height="62" rx="20" fill="#232838" stroke="#4a5170" stroke-width="2"/><path d="M282 18v24M262 42h40" stroke="#4a5170" stroke-width="2"/><rect x="262" y="18" width="20" height="24" rx="10" fill="#e9773b" opacity=".7"/>`, '0 0 320 100');
  },
  phone: () => svg(`<rect x="10" y="6" width="300" height="142" rx="18" fill="#141826" stroke="#4a5170" stroke-width="3"/><rect x="24" y="16" width="272" height="122" rx="8" fill="#1d2233"/>
    <circle cx="74" cy="100" r="28" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.3)" stroke-width="2"/><circle cx="84" cy="92" r="12" fill="rgba(255,255,255,.4)"/>
    <path d="M60 128q-6 14 -16 18" stroke="#e8c39e" stroke-width="10" fill="none" opacity=".6"/>
    ${[[248, 72, 'trap'], [212, 108, 'obstacle'], [262, 112, 'bait']].map(([x, y, k]) => `<circle cx="${x}" cy="${y}" r="17" fill="rgba(14,16,26,.8)" stroke="rgba(255,255,255,.2)" stroke-width="2"/>${icon(k, x - 10, y - 10, 20, COL.gold)}`).join('')}
    <circle cx="160" cy="80" r="5" fill="${COL.player}"/>`, '0 0 320 154'),
};

const PAGES = [
  { k: 'goal', art: ART.goal },
  { k: 'run', art: ART.run },
  { k: 'items', art: ART.items },
  { k: 'evo', art: ART.evo },
  { k: 'zombies', art: () => `<div class="hw-zgrid">${['rusher', 'pathfinder', 'breaker', 'vaulter'].map(z =>
      `<div class="hw-z" style="--zc:${COL[z]}">${ART.zombie(z)}<b data-i18n="z.${z}"></b><small data-i18n-html="how.z.${z}"></small></div>`).join('')}</div>` },
  { k: 'ctrl', art: () => `<div class="hw-ctrl"><div><b data-i18n="how.ctrl.pc"></b>${ART.keys()}<small data-i18n-html="how.ctrl.pcKeys"></small></div>
      <div><b data-i18n="how.ctrl.mobile"></b>${ART.phone()}<small data-i18n-html="how.ctrl.mobileKeys"></small></div></div>` },
];
export const HOWTO_PAGES = PAGES.length;

/** 建立所有頁面（在 setLang 之前呼叫，文字由 setLang 填入） */
export function buildHowto(pagesEl, tabsEl, dotsEl) {
  pagesEl.innerHTML = PAGES.map((p, i) => `<article class="hw-page${p.k === 'zombies' || p.k === 'ctrl' ? ' wide' : ''}" data-k="${i}">
      <div class="hw-art">${p.art()}</div>
      <div class="hw-text"><span class="hw-num">${i + 1} / ${PAGES.length}</span><h3 data-i18n="how.${p.k}.t"></h3><div class="hw-body" data-i18n-html="how.${p.k}.b"></div></div>
    </article>`).join('');
  tabsEl.innerHTML = PAGES.map((p, i) => `<button class="hw-tab" data-k="${i}"><i>${i + 1}</i><span data-i18n="how.${p.k}.t"></span></button>`).join('');
  dotsEl.innerHTML = PAGES.map((_, i) => `<i data-k="${i}"></i>`).join('');
}
