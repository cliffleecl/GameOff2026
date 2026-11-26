/* 程式產生的低面數模型：角色、廢墟、沙包、道具。
 *
 * 做法：每個模型由很多小零件（方塊、球、圓柱）組成，但會「合併成一個幾何」並用頂點顏色上色，
 * 所以一個身體只要畫一次（手機上 draw call 是最大的效能瓶頸）。
 * 要動的部位（手、腳）才分開成獨立的 mesh，掛在關節（pivot）上旋轉。
 *
 * glow：0~1，該零件不受光照影響、自己發亮（殭屍眼睛、無線電燈）。 */
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

/** 一個零件：幾何＋顏色＋位置／旋轉／縮放 */
export const part = (geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], glow = 0) => ({ geo, color, p, r, s, glow });

/** 把零件合併成一個幾何。ao：[最暗倍率, 從哪個高度開始變亮, 到哪個高度全亮]，做出腳邊比較暗的感覺 */
export function merge(parts, ao = null) {
  const list = parts.map(pt => {
    let g = pt.geo.index ? pt.geo.toNonIndexed() : pt.geo.clone();
    tmpE.set(pt.r[0], pt.r[1], pt.r[2]); tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...pt.p), tmpQ, new THREE.Vector3(...pt.s)); g.applyMatrix4(tmpM);
    const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), glow = new Float32Array(n);
    tmpC.set(pt.color);
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (ao && !pt.glow) { const t = Math.min(1, Math.max(0, (pos.getY(i) - ao[1]) / (ao[2] - ao[1]))); k = ao[0] + (1 - ao[0]) * t; }
      col[i * 3] = tmpC.r * k; col[i * 3 + 1] = tmpC.g * k; col[i * 3 + 2] = tmpC.b * k; glow[i] = pt.glow;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
    return g;
  });
  const out = BufferGeometryUtils.mergeBufferGeometries(list);
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** 角色共用材質：頂點顏色＋可發光的零件（一個材質所有殭屍共用） */
export function glowMaterial() {
  // Phong（逐像素打光）：手電筒的光圈才會清楚；shininess 0 ＝ 不反光，看起來跟 Lambert 一樣霧面
  const m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 0, specular: 0x000000 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float glow;\nvarying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvGlow = glow;');
    sh.fragmentShader = 'varying float vGlow;\n' + sh.fragmentShader.replace(
      'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      'gl_FragColor = vec4( mix( outgoingLight, diffuseColor.rgb * 1.4, vGlow ), diffuseColor.a );');
  };
  return m;
}

/* ---------------- 基本形狀（共用，避免重複建立） ---------------- */
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const SPH = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const CYL = (r1, r2, h, n = 8) => new THREE.CylinderGeometry(r1, r2, h, n);

/* ============================== 殭屍 ==============================
 * 四型一眼就要分得出來（輪廓不同，不只顏色不同），而且外型暗示弱點：
 *   盲衝：破爛紅上衣、駝背、雙手往前伸 —— 只會直衝
 *   繞路：黃色雨衣＋兜帽＋大背包、手電筒 —— 會找路、會預判
 *   拆除：壯、紫色工作服＋安全帽、扛大鐵鎚 —— 拆障礙，但很慢
 *   跑酷：瘦長、青色運動服＋頭帶、壓低身體 —— 快、會翻牆
 * 每型的眼睛顏色不同，在霧裡也看得到。 */
const SKIN = 0x8fae66, SKIN_D = 0x6f8a4e, JEANS = 0x3c4f7a, SHOE = 0x2a2522, HAIR = 0x2a2522;

export const ZOMBIE_LOOK = {
  rusher:     { shirt: 0xd9483f, shirt2: 0x8e2a24, pants: JEANS, eye: 0xff5a3a, lean: 0.28, reach: -1.35, legLen: 0.3, w: 1 },
  pathfinder: { shirt: 0xf0c94a, shirt2: 0xb8932a, pants: 0x4a4f5e, eye: 0xfff2a0, lean: 0.08, reach: -0.55, legLen: 0.3, w: 1 },
  breaker:    { shirt: 0x9b62d9, shirt2: 0x6a3fa0, pants: 0x5a4a7a, eye: 0xe7b8ff, lean: 0.12, reach: -0.35, legLen: 0.28, w: 1.15 },
  vaulter:    { shirt: 0x34d1c0, shirt2: 0x1f8c80, pants: 0x1f3d48, eye: 0x9ffff2, lean: 0.38, reach: -0.9, legLen: 0.34, w: 0.85 },
};

