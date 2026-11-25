/* 邏輯層對外的事件介面：邏輯只呼叫 FX.xxx()，怎麼表現由 view.js / ui.js 決定。
 * Feel：打擊手感開關；Input：目前的移動輸入（鍵盤或虛擬搖桿寫入）。 */

export const Feel = { shake: true, hitstop: true, knockback: true, ragdoll: true, hitfx: true, trail: true, slowmo: true };
export const FX = { hit(){}, hurt(){}, shove(){}, alert(){}, stuck(){}, vault(){}, boost(){}, despawn(){}, pickup(){}, part(){}, horde(){}, report(){}, msg(){}, over(){}, broke(){}, evac(){} };
export const Input = { kx: 0, ky: 0 };
