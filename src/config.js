/* 所有可調數值與共用小工具。改平衡先改這裡，改完跑 `npm run sim`。 */

/* ============================== CFG ============================== */
export const CFG = {
  COLS: 40, ROWS: 30,
  START_MATERIALS: 30,
  ITEM_COST: 8,         // 三種道具價格都一樣（玩家只要記一個數字）
  MAX_MATERIALS: 64,    // 材料上限＝8 個道具；血條下方的材料條以這個為滿格，每格＝一個道具
  // 跑酷專家：能翻越矮牆和自己放的障礙（翻越時稍微減速，落地後短暫加速）
  PLAYER: { hp: 70, speed: 3.0,   radius: 0.3, iframe: 0.5, vaultSlow: 0.8, boost: 1.3, boostTime: 1.5,   // 翻越落地後 1.5 秒加速 30%
            regenDelay: 3, regenSafe: 6, regen: 5,
            perchReach: 0.35,      // 站在矮牆／障礙上時，旁邊的殭屍多出來的攻擊距離（不能站在牆上當安全區）
            shoveEnabled: false,   // 推開機制先關掉（太強）；改成 true 就恢復
            shoveTrigger: 0.35, shoveRange: 1.4, shoveCd: 2.0, shoveTime: 0.22, shoveKnock: 7, shoveStun: 0.6 },
  PARTS: { goal: 6, delay: 5, minDist: 13, radioMin: 8 },
  SCRAP: { count: 12,   // 材料箱：撿到直接入帳
            units: 1,          // 一箱補幾格材料條（一格＝ITEM_COST＝一個道具）
            respawn: 5, minDist: 6, pickR: 0.75 },
  SPAWN: { startInterval: 6, minInterval: 1.2, ramp: 0.01, ringMin: 11, ringMax: 15,
           aliveBase: 3, alivePerMin: 2, maxAlive: 32, despawnDist: 22, loseT: 12, rusherOnly: 45 },
  HORDE: { first: 75, every: 80, warn: 6, base: 6, per: 2, gap: 0.3 },
  EVAC: { time: 30, radius: 4, pickupR: 1.6, spawnMul: 1.5, horde: 6, extraCap: 6 },
  // 開場散布的遊蕩殭屍：被牠們看到之前，不會有追兵生成
  WANDER: { count: 6, minDist: 12, sight: 5, speedMul: 0.4, homeRadius: 4, revert: true },   // revert：被甩掉的追兵回到遊蕩，而不是消失
  MAP: { blobs: 28, blobLen: [6, 16], segments: 16, segLen: [3, 7], lowShare: 0.5, clearRadius: 5 },
  BUILD: {
    obstacle: { hp: 60, blocks: true, bumpStun: 1.0, bumpKnock: 4 },   // 一次放 3 格寬；你跨得過、多數殭屍跨不過；放下時會撞暈重疊的殭屍
    trap:     { stun: 1.2, slow: 0.45, slowTime: 2, uses: 10 },  // 定身＋減速，觸發 10 次損毀
    bait:     { stall: 2, lure: 9, chance: 0.85, life: 15, throw: 5 },   // 一塊肉：往前丟 5 格，15 秒內把 9 格內的殭屍引過去；chance＝還沒識破時上鉤的機率
  },
  /* 四種殭屍＝四種「破解障礙」的方式；sight 只對盲衝型有意義；scale 只影響外觀大小（碰撞看 radius）
   * 名稱在 i18n.js（z.rusher…）：盲衝、繞路、拆除、跑酷 */
  ZOMBIE: {
    rusher:     { speed: 2.8,  radius: 0.3,  dmg: 4, scale: 1,    sight: 12 },                       // 比你稍慢，但只照視線直衝、會卡在障礙前
    pathfinder: { speed: 3.0,  radius: 0.3,  dmg: 4, scale: 1, baitMul: 0.3 },                      // 比盲衝快；會繞路、預判、繞開陷阱、不太上誘餌的當
    breaker:    { speed: 1.8,  radius: 0.4,  dmg: 5, scale: 1.3,  wallDps: 26, wallCost: 4 },        // 弱點：很慢；強項：拆障礙、攻擊稍高
    vaulter:    { speed: 3.5,  radius: 0.26, dmg: 3, scale: 0.75, vaultSlow: 0.85, vaultCost: 1.2 },  // 弱點：不會預判、攻擊低、會踩陷阱；強項：最快、會翻障礙
  },
  MEMORY: { evolveAt: 30, minGap: 10,   // 事件觸發：累積 30 點學習事件就進化一次（兩次進化至少間隔 10 秒）
            snareDanger: 0.6, dangerDecay: 0.8, dangerMax: 8, habitDecay: 0.5, fleeDecay: 0.5, pickWeight: 3,
            leadBase: 0.2, leadPerEscape: 0.06, leadMax: 1.2, learnedPerUpdate: 0.2, learnedMax: 0.6, reportFade: false,
            // 族群進化：各類型的出現權重怎麼隨你的打法改變
            evo: { start: { rusher: 1, pathfinder: 0.15, breaker: 0.05, vaulter: 0 },
                   // 每種行為對應一種破解型：障礙擋住→拆除；翻越甩掉→跑酷；陷阱夾到、誘餌騙到、躲廢墟甩掉→繞路
                   blockToBreaker: 0.06, placedToBreaker: 0.03, vaultToVaulter: 0.08, trapToPath: 0.05,
                   baitToPath: 0.08, losToPath: 0.06, rusherDecay: 0.05, rusherMin: 0.35,
                   trapLearn: 0.1, trapMax: 0.85, baitLearn: 0.05, baitMax: 0.8,   // 全體對陷阱、誘餌的認識
                   max: { pathfinder: 3, breaker: 2.5, vaulter: 3 } } },
};