/** 身體（不含手腳）：軀幹、頭、眼睛、各型配件。原點在腳底，前方是 +z */
function zombieBody(type) {
  const L = ZOMBIE_LOOK[type], w = L.w, hip = L.legLen, P = [];
  const tH = 0.34, tY = hip + tH / 2, hY = hip + tH + 0.16;
  // 軀幹（上衣）＋腰帶附近的褲頭
  P.push(part(B(0.38 * w, tH, 0.24), L.shirt, [0, tY, 0]));
  P.push(part(B(0.36 * w, 0.07, 0.23), L.pants, [0, hip + 0.03, 0]));
  // 頭：皮膚＋頭髮；眼睛發光
  P.push(part(B(0.32, 0.3, 0.3), SKIN, [0, hY, 0.02]));
  P.push(part(B(0.07, 0.045, 0.02), L.eye, [0.075, hY + 0.02, 0.175], [0, 0, 0], [1, 1, 1], 1));
  P.push(part(B(0.07, 0.045, 0.02), L.eye, [-0.075, hY + 0.02, 0.175], [0, 0, 0], [1, 1, 1], 1));
  P.push(part(B(0.14, 0.03, 0.02), SKIN_D, [0, hY - 0.08, 0.17]));                 // 嘴
  if (type === 'rusher') {
    P.push(part(B(0.34, 0.1, 0.32), HAIR, [0, hY + 0.15, -0.01]));
    P.push(part(B(0.14, 0.12, 0.02), L.shirt2, [0.08, tY - 0.06, 0.125]));            // 破洞
    P.push(part(B(0.1, 0.08, 0.02), SKIN_D, [-0.1, tY + 0.07, 0.125]));               // 露出的皮膚
    P.push(part(B(0.08, 0.06, 0.26), L.shirt2, [-0.16, tY - 0.15, 0], [0, 0, 0.3]));  // 衣角撕裂
  } else if (type === 'pathfinder') {
    P.push(part(B(0.4, 0.1, 0.26), L.shirt, [0, hip - 0.02, 0]));                     // 雨衣下襬
    P.push(part(SPH(0.2, 10, 6), L.shirt, [0, hY + 0.04, -0.03], [0, 0, 0], [1, 1.05, 1.05]));   // 兜帽（頭會蓋住前面）
    P.push(part(B(0.3, 0.06, 0.04), L.shirt2, [0, hY + 0.16, 0.12]));                 // 兜帽前緣
    P.push(part(B(0.3, 0.34, 0.16), 0x3b4152, [0, tY + 0.03, -0.2]));                 // 大背包
    P.push(part(B(0.28, 0.06, 0.17), 0x56607a, [0, tY + 0.21, -0.2]));
    P.push(part(CYL(0.012, 0.012, 0.3, 4), 0x9aa3b5, [0.1, tY + 0.38, -0.24]));        // 背包天線
    P.push(part(CYL(0.035, 0.035, 0.1, 8), 0xdfe6f5, [0.12, tY + 0.06, 0.14], [Math.PI / 2, 0, 0], [1, 1, 1], 0.9));   // 胸前手電筒
  } else if (type === 'breaker') {
    P.push(part(B(0.42 * w, 0.2, 0.26), L.shirt2, [0, tY - 0.05, 0.01]));              // 吊帶褲胸片
    P.push(part(B(0.05, 0.2, 0.02), L.shirt2, [0.12, tY + 0.08, 0.125]));
    P.push(part(B(0.05, 0.2, 0.02), L.shirt2, [-0.12, tY + 0.08, 0.125]));
    P.push(part(SPH(0.17, 12, 6), 0xe4e7ee, [0, hY + 0.13, 0], [0, 0, 0], [1, 0.5, 1.05]));   // 安全帽
    P.push(part(CYL(0.21, 0.21, 0.025, 12), 0xb9bfcc, [0, hY + 0.13, 0.02]));            // 帽緣
  } else if (type === 'vaulter') {
    P.push(part(B(0.34, 0.07, 0.31), HAIR, [0, hY + 0.15, -0.01]));
    P.push(part(B(0.34, 0.05, 0.32), 0xf2f2f2, [0, hY + 0.08, 0]));                   // 頭帶
    P.push(part(B(0.06, 0.08, 0.04), 0xf2f2f2, [0, hY + 0.06, -0.17], [0.5, 0, 0]));   // 頭帶尾巴
    P.push(part(B(0.04, tH, 0.02), 0xf2f2f2, [0.13 * w, tY, 0.125]));                 // 運動服白線
    P.push(part(B(0.04, tH, 0.02), 0xf2f2f2, [-0.13 * w, tY, 0.125]));
  }
  return merge(P, [0.7, 0, hip + tH]);
}

