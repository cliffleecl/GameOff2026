/* 遊戲主邏輯的入口：把 src/game/ 底下各檔的方法掛到同一個 Game 物件上。
 * 整個邏輯層不碰 DOM、不用 three.js —— 所以 sim/ 的模擬玩家可以直接在 Node 跑。 */
export { Game, gameTimers, setTimeoutGame, tickGameTimers } from './game/core.js';
import './game/resources.js';
import './game/player.js';
import './game/items.js';
import './game/spawner.js';
import './game/zombies.js';
import './game/loop.js';
import './game/report.js';
