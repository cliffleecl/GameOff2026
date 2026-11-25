/* 測試用：把 Math.random 換成可重現的亂數，讓同一個種子每次產生同一張地圖、同一批殭屍。
 * 邏輯層全部用 Math.random，所以不用改遊戲程式就能固定結果。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const original = Math.random;
export function seedRandom(seed) { Math.random = mulberry32(seed); }
export function restoreRandom() { Math.random = original; }