/** 手：從肩膀往下垂（原點＝肩膀），旋轉 x 往前伸。拆除型右手握鐵鎚 */
function zombieArm(type, right) {
  const L = ZOMBIE_LOOK[type], P = [];
  const len = type === 'vaulter' ? 0.34 : 0.3, th = type === 'breaker' ? 0.12 : 0.09;
  P.push(part(B(th + 0.02, 0.12, th + 0.02), L.shirt, [0, -0.05, 0]));               // 袖子
  P.push(part(B(th, len - 0.1, th), type === 'rusher' && right ? SKIN_D : SKIN, [0, -0.1 - (len - 0.1) / 2, 0]));
  P.push(part(B(th + 0.01, 0.06, th + 0.03), SKIN_D, [0, -len - 0.01, 0.01]));       // 手掌
  if (type === 'breaker' && right) {
    P.push(part(CYL(0.02, 0.02, 0.55, 6), 0x7a5532, [0, -len - 0.02, 0.12], [Math.PI / 2, 0, 0]));   // 槌柄
    P.push(part(B(0.12, 0.12, 0.22), 0x6d7380, [0, -len - 0.02, 0.4]));                // 槌頭
  }
  if (type === 'pathfinder' && !right) P.push(part(B(0.14, 0.09, 0.05), 0xe8dcb8, [0, -len - 0.04, 0.06]));   // 手上拿著地圖
  return merge(P);
}

/** 腳：原點＝髖關節，往下垂 */
function zombieLeg(type) {
  const L = ZOMBIE_LOOK[type], len = L.legLen, th = type === 'vaulter' ? 0.11 : 0.13, P = [];
  P.push(part(B(th, len - 0.04, th), L.pants, [0, -(len - 0.04) / 2, 0]));
  P.push(part(B(th + 0.02, 0.05, th + 0.07), type === 'vaulter' ? 0xf2f2f2 : SHOE, [0, -len + 0.025, 0.03]));
  return merge(P, [0.75, -len, 0]);
}

const zCache = {};
/** 每型的幾何只建一次，所有同型殭屍共用 */
export function zombieGeos(type) {
  if (!zCache[type]) zCache[type] = { body: zombieBody(type), armR: zombieArm(type, true), armL: zombieArm(type, false), leg: zombieLeg(type) };
  return zCache[type];
}

/* ============================== 玩家 ==============================
 * 跑酷者：橘色帽 T、深色長褲、白球鞋、小背包、頭帶。殭屍都是綠皮膚＋發光眼睛，玩家是暖色系，一眼分得出來。 */
const HOODIE = 0xf07a2e, HOODIE_D = 0xc65a1a, PANTS = 0x2b3142, PSKIN = 0xe2b48c, DARK = 0x1e222e;
export function playerGeos() {
  const body = merge([
    part(B(0.32, 0.34, 0.2), HOODIE, [0, 0.47, 0]),
    part(B(0.3, 0.05, 0.19), HOODIE_D, [0, 0.32, 0]),                 // 帽 T 下襬
    part(B(0.16, 0.1, 0.02), HOODIE_D, [0, 0.42, 0.105]),             // 前口袋
    part(B(0.22, 0.26, 0.11), DARK, [0, 0.5, -0.15]),                 // 背包
    part(B(0.2, 0.05, 0.12), 0x3a4152, [0, 0.62, -0.15]),
    part(B(0.03, 0.22, 0.02), 0x3a4152, [0.09, 0.52, 0.105]),          // 背包肩帶
    part(B(0.03, 0.22, 0.02), 0x3a4152, [-0.09, 0.52, 0.105]),
    part(SPH(0.15, 12, 10), PSKIN, [0, 0.78, 0.01]),                  // 頭
    part(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), HOODIE, [0, 0.8, -0.02], [-0.35, 0, 0]),   // 帽兜
    part(B(0.31, 0.045, 0.31), 0xf2f2f2, [0, 0.84, 0.0]),             // 頭帶
    part(B(0.04, 0.035, 0.02), 0x2a2522, [0.05, 0.79, 0.15]),         // 眼睛
    part(B(0.04, 0.035, 0.02), 0x2a2522, [-0.05, 0.79, 0.15]),
  ], [0.8, 0.3, 0.9]);
  const limb = (len, color, foot) => merge([
    part(B(0.1, len, 0.1), color, [0, -len / 2, 0]),
    ...(foot ? [part(B(0.12, 0.06, 0.18), 0xf2f2f2, [0, -len, 0.03]), part(B(0.125, 0.02, 0.185), 0xe9773b, [0, -len - 0.02, 0.03])]
             : [part(B(0.09, 0.07, 0.09), PSKIN, [0, -len - 0.03, 0])]),
  ]);
  return { body, leg: limb(0.27, PANTS, true), arm: limb(0.25, HOODIE, false) };
}

