/* 介面圖示（內嵌 SVG，不用外部檔案）。顏色跟著 CSS 的 color（currentColor）。
 * part0~part5：六個通訊器零件，順序跟 i18n 的 part.0~part.5 一致，也跟場景裡撿到的模型一致。 */
const S = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICONS = {
  clock: S('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  brain: S('<path d="M9 4a3 3 0 0 0-3 3v.2A3 3 0 0 0 4 10a3 3 0 0 0 1 2.2A3 3 0 0 0 6 17a3 3 0 0 0 3 3V4zM15 4a3 3 0 0 1 3 3v.2A3 3 0 0 1 20 10a3 3 0 0 1-1 2.2A3 3 0 0 1 18 17a3 3 0 0 1-3 3V4z"/><path d="M9 9h1.5M15 13h-1.5M9 15h1.5"/>'),
  // 道具
  obstacle: S('<path d="M3 9h18v5H3z"/><path d="M7 9l-3 5M12 9l-3 5M17 9l-3 5M21 9l-3 5" stroke-width="1.6"/><path d="M5 14v6M19 14v6"/>'),
  trap: S('<circle cx="12" cy="13" r="7"/><path d="M5 13l2-3 2 3 2-3 2 3 2-3 2 3 2-3"/><circle cx="12" cy="13" r="1.5" fill="currentColor"/>'),
  bait: S('<path d="M14.5 5.5c3 0 5 2.2 5 5 0 3.6-3.4 6.5-7.5 6.5S5 14.5 6 11c.8-2.9 4.7-5.5 8.5-5.5z"/><path d="M7 16l-3.5 3.5M3 18.5l1.5 1.5"/><circle cx="14" cy="10" r="1.6"/>'),
  // 六個通訊器零件
  part0: S('<path d="M12 21V8M8 21h8"/><circle cx="12" cy="6" r="2"/><path d="M7.5 3.5a6 6 0 0 0 0 5M16.5 3.5a6 6 0 0 1 0 5"/>'),     // 天線
  part1: S('<rect x="4" y="7" width="15" height="10" rx="2"/><path d="M19 10.5h2v3h-2M8 12h4M10 10v4"/>'),                           // 電池
  part2: S('<rect x="5" y="5" width="14" height="14" rx="1.5"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),   // 電路板
  part3: S('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>'),                         // 喇叭
  part4: S('<path d="M6 3h4l1.5 5-2.5 1.5a11 11 0 0 0 5.5 5.5l1.5-2.5 5 1.5v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z"/>'),       // 話筒
  part5: S('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v3M4 12h2M18 12h2M6.3 6.3l1.4 1.4M17.7 6.3l-1.4 1.4"/>'),   // 調頻旋鈕
};