export const C = CFG.COLS, R = CFG.ROWS, N = C * R;
export const idx = (x, y) => y * C + x, ix = i => i % C, iy = i => (i / C) | 0;
export const inB = (x, y) => x >= 0 && y >= 0 && x < C && y < R;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const cellOf = (x, y) => idx(clamp(Math.floor(x), 0, C - 1), clamp(Math.floor(y), 0, R - 1));
export const DIR4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export const DIR8 = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
export const RADIO = { x: C / 2, y: R / 2 };
export const TYPES = ['rusher', 'pathfinder', 'breaker', 'vaulter'];

/* ============================== 調參數 ==============================
 * 參數面板（遊戲網址加 ?tune，或按 ` 鍵）和模擬（npm run sim -- --cfg 檔案.json）都用這裡的函式。
 * 覆寫值的格式跟 CFG 一樣的巢狀結構，只寫要改的欄位，例如 { "PLAYER": { "speed": 3.2 } }。 */
export const CFG_DEFAULTS = JSON.parse(JSON.stringify(CFG));   // 原始數值（還原、比對用）
/** 地圖尺寸會影響已經算好的常數（C、R、N），只能改程式後重新載入，不開放即時調整 */
export const CFG_LOCKED = ['COLS', 'ROWS'];

/** 把覆寫值套到 CFG（深層合併；不認得的欄位直接略過，避免打錯字變成新欄位） */
export function applyCfg(over, target = CFG) {
  for (const k in over) {
    if (!(k in target) || CFG_LOCKED.includes(k) && target === CFG) continue;
    const v = over[k];
    if (v && typeof v === 'object' && typeof target[k] === 'object') applyCfg(v, target[k]);
    else if (typeof v === typeof target[k]) target[k] = v;
  }
  return target;
}
/** 目前 CFG 跟原始數值的差異（只列出改過的欄位） */
export function cfgDiff(cur = CFG, base = CFG_DEFAULTS) {
  const out = {};
  for (const k in base) {
    if (cur[k] && typeof cur[k] === 'object') { const d = cfgDiff(cur[k], base[k]); if (Object.keys(d).length) out[k] = d; }
    else if (cur[k] !== base[k]) out[k] = cur[k];
  }
  return out;
}
/** 全部還原成原始數值 */
export function resetCfg() { applyCfg(JSON.parse(JSON.stringify(CFG_DEFAULTS))); }