/* ============================== 場景 ============================== */
/** 廢墟方塊三種變化：完整水泥塊、上緣崩塌、露出鋼筋。高度用 instance 縮放，所以這裡都做成 1×1×1 */
export function ruinGeos() {
  const C0 = 0xffffff, TOP = 0xd9dce6, EDGE = 0x8c8f99;
  const block = merge([
    part(B(1, 1, 1), C0, [0, 0.5, 0]),
    part(B(1.02, 0.04, 1.02), TOP, [0, 0.99, 0]),                      // 上緣積灰
    part(B(1.01, 0.06, 1.01), EDGE, [0, 0.36, 0]),                     // 水泥分層線
  ], [0.45, 0, 0.9]);
  const broken = merge([
    part(B(1, 0.72, 1), C0, [0, 0.36, 0]),
    part(B(0.55, 0.3, 0.5), C0, [-0.22, 0.85, -0.24], [0, 0, 0.12]),   // 崩下來剩一角
    part(B(0.35, 0.18, 0.4), C0, [0.25, 0.8, 0.2], [0.2, 0.3, 0]),
    part(B(1.01, 0.04, 1.01), TOP, [0, 0.71, 0]),
  ], [0.45, 0, 0.9]);
  const rebar = merge([
    part(B(1, 0.8, 1), C0, [0, 0.4, 0]),
    part(B(1.01, 0.04, 1.01), TOP, [0, 0.79, 0]),
    part(CYL(0.025, 0.025, 0.5, 4), 0x8a5a3a, [0.2, 1.02, 0.15], [0.25, 0, 0.1]),   // 鏽掉的鋼筋
    part(CYL(0.025, 0.025, 0.4, 4), 0x8a5a3a, [-0.15, 0.98, 0.2], [-0.2, 0, -0.3]),
    part(CYL(0.025, 0.025, 0.45, 4), 0x8a5a3a, [0.05, 1.0, -0.25], [0, 0, 0.35]),
  ], [0.45, 0, 0.9]);
  return [block, broken, rebar];
}

/** 矮牆：兩層沙包，看起來就是「翻得過去」的東西 */
export function sandbagGeo() {
  const bag = (x, y, z, r) => part(SPH(0.5, 6, 3), 0xffffff, [x, y, z], [0, r, 0], [0.48, 0.15, 0.36]);
  return merge([
    bag(-0.25, 0.08, -0.2, 0.1), bag(0.25, 0.08, -0.2, -0.05), bag(-0.25, 0.08, 0.2, 0), bag(0.25, 0.08, 0.2, 0.08),
    bag(0, 0.22, -0.2, 0.05), bag(-0.4, 0.22, -0.2, 0.0), bag(0.4, 0.22, -0.2, -0.1),
    bag(0, 0.22, 0.2, -0.05), bag(-0.4, 0.22, 0.2, 0.08), bag(0.4, 0.22, 0.2, 0),
    bag(-0.2, 0.35, 0, 0.1), bag(0.2, 0.35, 0, -0.08),
  ], [0.55, 0, 0.42]);
}

/** 地上的碎石（純裝飾，不影響碰撞） */
export function rubbleGeo() {
  return merge([
    part(B(0.16, 0.08, 0.12), 0xffffff, [0, 0.04, 0], [0, 0.4, 0.1]),
    part(B(0.1, 0.06, 0.1), 0xffffff, [0.14, 0.03, 0.08], [0.2, 1.1, 0]),
    part(B(0.07, 0.05, 0.08), 0xffffff, [-0.1, 0.025, 0.1], [0, 0.7, 0.2]),
  ], [0.6, 0, 0.08]);
}

