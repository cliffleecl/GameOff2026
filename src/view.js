/* 表現層：three.js 場景、模型、特效、鏡頭。只讀取邏輯層狀態，不改遊戲規則。 */
import * as THREE from 'three';
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Feel, FX } from './fx.js';
import { Grid } from './grid.js';
import { lerpAngle, hash01 } from './physics.js';
import { Memory } from './memory.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { glowMaterial, zombieGeos, ZOMBIE_LOOK, playerGeos, ruinGeos, sandbagGeo, rubbleGeo, obstacleGeo, trapGeo, weedGeo, partGeo, heliGeos } from './models.js';
import { t as tr } from './i18n.js';

/** 霧面材質：Phong（逐像素打光）讓手電筒光圈清楚；shininess 0 ＝ 不反光 */
const phong = o => new THREE.MeshPhongMaterial(Object.assign({ shininess: 0, specular: 0x000000 }, o));

const MAX_BLOBS = 80;   // 腳下圓形陰影（殭屍用，一次畫完）的上限

/* =====================================================================
 * 表現層：Three.js
 * ===================================================================== */
export const W2 = (x, y) => [x - C / 2, y - R / 2];
export const yawOf = a => Math.PI / 2 - a;

export const View = {
  r: null, scene: null, cam: null, sun: null, shake: 0, zMap: new Map(), sMap: new Map(), scMap: new Map(), corpses: [], parts: [], shots: [],
  camLook: null, camDir: null, camDist: 20, portrait: false, rocksMesh: null,

  init() {
    const cv = document.getElementById('cv');
    // 手機：解析度上限 1.25 倍。實測幀時間幾乎跟像素數成正比（陰影、光源的影響小很多），高 DPI 螢幕畫 2 倍不划算
    this.mobile = window.matchMedia('(pointer: coarse)').matches;
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.25 : 2));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x07080e);
    this.scene.fog = new THREE.Fog(0x07080e, 18, 36);   // 依鏡頭距離在 resize 裡調整
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camDir = new THREE.Vector3(0, 0.82, 0.57).normalize();
    this.camLook = new THREE.Vector3();
    // 夜晚：環境光和月光都壓得很暗，主要靠手電筒看路（殭屍的發光眼睛在黑暗裡最先被看到）
    this.scene.add(new THREE.HemisphereLight(0x7f8fcf, 0x1a1626, 0.24));
    const sun = new THREE.DirectionalLight(0xbfcaff, 0.2);
    sun.castShadow = !this.mobile; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0015;
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
    this.scene.add(sun, sun.target); this.sun = sun;
    // 手電筒：從角色胸口往面向的方向照，廢墟會擋住光（有陰影）
    this.flash = new THREE.SpotLight(0xfff0d0, 3.2, 13, 0.6, 0.5, 1.1);
    this.flash.castShadow = true; this.flash.shadow.mapSize.set(512, 512); this.flash.shadow.bias = -0.002;
    Object.assign(this.flash.shadow.camera, { near: 0.3, far: 13 });
    this.scene.add(this.flash, this.flash.target);
    // 角色身邊一小圈微光：背後也看得到自己和貼身的殭屍
    this.pLight = new THREE.PointLight(0xffc48a, 0.55, 3.6, 1.6); this.scene.add(this.pLight);
    // 即時光源只留這 4 個（環境、月光、手電筒、身邊微光）：每多一個光源，每個像素都要多算一次，手機最吃這個。
    // 無線電燈光、直升機探照燈改用「地面發光貼圖」假裝，看起來差不多、幾乎不花效能。
    const gc = document.createElement('canvas'); gc.width = gc.height = 64; const gg = gc.getContext('2d');
    const grd = gg.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(gc);
    this.makeArena(); this.makeShared(); this.makePlayer(); this.makePools(); this.makeOverlay(); this.makeRadio(); this.makeHeli();
    // 霧團貼圖：柔邊圓形
    const fc = document.createElement('canvas'); fc.width = fc.height = 64; const fg = fc.getContext('2d');
    const gr = fg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(190,200,230,0.9)'); gr.addColorStop(1, 'rgba(190,200,230,0)');
    fg.fillStyle = gr; fg.fillRect(0, 0, 64, 64);
    const ft = new THREE.CanvasTexture(fc); this.mist = [];
    for (let k = 0; k < 34; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, transparent: true, opacity: 0.1 + Math.random() * 0.08, depthWrite: false, fog: false }));
      const a = Math.random() * 6.283, r = 6 + Math.random() * 10, s = 4 + Math.random() * 4;
      sp.position.set(Math.cos(a) * r, 0.5 + Math.random() * 0.8, Math.sin(a) * r); sp.scale.set(s, s * 0.55, 1);
      sp.userData = { vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4 };
      this.scene.add(sp); this.mist.push(sp);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this.portrait = h > w; Game.portrait = this.portrait;
    this.camDir.set(this.portrait ? 0.57 : 0, 0.82, this.portrait ? 0 : 0.57).normalize();
    const want = this.portrait ? 12 : 19;
    const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * this.cam.aspect);
    this.camDist = clamp((want / 2) / Math.tan(hf / 2), 11, 28);
    this.scene.fog.near = this.camDist * 0.9; this.scene.fog.far = this.camDist * 1.55;   // 畫面上緣（遠處）漸漸沒入霧裡
    UI.sizeMinimap && UI.sizeMinimap();
  },

  makeArena() {
    // 地板：整張地圖一張貼圖（每局重畫，見 paintFloor），不會有重複貼圖的感覺
    this.floorCv = document.createElement('canvas'); this.floorCv.width = C * 32; this.floorCv.height = R * 32;
    this.floorTex = new THREE.CanvasTexture(this.floorCv); this.floorTex.anisotropy = 4;
    // 地板切成每格一塊：Lambert 是逐頂點打光，切細了玩家身邊的暖光才照得到地板
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C, R, C, R), phong({ map: this.floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), phong({ color: 0x14161f }));
    out.rotation.x = -Math.PI / 2; out.position.y = -0.02; this.scene.add(out);
    // 外牆：磚牆＋上緣鐵絲網的柱子，壓暗配合霧氣
    const wm = phong({ color: 0x4a3c3e }), wt = phong({ color: 0x5c4c4e }), pm = phong({ color: 0x3a3d48 });
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wm); m.position.set(x, 0.55, z); m.castShadow = m.receiveShadow = true; this.scene.add(m);
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.08, d + 0.1), wt); t.position.set(x, 1.12, z); this.scene.add(t);
    };
    mk(C + 2, 1, 0, -R / 2 - 0.5); mk(C + 2, 1, 0, R / 2 + 0.5); mk(1, R, -C / 2 - 0.5, 0); mk(1, R, C / 2 + 0.5, 0);
    const posts = [];
    for (let x = -C / 2 - 0.5; x <= C / 2 + 0.5; x += 4) posts.push([x, -R / 2 - 0.5], [x, R / 2 + 0.5]);
    for (let z = -R / 2 + 3.5; z < R / 2; z += 4) posts.push([-C / 2 - 0.5, z], [C / 2 + 0.5, z]);
    const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), pm, posts.length), mt = new THREE.Matrix4();
    posts.forEach(([x, z], k) => { mt.makeTranslation(x, 1.6, z); pi.setMatrixAt(k, mt); });
    this.scene.add(pi);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.03; this.scene.add(this.marker);
  },
  /** 廢墟：用 InstancedMesh 一次畫完，高低、顏色各不同 */
  /** 每局重建：廢墟（三種造型）、沙包矮牆、地上碎石、地板貼圖。全部用 InstancedMesh，一種造型一次畫完 */
  buildRocks() {
    for (const m of this.envMeshes || []) { this.scene.remove(m); m.dispose && m.dispose(); }
    this.envMeshes = [];
    if (!this.envGeo) this.envGeo = { ruins: ruinGeos(), sand: sandbagGeo(), rubble: rubbleGeo(), weed: weedGeo(), mat: phong({ vertexColors: true }) };
    const E = this.envGeo, mat = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const inst = (geo, list, shadow) => {
      const m = new THREE.InstancedMesh(geo, E.mat, Math.max(1, list.length));
      list.forEach((o, k) => { q.setFromAxisAngle(up, o.rot); mat.compose(o.pos, q, o.scale); m.setMatrixAt(k, mat); m.setColorAt(k, o.col); });
      m.count = list.length; m.castShadow = shadow; m.receiveShadow = true;
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m); this.envMeshes.push(m);
    };
    // 廢墟：高度不要太高（0.5–1.2），免得擋住角色；顏色在冷灰之間變化
    const ruins = [[], [], []];
    for (let i = 0; i < N; i++) {
      if (!Grid.rock[i]) continue;
      const h = 0.5 + hash01(i, 7) * 0.7, [x, z] = W2(ix(i) + 0.5, iy(i) + 0.5), v = hash01(i, 11);
      ruins[v < 0.55 ? 0 : v < 0.85 ? 1 : 2].push({ pos: new THREE.Vector3(x, 0, z), rot: (hash01(i, 13) * 4 | 0) * Math.PI / 2,
        scale: new THREE.Vector3(0.98, h, 0.98), col: new THREE.Color().setHSL(0.6 + hash01(i, 3) * 0.08, 0.1, 0.24 + hash01(i, 5) * 0.08) });
    }
    ruins.forEach((list, k) => inst(E.ruins[k], list, true));
    // 矮牆：沙包，比廢墟矮很多，一看就知道翻得過去；沿著牆的方向轉
    const sand = [];
    for (let i = 0; i < N; i++) {
      if (!Grid.low[i]) continue;
      const [x, z] = W2(ix(i) + 0.5, iy(i) + 0.5), x0 = ix(i), y0 = iy(i);
      const horiz = (inB(x0 - 1, y0) && Grid.low[idx(x0 - 1, y0)]) || (inB(x0 + 1, y0) && Grid.low[idx(x0 + 1, y0)]);
      sand.push({ pos: new THREE.Vector3(x, 0, z), rot: (horiz ? 0 : Math.PI / 2) + (hash01(i, 9) - 0.5) * 0.12,
        scale: new THREE.Vector3(1, 0.95 + hash01(i, 4) * 0.15, 1), col: new THREE.Color().setHSL(0.1, 0.28, 0.5 + hash01(i, 9) * 0.08) });
    }
    inst(E.sand, sand, true);
    // 碎石：撒在廢墟旁邊的空地上（純裝飾，不擋路）
    const rub = [];
    for (let i = 0; i < N; i++) {
      if (Grid.rock[i] || Grid.low[i] || hash01(i, 21) > 0.5) continue;
      let near = 0; for (const [dx, dy] of DIR4) { const x = ix(i) + dx, y = iy(i) + dy; if (inB(x, y) && Grid.rock[idx(x, y)]) near++; }
      if (!near) continue;
      const [x, z] = W2(ix(i) + 0.2 + hash01(i, 22) * 0.6, iy(i) + 0.2 + hash01(i, 23) * 0.6);
      rub.push({ pos: new THREE.Vector3(x, 0, z), rot: hash01(i, 24) * 6.28, scale: new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + hash01(i, 25) * 0.6),
        col: new THREE.Color().setHSL(0.62, 0.08, 0.42 + hash01(i, 26) * 0.1) });
    }
    inst(E.rubble, rub, false);
    // 雜草：從裂縫和廢墟腳邊長出來
    const weeds = [];
    for (let i = 0; i < N; i++) {
      if (Grid.rock[i] || Grid.low[i] || hash01(i, 41) > 0.16) continue;
      const [x, z] = W2(ix(i) + hash01(i, 42), iy(i) + hash01(i, 43));
      weeds.push({ pos: new THREE.Vector3(x, 0, z), rot: hash01(i, 44) * 6.28, scale: new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + hash01(i, 45) * 0.8),
        col: new THREE.Color().setHSL(0.22 + hash01(i, 46) * 0.06, 0.3, 0.3 + hash01(i, 47) * 0.1) });
    }
    inst(E.weed, weeds, false);
    this.paintFloor();
  },
  /** 地板：城市廢墟的地面（柏油、碎掉的水泥板、泥土、雜草、褪色的道路標線、水窪、人孔蓋），不畫格線。
   *  每局重畫一次；地形（廢墟、沙包）旁邊畫接觸陰影和灰塵，讓它們「站」在地上。 */
  paintFloor() {
    const S = 32, g = this.floorCv.getContext('2d'), W = C * S, H = R * S, rnd01 = Math.random;
    const blot = (x, y, r, c, sy = 1) => { g.save(); g.translate(x, y); g.scale(1, sy); const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore(); };
    /** 低解析度亂數 → 放大（平滑），做出大片、不規則的明暗變化 */
    const noise = (cols, rows, alpha, col) => {
      const c = document.createElement('canvas'); c.width = cols; c.height = rows; const cg = c.getContext('2d');
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { cg.fillStyle = `rgba(${col},${(rnd01() * alpha).toFixed(3)})`; cg.fillRect(x, y, 1, 1); }
      g.imageSmoothingEnabled = true; g.drawImage(c, 0, 0, W, H);
    };
    g.fillStyle = '#252836'; g.fillRect(0, 0, W, H);
    noise(14, 10, 0.5, '12,13,20'); noise(14, 10, 0.18, '120,125,140'); noise(60, 45, 0.22, '8,9,14');
    // 碎掉的水泥板：不規則的多邊形，比柏油亮一點，接縫歪歪的（不跟格子對齊）
    for (let k = 0; k < 14; k++) {
      const cx = rnd01() * W, cy = rnd01() * H, rad = 60 + rnd01() * 140, n = 6 + (rnd01() * 4 | 0), rot = rnd01() * 6.28;
      g.beginPath();
      for (let j = 0; j < n; j++) { const a = rot + j / n * 6.283, r = rad * (0.6 + rnd01() * 0.5); g[j ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fillStyle = `rgba(78,82,96,${0.25 + rnd01() * 0.2})`; g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(10,11,18,.45)'; g.lineWidth = 2; g.translate(cx, cy); g.rotate(rot);
      for (let d = -rad; d < rad; d += 38 + rnd01() * 30) { g.beginPath(); g.moveTo(d, -rad); g.lineTo(d + (rnd01() - 0.5) * 12, rad); g.stroke(); }
      for (let d = -rad; d < rad; d += 38 + rnd01() * 30) { g.beginPath(); g.moveTo(-rad, d); g.lineTo(rad, d + (rnd01() - 0.5) * 12); g.stroke(); }
      g.restore();
    }
    // 褪色的道路：一條橫、一條直，標線斷斷續續（被廢墟壓過去也沒關係，像原本的街道）
    const road = (hor, at) => {
      g.save(); g.fillStyle = 'rgba(16,17,24,.4)';
      if (hor) g.fillRect(0, at - S * 1.6, W, S * 3.2); else g.fillRect(at - S * 1.6, 0, S * 3.2, H);
      const len = hor ? W : H;
      for (let d = 0; d < len; d += 46) {
        if (rnd01() < 0.3) continue;                                  // 磨掉的
        g.fillStyle = `rgba(214,190,110,${0.12 + rnd01() * 0.14})`;
        if (hor) g.fillRect(d, at - 2, 26, 4); else g.fillRect(at - 2, d, 4, 26);
      }
      g.fillStyle = 'rgba(200,205,215,.07)';
      for (let d = 0; d < len; d += 8) { if (rnd01() < 0.25) continue; if (hor) { g.fillRect(d, at - S * 1.5, 8, 2); g.fillRect(d, at + S * 1.5, 8, 2); } else { g.fillRect(at - S * 1.5, d, 2, 8); g.fillRect(at + S * 1.5, d, 2, 8); } }
      g.restore();
    };
    const ry = (R * (0.2 + rnd01() * 0.2)) * S, rx = (C * (0.62 + rnd01() * 0.2)) * S;
    road(true, ry); road(false, rx);
    g.fillStyle = 'rgba(200,205,215,.09)';                            // 路口的斑馬線
    for (let k = -3; k <= 3; k++) g.fillRect(rx + S * 2, ry + k * 12 - 4, S * 1.2, 7);
    // 泥土、水窪、油污、屍水
    for (let k = 0; k < 18; k++) blot(rnd01() * W, rnd01() * H, 40 + rnd01() * 90, 'rgba(70,56,40,.28)', 0.6 + rnd01() * 0.6);
    for (let k = 0; k < 10; k++) { const x = rnd01() * W, y = rnd01() * H, r = 18 + rnd01() * 36; blot(x, y, r, 'rgba(8,14,30,.65)', 0.55); blot(x - r * 0.2, y - r * 0.1, r * 0.5, 'rgba(120,140,190,.08)', 0.4); }
    for (let k = 0; k < 14; k++) blot(rnd01() * W, rnd01() * H, 20 + rnd01() * 50, 'rgba(5,6,10,.45)', 0.7);
    for (let k = 0; k < 6; k++) blot(rnd01() * W, rnd01() * H, 16 + rnd01() * 26, 'rgba(60,80,30,.25)', 0.8);
    // 柏油顆粒
    for (let k = 0; k < 14000; k++) { g.fillStyle = rnd01() < 0.5 ? 'rgba(190,195,215,.05)' : 'rgba(0,0,0,.2)'; g.fillRect(rnd01() * W, rnd01() * H, 1.5, 1.5); }
    // 裂縫：會分岔的折線
    g.strokeStyle = 'rgba(6,7,12,.6)'; g.lineCap = 'round';
    const crack = (x, y, a, w, depth) => {
      g.beginPath(); g.moveTo(x, y); g.lineWidth = w;
      const n = 5 + rnd01() * 7;
      for (let j = 0; j < n; j++) {
        a += (rnd01() - 0.5) * 1.1; x += Math.cos(a) * 12; y += Math.sin(a) * 12; g.lineTo(x, y);
        if (depth < 2 && rnd01() < 0.18) { g.stroke(); crack(x, y, a + (rnd01() < 0.5 ? 1 : -1) * (0.6 + rnd01()), w * 0.6, depth + 1); g.beginPath(); g.moveTo(x, y); g.lineWidth = w; }
      }
      g.stroke();
    };
    for (let k = 0; k < 40; k++) crack(rnd01() * W, rnd01() * H, rnd01() * 6.28, 1.6 + rnd01() * 1.4, 0);
    // 人孔蓋
    for (let k = 0; k < 4; k++) {
      const x = rnd01() * W, y = rnd01() * H;
      g.fillStyle = 'rgba(30,32,40,.9)'; g.beginPath(); g.arc(x, y, 11, 0, 6.283); g.fill();
      g.strokeStyle = 'rgba(110,115,130,.35)'; g.lineWidth = 2; g.stroke();
      g.beginPath(); for (let d = -6; d <= 6; d += 4) { g.moveTo(x - 8, y + d); g.lineTo(x + 8, y + d); } g.stroke();
    }
    // 無線電旁：直升機停機坪（救援直升機會降在這裡）
    const [hx, hy] = [(RADIO.x + 2.5) * S, RADIO.y * S];
    g.strokeStyle = 'rgba(230,220,160,.22)'; g.lineWidth = 5; g.beginPath(); g.arc(hx, hy, S * 1.9, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(230,220,160,.2)'; g.font = `900 ${S * 1.9}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', hx, hy + 2);
    // 地形腳邊：灰塵＋接觸陰影
    for (let i = 0; i < N; i++) {
      const x = (ix(i) + 0.5) * S, y = (iy(i) + 0.5) * S;
      if (Grid.rock[i]) { blot(x, y, S * 1.5, 'rgba(110,112,125,.12)'); blot(x, y, S * 1.05, 'rgba(3,4,8,.6)'); }
      else if (Grid.low[i]) blot(x, y, S * 0.8, 'rgba(3,4,8,.4)');
    }
    this.floorTex.needsUpdate = true;
  },
  makeRadio() {
    const g = new THREE.Group(), L = c => phong({ color: c });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), L(0x45506b)); base.position.y = 0.25; base.castShadow = true; g.add(base);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 6), L(0xb7bccb)); mast.position.set(0.3, 1.5, 0); mast.castShadow = true; g.add(mast);
    this.radioLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 })); this.radioLight.position.set(0.3, 2.75, 0); g.add(this.radioLight);
    this.radioZone = new THREE.Mesh(new THREE.RingGeometry(CFG.EVAC.radius - 0.08, CFG.EVAC.radius, 64), new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0, depthWrite: false }));
    this.radioZone.rotation.x = -Math.PI / 2; this.radioZone.position.y = 0.03; g.add(this.radioZone);
    this.radioBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.radioBeam.position.y = 7; g.add(this.radioBeam);
    // 無線電旁的細節：發電機、電線、小桌，讓它像一個據點
    const gen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.45), L(0x6b5a3a)); gen.position.set(-0.9, 0.22, 0.3); gen.castShadow = true; g.add(gen);
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.05), L(0x2a3040)); pnl.position.set(-0.05, 0.42, 0.46); g.add(pnl);
    this.radioLeds = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0x6fdc8c })); this.radioLeds.position.set(-0.05, 0.48, 0.49); g.add(this.radioLeds);
    // 撿到的零件會一個個裝到無線電上（看得到進度）
    const slots = [[0.3, 0.55, -0.25], [-0.35, 0.5, -0.1], [0, 0.5, 0.15], [-0.4, 0.5, 0.25], [0.35, 0.52, 0.25], [-0.05, 0.5, -0.3]];
    this.radioParts = slots.map((p, k) => { const m = new THREE.Mesh(partGeo(k), this.zMat); m.position.set(...p); m.scale.setScalar(0.75); m.visible = false; g.add(m); return m; });
    const [x, z] = W2(RADIO.x, RADIO.y); g.position.set(x, 0, z); this.scene.add(g);
    this.rGlow = this.glowDecal(0xff5040, 7); this.rGlow.position.set(x + 0.3, 0.04, z);
  },
  makeShared() {
    const L = c => phong({ color: c });
    this.G = {
      leg: new THREE.BoxGeometry(0.13, 0.3, 0.13), torso: new THREE.BoxGeometry(0.38, 0.34, 0.24),
      head: new THREE.BoxGeometry(0.36, 0.33, 0.33), hair: new THREE.BoxGeometry(0.38, 0.12, 0.35),
      arm: new THREE.BoxGeometry(0.1, 0.1, 0.36), bar: new THREE.PlaneGeometry(0.6, 0.07),
      cone: new THREE.ConeGeometry(0.09, 0.22, 6), cube: new THREE.BoxGeometry(1, 1, 1), part: new THREE.BoxGeometry(0.07, 0.07, 0.07),
      crate: new THREE.BoxGeometry(0.36, 0.3, 0.36), torus: new THREE.TorusGeometry(0.22, 0.07, 8, 16),
      beam: new THREE.CylinderGeometry(0.22, 0.22, 12, 12, 1, true), ring: new THREE.RingGeometry(0.4, 0.5, 24),
    };
    this.M = {
      jeans: L(0x3c4f7a), skin: L(0x93ad6c), hair: L(0x2a2522),
      shirt: { rusher: L(0xd9483f), pathfinder: L(0xf0c94a), breaker: L(0x9b62d9), vaulter: L(0x34d1c0) },
      stuck: new THREE.MeshBasicMaterial({ color: 0xffd34d }), dust: new THREE.MeshBasicMaterial({ color: 0xd8dbe4 }),
      obstacle: L(0x3a3f52), stripe: L(0xe9a23b),
      barBg: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }),
      barFg: new THREE.MeshBasicMaterial({ color: 0x7be08f, depthTest: false }),
      alert: new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
      wall: L(0x9aa0ae), wallTop: L(0x7d8393), turretBase: L(0x39445c), turret: L(0x4d9bf0), barrel: L(0xcfe4ff),
      trap: L(0xa8713f), spike: L(0x5a3a1f), bait: L(0xb8452f), meatFat: L(0xe9a48c), bone: L(0xf1e9d6),
      blood: new THREE.MeshBasicMaterial({ color: 0x6cff5a }), gold: new THREE.MeshBasicMaterial({ color: 0xf2cb52 }),
      crate: L(0xc89a3c), crateTop: L(0xf2cb52), partM: new THREE.MeshBasicMaterial({ color: 0x5fe0ff }),
      beam: new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      goldRing: new THREE.MeshBasicMaterial({ color: 0xf2cb52, transparent: true, opacity: 0.45, depthWrite: false }),
    };
    this.zMat = glowMaterial();     // 所有殭屍、玩家、道具共用一個材質（頂點顏色）
    this.obsGeo = obstacleGeo(); this.trapGeo = trapGeo();
    // 殭屍腳下的圓形陰影：全部殭屍一次畫完（比讓每隻殭屍投射真陰影便宜很多）
    const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sg = sc.getContext('2d');
    const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(0.6, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
    const bg = new THREE.PlaneGeometry(1, 1); bg.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }), MAX_BLOBS);
    this.blobs.count = 0; this.blobs.frustumCulled = false; this.blobs.renderOrder = 1; this.scene.add(this.blobs);
  },
  makeZombie(z) {
    // 身體一個 mesh，手腳各掛在關節上（共 5 次繪製）。殭屍不投射真陰影，改用腳下的圓形陰影（blobs）
    const G = this.G, M = this.M, L = ZOMBIE_LOOK[z.type], geo = zombieGeos(z.type), g = new THREE.Group(); g.rotation.order = 'YXZ';
    const body = new THREE.Group(); g.add(body);
    const torso = new THREE.Group(); torso.position.y = L.legLen; body.add(torso);     // 上半身以髖部為軸往前彎
    const tm = new THREE.Mesh(geo.body, this.zMat); tm.position.y = -L.legLen; torso.add(tm);
    const joint = (parent, mesh, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); p.add(mesh); parent.add(p); return p; };
    const l1 = joint(body, new THREE.Mesh(geo.leg, this.zMat), 0.1 * L.w, L.legLen), l2 = joint(body, new THREE.Mesh(geo.leg, this.zMat), -0.1 * L.w, L.legLen);
    const sh = 0.3, sx = 0.25 * L.w;    // 肩膀：軀幹頂端往下一點
    const a1 = joint(torso, new THREE.Mesh(geo.armR, this.zMat), sx, sh), a2 = joint(torso, new THREE.Mesh(geo.armL, this.zMat), -sx, sh);
    torso.rotation.x = L.lean;
    const s = z.def.scale; body.scale.setScalar(s);
    const alert = new THREE.Mesh(G.cone, M.alert); alert.rotation.x = Math.PI; alert.position.y = 1.4 * s; alert.visible = false; g.add(alert);
    this.scene.add(g);
    return { g, body, torso, l1, l2, a1, a2, alert, look: L, phase: Math.random() * 6, hop: 0 };
  },
  makePlayer() {
    // 跑酷者：身體一個 mesh，手腳掛在關節上擺動（模型在 models.js）
    const geo = playerGeos(), g = new THREE.Group();
    const bm = new THREE.Mesh(geo.body, this.zMat); bm.castShadow = true; g.add(bm);
    const limb = (x, y, lg) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); const m = new THREE.Mesh(lg, this.zMat); m.castShadow = true; piv.add(m); g.add(piv); return piv; };
    const legL = limb(0.08, 0.3, geo.leg), legR = limb(-0.08, 0.3, geo.leg);
    const armL = limb(0.21, 0.6, geo.arm), armR = limb(-0.21, 0.6, geo.arm);
    this.scene.add(g);
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    wave.rotation.x = -Math.PI / 2; wave.position.y = 0.06; this.scene.add(wave);
    const ready = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.47, 32), new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0, depthWrite: false }));
    ready.rotation.x = -Math.PI / 2; ready.position.y = 0.04; this.scene.add(ready);
    this.P = { g, armL, armR, legL, legR, wave, ready, runPh: 0 };
  },
  makePools() {
    for (let k = 0; k < 90; k++) { const m = new THREE.Mesh(this.G.part, this.M.blood); m.visible = false; this.scene.add(m); this.parts.push({ m, t: 0, vx: 0, vy: 0, vz: 0 }); }
    for (let k = 0; k < 14; k++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0 }));
      this.scene.add(l); this.shots.push({ l, t: 0 });
    }
    const pg = new THREE.Group();
    const tor = new THREE.Group(); tor.position.y = 0.55; pg.add(tor);
    const kinds = Array.from({ length: 6 }, (_, k) => { const m = new THREE.Mesh(partGeo(k), this.zMat); m.scale.setScalar(1.6); m.position.y = -0.15; m.visible = false; tor.add(m); return m; });
    const beam = new THREE.Mesh(this.G.beam, this.M.beam); beam.position.y = 6; pg.add(beam);
    const ring = new THREE.Mesh(this.G.ring, new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.6, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; pg.add(ring);
    pg.visible = false; this.scene.add(pg); this.partMesh = { g: pg, tor, ring, kinds };
  },
  makeOverlay() {
    this.ovCv = document.createElement('canvas'); this.ovCv.width = C * 8; this.ovCv.height = R * 8;
    this.ovTex = new THREE.CanvasTexture(this.ovCv); this.ovTex.magFilter = THREE.NearestFilter;
    this.ov = new THREE.Mesh(new THREE.PlaneGeometry(C, R), new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthWrite: false }));
    this.ov.rotation.x = -Math.PI / 2; this.ov.position.y = 0.015; this.ov.visible = false; this.scene.add(this.ov);
  },
  drawOverlay() {
    const g = this.ovCv.getContext('2d'); g.clearRect(0, 0, C * 8, R * 8);
    let hm = 0; for (let i = 0; i < N; i++) hm = Math.max(hm, Memory.heat(i));
    for (let i = 0; i < N; i++) {
      const d = Memory.danger[i], h = hm ? Memory.heat(i) / hm : 0;
      if (h > 0.06) { g.fillStyle = `rgba(190,90,255,${Math.min(0.75, 0.15 + h * 0.7)})`; g.fillRect(ix(i) * 8, iy(i) * 8, 8, 8); }
      if (d > 0.1) { g.fillStyle = `rgba(255,60,50,${Math.min(0.7, 0.12 + d * 0.1)})`; g.fillRect(ix(i) * 8, iy(i) * 8, 8, 8); }
      if (Memory.stuck[i] > 0.2) { g.fillStyle = `rgba(255,190,60,${Math.min(0.8, 0.3 + Memory.stuck[i] * 0.15)})`; g.fillRect(ix(i) * 8, iy(i) * 8, 8, 8); }
    }
    this.ovTex.needsUpdate = true;
  },
  makeStructure(type) {
    const G = this.G, M = this.M, g = new THREE.Group(), add = (mat, sx, sy, sz, y, p = g) => { const m = new THREE.Mesh(G.cube, mat); m.scale.set(sx, sy, sz); m.position.y = y; m.castShadow = m.receiveShadow = true; p.add(m); return m; };
    const o = { g, type };
    if (type === 'obstacle') {           // 施工路障：玩家跨得過的高度；被拆時整個被壓扁
      o.body = new THREE.Group(); g.add(o.body);
      const m = new THREE.Mesh(this.obsGeo, this.zMat); m.castShadow = m.receiveShadow = true; o.body.add(m);
    } else if (type === 'trap') {        // 捕獸夾
      const m = new THREE.Mesh(this.trapGeo, this.zMat); m.receiveShadow = true; g.add(m);
    } else {
      // 一塊帶骨的肉
      o.ball = new THREE.Group(); o.ball.position.y = 0.25; g.add(o.ball);
      const meat = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), M.bait); meat.scale.set(1.25, 0.8, 1); meat.castShadow = true; o.ball.add(meat);
      const fat = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M.meatFat); fat.position.set(0.08, 0.1, 0.1); o.ball.add(fat);
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), M.bone); bone.rotation.z = Math.PI / 2; bone.position.x = 0.36; o.ball.add(bone);
      for (const dz of [-0.05, 0.05]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), M.bone); k.position.set(0.53, 0, dz); o.ball.add(k); }
    }
    this.scene.add(g); return o;
  },
  makeScrap() {
    const g = new THREE.Group(), G = this.G, M = this.M;
    const a = new THREE.Mesh(G.crate, M.crate); a.position.y = 0.15; a.castShadow = true; g.add(a);
    const b = new THREE.Mesh(G.crate, M.crateTop); b.scale.setScalar(0.7); b.position.set(0.06, 0.4, 0.04); b.rotation.y = 0.5; b.castShadow = true; g.add(b);
    const ring = new THREE.Mesh(G.ring, M.goldRing); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    this.scene.add(g); return { g, b, ring };
  },
  burst(x, y, mat, n, up) {
    for (let k = 0; k < n; k++) {
      const p = this.parts.find(q => q.t <= 0); if (!p) break;
      const a = Math.random() * 6.28, s = 1 + Math.random() * 2.5, [wx, wz] = W2(x, y);
      p.t = 0.6; p.m.material = mat; p.m.visible = true; p.m.position.set(wx, 0.5, wz);
      p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = up + Math.random() * 2;
    }
  },

  bindFX() {
    FX.hit = (z, dir) => {
      if (Feel.shake) this.shake = Math.max(this.shake, 0.12);
      if (!Feel.hitfx) return;
      const [wx, wz] = W2(z.x, z.y);
      for (let k = 0; k < 7; k++) {
        const p = this.parts.find(q => q.t <= 0); if (!p) break;
        const a = (dir ?? Math.random() * 6.28) + (Math.random() - 0.5) * 1.6, s = 2 + Math.random() * 3;
        p.t = 0.45; p.m.material = this.M.dust; p.m.visible = true; p.m.position.set(wx, 0.6, wz);
        p.vx = Math.cos(a) * s; p.vz = Math.sin(a) * s; p.vy = 1.5 + Math.random() * 2.5;
      }
    };
    // 殭屍殺不死：跟丟你之後慢慢沉進地面散掉
    FX.despawn = z => { const o = this.zMap.get(z.id); if (!o) return; this.zMap.delete(z.id); o.alert.visible = false; this.corpses.push({ o, t: 0 }); };
    FX.stuck = () => {};
    FX.vault = e => { if (Feel.hitfx) this.burst(e.x, e.y, this.M.dust, 4, 1); };
    FX.boost = e => { if (Feel.hitfx) this.burst(e.x, e.y, this.M.dust, 6, 1.5); };
    FX.hurt = () => {
      if (Feel.shake) this.shake = Math.max(this.shake, 0.35);
      const f = document.getElementById('flash'); f.style.transition = 'none'; f.style.opacity = '1';
      requestAnimationFrame(() => { f.style.transition = 'opacity .45s'; f.style.opacity = '0'; });
    };
    FX.shove = () => { this.P.waveVis = 1; if (Feel.shake) this.shake = Math.max(this.shake, 0.2); };
    FX.broke = () => { if (Feel.shake) this.shake = Math.max(this.shake, 0.18); };
    FX.pickup = s => { this.burst(s.x, s.y, this.M.gold, 8, 2); UI.msg(Game.materials >= CFG.MAX_MATERIALS ? tr('msg.full') : tr('msg.pickup', { n: s.value })); };
    FX.part = (p, n) => { this.burst(p.x, p.y, this.M.partM, 16, 3); if (n < CFG.PARTS.goal) UI.msg(tr('msg.part', { part: tr('part.' + ((n - 1) % 6)), n, goal: CFG.PARTS.goal })); if (Feel.slowmo) Game.slowT = 0.35; };
    FX.horde = (dir, warn) => {
      const d = this.dirName(dir);
      UI.alarm(tr(warn ? 'horde.warn' : 'horde.go', { dir: d }));
      UI.hordeDir = dir; UI.hordeFlash = warn ? CFG.HORDE.warn + 4 : 4;
    };
    FX.report = (n, lines) => { UI.showReport(n, lines); this.drawOverlay(); };
    FX.broke = () => { if (Feel.shake) this.shake = Math.max(this.shake, 0.15); };
    FX.evac = k => { UI.alarm(tr(k === 'start' ? 'evac.start' : 'evac.pickup')); if (Feel.shake) this.shake = 0.3; };
    FX.msg = m => UI.msg(m);
    // 結束：贏了先看直升機把你載走，輸了停一下再出結算
    FX.over = win => {
      if (win) { this.boarded = true; this.heliLeaveT = 0; }
      clearTimeout(this.overTimer); this.overTimer = setTimeout(() => UI.over(win), win ? 2800 : 900);
    };
  },
  /** 地面發光貼圖（假光源）：加法混合的圓形漸層 */
  glowDecal(color, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2; this.scene.add(m); return m;
  },
  /* ---------- 救援直升機：倒數最後 10 秒飛進來、降落等你、你上機後飛走 ---------- */
  makeHeli() {
    const geo = heliGeos(), g = new THREE.Group();
    const body = new THREE.Mesh(geo.body, this.zMat); body.castShadow = true; g.add(body);
    const rotor = new THREE.Mesh(geo.rotor, this.zMat); rotor.position.y = 1.78; g.add(rotor);
    const tail = new THREE.Mesh(geo.tail, this.zMat); tail.position.set(0.08, 1.45, -2.7); g.add(tail);
    g.visible = false; this.scene.add(g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.6, 1, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.visible = false; this.scene.add(beam);
    const spot = this.glowDecal(0xe8f4ff, 4.5); spot.visible = false;
    const [hx, hz] = W2(RADIO.x + 2.5, RADIO.y);
    this.heli = { g, rotor, tail, beam, spot, pad: new THREE.Vector3(hx, 0, hz), from: new THREE.Vector3(hx - 34, 9, hz - 26) };
  },
  resetEvac() {
    this.boarded = false; this.heliLeaveT = undefined; clearTimeout(this.overTimer);
    this.heli.g.visible = false; this.heli.beam.visible = this.heli.spot.visible = false;
  },
  updateHeli(real, t) {
    const H = this.heli, ev = Game.evac, ease = k => 1 - Math.pow(1 - k, 3);
    let pos = null, show = true;
    if (this.boarded) {                                   // 上機了：爬升、往遠處飛走
      this.heliLeaveT += real;
      const k = Math.min(1, this.heliLeaveT / 3);
      pos = H.pad.clone().add(new THREE.Vector3(18 * k * k, 1.2 + 9 * k, -22 * k * k));
      H.g.rotation.x = -0.25 * Math.min(1, k * 3);
    } else if (ev === 'pickup') {                         // 降落在停機坪等你
      H.landT = Math.min(1, (H.landT || 0) + real / 2);
      pos = H.pad.clone(); pos.y = 4.5 * (1 - ease(H.landT)) + Math.sin(t * 3) * 0.04;
      H.g.rotation.x = 0;
    } else if (ev === 'active' && Game.evacT < 10) {      // 從遠處飛進來
      const k = ease(1 - Game.evacT / 10); H.landT = 0;
      pos = H.from.clone().lerp(new THREE.Vector3(H.pad.x, 4.5, H.pad.z), k);
      H.g.rotation.x = 0.18 * (1 - k);
    } else show = false;
    H.g.visible = show;
    H.beam.visible = H.spot.visible = show;
    if (!show) return;
    H.g.position.copy(pos);
    H.g.rotation.y = Math.atan2(H.pad.x - H.from.x, H.pad.z - H.from.z);
    H.rotor.rotation.y += real * 26; H.tail.rotation.x += real * 30;
    // 探照燈：從機頭往下的光柱＋地上的光圈
    H.beam.position.set(pos.x, (pos.y + 0.8) / 2, pos.z); H.beam.scale.set(1, pos.y + 0.8, 1);
    H.spot.position.set(pos.x, 0.05, pos.z); H.spot.material.opacity = 0.55 + Math.sin(t * 9) * 0.05;
    if (pos.y < 3 && Math.random() < 0.6) {               // 螺旋槳把地上的灰塵吹起來
      const a = Math.random() * 6.283, r = 1.5 + Math.random() * 1.5;
      this.burst(RADIO.x + 2.5 + Math.cos(a) * r, RADIO.y + Math.sin(a) * r, this.M.dust, 1, 0.6);
    }
    if (pos.y < 2.5 && Feel.shake) this.shake = Math.max(this.shake, 0.04);
  },
  /** 邏輯方向 → 螢幕上的方位文字（直向時地圖轉了 90°） */
  dirName(a) {
    const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return tr('dir.' + ((k + (this.portrait ? 2 : 0)) % 8));
  },

  sync(dt, real) {
    const Pd = Game.player, P = this.P, t = performance.now() / 1000;
    const [px, pz] = W2(Pd.x, Pd.y);
    P.hop = (P.hop || 0) + ((Pd.vaulting ? 0.34 : 0) - (P.hop || 0)) * Math.min(1, real * 14);
    P.g.position.set(px, P.hop + (Math.hypot(Pd.vx, Pd.vy) > 0.5 ? Math.abs(Math.sin(t * 14)) * 0.05 : 0), pz);
    P.yaw = P.yaw === undefined ? yawOf(Pd.face) : lerpAngle(P.yaw, yawOf(Pd.face), 1 - Math.exp(-(Pd.shoveT > 0 ? 30 : 14) * real));
    P.g.rotation.y = P.yaw;
    P.g.visible = !this.boarded && !(Pd.iframe > 0 && Math.floor(t * 20) % 2 === 0);
    const S = CFG.PLAYER, sk = Pd.shoveT > 0 ? 1 - Pd.shoveT / S.shoveTime : 1;
    // 跑步擺手擺腳；推開時雙手往前推；翻越時收腿
    const spd = Math.hypot(Pd.vx, Pd.vy);
    P.runPh += real * (4 + spd * 4);
    const sw = Math.min(1, spd / 2) * Math.sin(P.runPh) * 0.9;
    P.legL.rotation.x = Pd.vaulting ? -1.1 : sw; P.legR.rotation.x = Pd.vaulting ? -0.4 : -sw;
    if (Pd.shoveT > 0) { const push = -1.5 * Math.sin(sk * Math.PI); P.armL.rotation.x = push; P.armR.rotation.x = push; }
    else { P.armL.rotation.x = -sw * 0.9; P.armR.rotation.x = sw * 0.9; }
    P.wave.position.set(px, 0.06, pz); P.wave.scale.setScalar(0.3 + sk * (S.shoveRange + 0.2));
    P.wave.material.opacity = Pd.shoveT > 0 && P.waveVis ? 0.7 * (1 - sk) : 0;
    P.ready.position.set(px, 0.04, pz);
    P.ready.material.opacity = !S.shoveEnabled ? 0 : Pd.shoveCd <= 0 ? 0.45 + Math.sin(t * 5) * 0.12 : 0.1 * (1 - Pd.shoveCd / S.shoveCd);
    if (Pd.dest) { const [mx, mz] = W2(Pd.dest.x, Pd.dest.y); this.marker.visible = true; this.marker.position.x = mx; this.marker.position.z = mz; this.marker.scale.setScalar(1 + Math.sin(t * 6) * 0.1); }
    else this.marker.visible = false;

    const bm = new THREE.Matrix4(); let nb = 0;
    for (const z of Game.zombies) {
      let o = this.zMap.get(z.id);
      if (!o) { o = this.makeZombie(z); this.zMap.set(z.id, o); }
      const [wx, wz] = W2(z.x, z.y), L = o.look;
      o.hop += ((z.vaulting ? 0.32 : 0) - o.hop) * Math.min(1, real * 14);   // 跨越時往上跳
      o.g.position.set(wx, o.hop, wz);
      o.yaw = o.yaw === undefined ? yawOf(z.dir) : lerpAngle(o.yaw, yawOf(z.dir), 1 - Math.exp(-8 * real * UI.speed));
      o.g.rotation.y = o.yaw;
      o.phase += dt * (z.moving ? z.def.speed * 6 : z.attacking ? 14 : 2);
      // 走路：腳前後擺、手照各型的姿勢往前伸（盲衝伸最長）；攻擊：上半身往前撲、雙手亂抓
      const sw = z.moving ? Math.sin(o.phase) * 0.55 : 0;
      o.l1.rotation.x = sw; o.l2.rotation.x = -sw;
      const arm = z.moving ? Math.sin(o.phase) * 0.3 : Math.sin(o.phase * 0.5) * 0.08;
      o.a1.rotation.x = z.attacking ? L.reach - 0.35 + Math.sin(o.phase) * 0.6 : L.reach - arm;
      o.a2.rotation.x = z.attacking ? L.reach - 0.35 - Math.sin(o.phase) * 0.6 : L.reach + arm * (z.type === 'breaker' ? 0.3 : 1);
      o.torso.rotation.x = L.lean * (z.moving ? 1 : 0.6) + (z.attacking ? 0.22 + Math.sin(o.phase) * 0.08 : 0);
      o.torso.rotation.z = z.waiting ? Math.sin(t * 1.5 + o.phase) * 0.06 : 0;
      o.body.rotation.z = z.moving ? Math.sin(o.phase * 0.5) * 0.08 : 0;
      const f = z.flash > 0 ? 1.18 : 1; o.body.scale.set(z.def.scale * f, z.def.scale / f, z.def.scale * f);
      if (nb < MAX_BLOBS) { const s = z.r * 3 * z.def.scale; bm.makeScale(s, 1, s); bm.setPosition(wx, 0.025, wz); this.blobs.setMatrixAt(nb++, bm); }
      // 頭上標記：紅 = 發現你；黃 = 被障礙卡住
      o.alert.visible = z.alertT > 0 || z.stuckMark > 0 || z.trapMark > 0; o.alert.material = z.alertT > 0 ? this.M.alert : this.M.stuck;
      o.alert.position.y = 1.4 * z.def.scale + Math.sin(t * 12) * 0.05;
      if (z.stuckMark > 0) o.body.position.x = Math.sin(t * 40) * 0.03; else o.body.position.x = 0;
    }
    this.blobs.count = nb; this.blobs.instanceMatrix.needsUpdate = true;
    this.pLight.position.set(px, 1.4, pz);
    // 手電筒跟著角色面向（用畫面上的轉向角度，比較順）
    const fd = Math.PI / 2 - (P.yaw ?? 0), fx = Math.cos(fd), fz = Math.sin(fd);
    this.flash.position.set(px + fx * 0.25, 1.15 + P.hop, pz + fz * 0.25);
    this.flash.target.position.set(px + fx * 6, 0, pz + fz * 6);
    this.flash.intensity = this.boarded ? 0 : 3.2;
    for (let k = this.corpses.length - 1; k >= 0; k--) {
      const c = this.corpses[k], g = c.o.g; c.t += real;
      g.position.y = -c.t * 1.4;
      if (c.t > 0.9) { this.scene.remove(g); this.corpses.splice(k, 1); }
    }
    for (let i = 0; i < N; i++) {
      const s = Grid.cells[i]; let o = this.sMap.get(i);
      if (o && (!s || o.type !== s.type)) { this.scene.remove(o.g); this.sMap.delete(i); o = null; }
      if (!s) continue;
      if (!o) { o = this.makeStructure(s.type); const [wx, wz] = W2(ix(i) + 0.5, iy(i) + 0.5); o.g.position.set(wx, 0, wz); if (s.face !== undefined) o.g.rotation.y = yawOf(s.face); o.born = t; this.sMap.set(i, o); }
      const pop = Math.min(1, (t - o.born) / 0.18); o.g.scale.setScalar(0.4 + 0.6 * pop + Math.sin(pop * Math.PI) * 0.15);
      if (o.body) { const k = s.hp / CFG.BUILD.obstacle.hp; o.body.scale.y = 0.45 + 0.55 * k; }
      if (o.ball) {
        const k = s.from ? (Game.time - s.t0) / 0.35 : 1;
        if (k < 1) {                                          // 丟出去的拋物線
          const [fx, fz] = W2(s.from.x, s.from.y), [tx, tz] = W2(ix(i) + 0.5, iy(i) + 0.5);
          o.g.position.set(fx + (tx - fx) * k, 0, fz + (tz - fz) * k); o.ball.position.y = 0.25 + Math.sin(k * Math.PI) * 1.3; o.ball.rotation.z = k * 6;
        } else {
          const [tx, tz] = W2(ix(i) + 0.5, iy(i) + 0.5); o.g.position.set(tx, 0, tz);
          o.ball.position.y = 0.2; o.ball.rotation.z = 0; o.ball.rotation.y = i;
          o.ball.scale.setScalar(s.life < 3 ? 0.5 + 0.5 * s.life / 3 : 1);   // 快過期時縮小
        }
      }
      if (s.type === 'trap') {
        o.g.scale.y *= 0.35 + 0.65 * s.uses / CFG.BUILD.trap.uses;   // 尖刺隨使用次數磨平
        if (s.flash > 0) { s.flash -= real; const k = 1 + 0.35 * Math.abs(Math.sin(t * 18)); o.g.scale.x *= k; o.g.scale.z *= k; }   // 被殭屍識破：閃一下
      }
    }
    // 物資
    const alive = new Set();
    for (const s of Game.scraps) {
      alive.add(s.id);
      let o = this.scMap.get(s.id);
      if (!o) { o = this.makeScrap(); const [wx, wz] = W2(s.x, s.y); o.g.position.set(wx, 0, wz); this.scMap.set(s.id, o); }
      o.b.position.y = 0.4 + Math.sin(t * 3 + s.id) * 0.05; o.ring.scale.setScalar(1 + Math.sin(t * 4 + s.id) * 0.1);
    }
    for (const [id, o] of this.scMap) if (!alive.has(id)) { this.scene.remove(o.g); this.scMap.delete(id); }
    // 零件
    const pm = this.partMesh;
    if (Game.part) { const [wx, wz] = W2(Game.part.x, Game.part.y); pm.g.visible = true; pm.g.position.set(wx, 0, wz); pm.tor.rotation.y = t * 1.6; pm.kinds.forEach((m, k) => { m.visible = k === Game.parts % 6; }); pm.tor.position.y = 0.55 + Math.sin(t * 3) * 0.08; pm.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.15); }
    else pm.g.visible = false;
    // 無線電
    const ev = Game.evac;
    this.radioLight.material.color.setHex(ev === 'none' ? 0xff4040 : 0x6fdc8c);
    this.radioLight.visible = ev === 'none' ? Math.floor(t * 2) % 2 === 0 : true;
    this.radioZone.material.opacity = ev === 'ready' || ev === 'pickup' ? 0.5 + Math.sin(t * 4) * 0.2 : 0;
    this.radioZone.scale.setScalar(ev === 'pickup' ? CFG.EVAC.pickupR / CFG.EVAC.radius : 1);
    this.radioBeam.material.opacity = ev === 'ready' || ev === 'pickup' ? 0.22 : 0.06;
    this.rGlow.material.color.setHex(ev === 'none' ? 0xff5040 : 0x6fdc8c);
    this.rGlow.material.opacity = ev === 'none' ? (this.radioLight.visible ? 0.5 : 0.3) : 0.6 + Math.sin(t * 4) * 0.1;
    this.radioLeds.material.color.setHex(Math.floor(t * 3) % 2 ? 0x6fdc8c : 0x2f6b40);
    this.radioParts.forEach((m, k) => { m.visible = k < Game.parts; });
    this.updateHeli(real, t);

    for (const p of this.parts) {
      if (p.t <= 0) continue;
      p.t -= dt; p.vy -= 12 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.03, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      if (p.t <= 0) p.m.visible = false;
    }
    for (const s of this.shots) { if (s.t > 0) s.t -= real; s.l.material.opacity = Math.max(0, s.t / 0.08); }
    this.ov.visible = UI.mem;

    // 鏡頭與陰影跟隨：角色在畫面正中央（只有靠近地圖邊緣時鏡頭才停住）
    const ext = this.portrait ? [R / 2 - 5, C / 2 - 6] : [C / 2 - 8.5, R / 2 - 4.5];
    let tx, tz;
    if (this.portrait) { tx = clamp(px, -ext[1], ext[1]); tz = clamp(pz, -ext[0], ext[0]); }
    else { tx = clamp(px, -ext[0], ext[0]); tz = clamp(pz, -ext[1], ext[1]); }
    // 剛開局（從標題畫面切過來）鏡頭直接對準主角，不要慢慢飄過去
    const kc = this.camSnap ? 1 : Math.min(1, real * 6); this.camSnap = false;
    this.camLook.x += (tx - this.camLook.x) * kc; this.camLook.z += (tz - this.camLook.z) * kc;
    if (Game.phase === 'title') {
      // 標題畫面：鏡頭慢慢繞著無線電轉，角色在畫面右半邊（左半邊留給 Logo）
      this.orbit = (this.orbit || 0) + real * 0.06;
      const [rx, rz] = W2(RADIO.x, RADIO.y), d = 12;
      this.camLook.set(rx - 3.2 * Math.cos(this.orbit), 0, rz + 3.2 * Math.sin(this.orbit) * 0.3);
      this.cam.position.set(rx + Math.sin(this.orbit) * d, 7.5, rz + Math.cos(this.orbit) * d);
    } else this.cam.position.copy(this.camDir).multiplyScalar(this.camDist).add(this.camLook);
    if (this.shake > 0) {
      const s = this.shake * this.shake;
      this.cam.position.x += (Math.random() - 0.5) * s * 1.6; this.cam.position.y += (Math.random() - 0.5) * s; this.cam.position.z += (Math.random() - 0.5) * s * 1.6;
      this.shake = Math.max(0, this.shake - real * 1.6);
    }
    this.cam.lookAt(this.camLook);
    // 飄動的霧團：在玩家周圍一圈慢慢漂，離太遠就換到另一邊
    for (const m of this.mist) {
      m.position.x += m.userData.vx * real; m.position.z += m.userData.vz * real;
      const dx = m.position.x - this.camLook.x, dz = m.position.z - this.camLook.z;
      if (Math.hypot(dx, dz) > 17) { const a = Math.random() * 6.283, r = 9 + Math.random() * 6; m.position.x = this.camLook.x + Math.cos(a) * r; m.position.z = this.camLook.z + Math.sin(a) * r; }
    }
    if (Pd.boostT > 0 && Math.random() < 0.5) this.burst(Pd.x, Pd.y, this.M.dust, 1, 0.4);   // 加速時腳下揚塵
    this.sun.target.position.copy(this.camLook); this.sun.position.set(this.camLook.x - 6, 16, this.camLook.z + 8);
    this.r.render(this.scene, this.cam);
  },
  /** 世界座標 → 螢幕座標（給指引箭頭用） */
  toScreen(x, y, h = 0.5) {
    const [wx, wz] = W2(x, y), v = new THREE.Vector3(wx, h, wz).project(this.cam);
    return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, behind: v.z > 1 };
  },
  pick(cx, cy) {
    const v = new THREE.Vector2(cx / window.innerWidth * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.cam);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return [hit.x + C / 2, hit.z + R / 2];
  },
};