/* ============================== 道具 ============================== */
/** 障礙：施工用路障（兩支腳＋橘白斜紋橫板）。原點在地面中央 */
export function obstacleGeo() {
  const P = [
    part(B(0.08, 0.42, 0.34), 0x3a3f52, [-0.36, 0.21, 0]), part(B(0.08, 0.42, 0.34), 0x3a3f52, [0.36, 0.21, 0]),
    part(B(0.1, 0.04, 0.5), 0x2a2e3c, [-0.36, 0.02, 0]), part(B(0.1, 0.04, 0.5), 0x2a2e3c, [0.36, 0.02, 0]),
    part(B(0.96, 0.18, 0.06), 0xf2efe6, [0, 0.3, 0]),
    part(B(0.96, 0.1, 0.05), 0xf2efe6, [0, 0.1, 0]),
  ];
  for (let k = 0; k < 4; k++) P.push(part(B(0.12, 0.2, 0.07), 0xe9773b, [-0.33 + k * 0.22, 0.3, 0], [0, 0, 0.6]));
  P.push(part(SPH(0.04, 6, 4), 0xffb347, [0.36, 0.46, 0], [0, 0, 0], [1, 1, 1], 1));   // 警示燈
  return merge(P, [0.6, 0, 0.35]);
}

/** 陷阱：捕獸夾（圓盤＋一圈鋸齒） */
export function trapGeo() {
  const P = [part(CYL(0.36, 0.38, 0.05, 16), 0x5a3a1f, [0, 0.025, 0]), part(CYL(0.12, 0.12, 0.06, 10), 0xa8713f, [0, 0.05, 0])];
  P.push(part(new THREE.TorusGeometry(0.32, 0.025, 4, 20), 0x9aa0ae, [0, 0.07, 0], [Math.PI / 2, 0, 0]));
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    P.push(part(new THREE.ConeGeometry(0.035, 0.14, 4), 0xcfd4de, [Math.cos(a) * 0.32, 0.13, Math.sin(a) * 0.32], [0, 0, 0]));
  }
  P.push(part(B(0.5, 0.02, 0.04), 0x9aa0ae, [0, 0.06, 0], [0, 0.5, 0]));          // 彈簧板
  return merge(P);
}

/** 地上的雜草（純裝飾）：幾片細長的葉子 */
export function weedGeo() {
  const P = [];
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2;
    P.push(part(new THREE.ConeGeometry(0.03, 0.22 + (k % 2) * 0.08, 3), 0xffffff, [Math.cos(a) * 0.05, 0.11, Math.sin(a) * 0.05], [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35]));
  }
  return merge(P, [0.55, 0, 0.25]);
}

/* ============================== 通訊器零件（六種） ==============================
 * 順序跟 i18n 的 part.0~5、icons.js 的 part0~5 一致。藍色的部分會發光，在黑暗裡也找得到。 */
const METAL = 0x9aa3b5, DARKM = 0x3a4152, GLOW = 0x5fe0ff;
export function partGeo(k) {
  switch (k % 6) {
    case 0: return merge([   // 天線
      part(CYL(0.025, 0.035, 0.6, 6), METAL, [0, 0.3, 0]), part(B(0.16, 0.06, 0.16), DARKM, [0, 0.03, 0]),
      part(SPH(0.05, 8, 6), GLOW, [0, 0.62, 0], [0, 0, 0], [1, 1, 1], 1),
      part(new THREE.TorusGeometry(0.1, 0.012, 4, 12, Math.PI), GLOW, [0, 0.45, 0], [0, 0, 0], [1, 1, 1], 0.8)]);
    case 1: return merge([   // 電池
      part(B(0.34, 0.2, 0.2), DARKM, [0, 0.1, 0]), part(B(0.36, 0.06, 0.21), GLOW, [0, 0.1, 0], [0, 0, 0], [1, 1, 1], 0.9),
      part(CYL(0.03, 0.03, 0.05, 6), METAL, [0.1, 0.22, 0]), part(CYL(0.03, 0.03, 0.05, 6), 0xd9483f, [-0.1, 0.22, 0])]);
    case 2: { const P = [part(B(0.4, 0.03, 0.3), 0x2f6b40, [0, 0.015, 0]), part(B(0.14, 0.05, 0.12), 0x1e222e, [0, 0.05, 0])];   // 電路板
      for (let j = 0; j < 3; j++) P.push(part(B(0.3, 0.008, 0.012), GLOW, [0, 0.035, -0.1 + j * 0.1], [0, 0, 0], [1, 1, 1], 0.9));
      P.push(part(CYL(0.03, 0.03, 0.07, 8), 0xe9a23b, [0.13, 0.06, 0.08]));
      return merge(P); }
    case 3: return merge([   // 喇叭
      part(B(0.3, 0.3, 0.12), DARKM, [0, 0.15, 0]), part(CYL(0.1, 0.1, 0.02, 14), 0x1e222e, [0, 0.15, 0.065], [Math.PI / 2, 0, 0]),
      part(CYL(0.04, 0.04, 0.025, 10), GLOW, [0, 0.15, 0.07], [Math.PI / 2, 0, 0], [1, 1, 1], 0.9)]);
    case 4: return merge([   // 話筒
      part(B(0.08, 0.06, 0.34), DARKM, [0, 0.05, 0]), part(B(0.12, 0.1, 0.1), DARKM, [0, 0.06, 0.16]), part(B(0.12, 0.1, 0.1), DARKM, [0, 0.06, -0.16]),
      part(B(0.06, 0.02, 0.2), GLOW, [0, 0.085, 0], [0, 0, 0], [1, 1, 1], 0.8)]);
    default: return merge([  // 調頻旋鈕
      part(CYL(0.16, 0.18, 0.08, 16), METAL, [0, 0.04, 0]), part(CYL(0.1, 0.1, 0.1, 12), DARKM, [0, 0.12, 0]),
      part(B(0.02, 0.02, 0.1), GLOW, [0, 0.175, 0.04], [0, 0, 0], [1, 1, 1], 1),
      part(new THREE.TorusGeometry(0.17, 0.012, 4, 20), GLOW, [0, 0.085, 0], [Math.PI / 2, 0, 0], [1, 1, 1], 0.7)]);
  }
}

/* ============================== 救援直升機 ==============================
 * body：機身＋座艙＋尾桁＋起落架（一個 mesh）；rotor：主旋翼；tail：尾旋翼（分開才能轉） */
export function heliGeos() {
  const BODY = 0x4b5a3e, BODY_D = 0x38442e, GLASS = 0x9fd6ff;
  const body = merge([
    part(SPH(0.7, 12, 8), BODY, [0, 1.0, 0.2], [0, 0, 0], [0.85, 0.75, 1.35]),                // 機身
    part(SPH(0.55, 12, 8), GLASS, [0, 1.12, 0.85], [0, 0, 0], [0.75, 0.62, 0.7], 0.35),       // 座艙玻璃（微微發亮）
    part(CYL(0.16, 0.08, 2.4, 8), BODY, [0, 1.15, -1.55], [Math.PI / 2, 0, 0]),               // 尾桁
    part(B(0.06, 0.6, 0.35), BODY_D, [0, 1.45, -2.7]),                                         // 垂直尾翼
    part(B(0.7, 0.05, 0.25), BODY_D, [0, 1.2, -2.5]),                                          // 水平尾翼
    part(CYL(0.12, 0.12, 0.2, 8), 0x2a2e3c, [0, 1.65, 0.1]),                                   // 旋翼軸
    part(B(0.06, 0.06, 1.9), 0x2a2e3c, [0.5, 0.25, 0.2]), part(B(0.06, 0.06, 1.9), 0x2a2e3c, [-0.5, 0.25, 0.2]),   // 起落架
    part(B(0.05, 0.4, 0.05), 0x2a2e3c, [0.42, 0.45, 0.7], [0, 0, -0.3]), part(B(0.05, 0.4, 0.05), 0x2a2e3c, [-0.42, 0.45, 0.7], [0, 0, 0.3]),
    part(B(0.05, 0.4, 0.05), 0x2a2e3c, [0.42, 0.45, -0.3], [0, 0, -0.3]), part(B(0.05, 0.4, 0.05), 0x2a2e3c, [-0.42, 0.45, -0.3], [0, 0, 0.3]),
    part(B(0.5, 0.18, 0.04), 0xf2f2f2, [0, 1.0, -0.35], [0, 0, 0], [1, 1, 1]),                 // 機身白條
    part(SPH(0.06, 6, 4), 0xff4040, [0, 1.75, -2.85], [0, 0, 0], [1, 1, 1], 1),               // 尾燈
  ]);
  const rotor = merge([part(B(4.2, 0.03, 0.2), 0x1e222e, [0, 0, 0]), part(B(0.2, 0.03, 4.2), 0x1e222e, [0, 0, 0])]);
  const tail = merge([part(B(0.04, 0.7, 0.08), 0x1e222e, [0, 0, 0])]);
  return { body, rotor, tail };
}
