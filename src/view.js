/* 表現層：three.js 場景、模型、特效、鏡頭。只讀取邏輯層狀態，不改遊戲規則。 */
import * as THREE from 'three';
import { CFG, C, R, N, idx, ix, iy, inB, clamp, rnd, cellOf, DIR4, DIR8, RADIO, TYPES } from './config.js';
import { Feel, FX } from './fx.js';
import { Grid } from './grid.js';
import { lerpAngle, hash01 } from './physics.js';
import { Memory } from './memory.js';
import { Game } from './game.js';
import { UI } from './ui.js';

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
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x1b1f2e);
    this.scene.fog = new THREE.Fog(0x1a1e2c, 18, 36);   // 依鏡頭距離在 resize 裡調整
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camDir = new THREE.Vector3(0, 0.82, 0.57).normalize();
    this.camLook = new THREE.Vector3();
    this.scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x2a2233, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
    this.scene.add(sun, sun.target); this.sun = sun;
    this.makeArena(); this.makeShared(); this.makePlayer(); this.makePools(); this.makeOverlay(); this.makeRadio();
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
    // 地板：重複貼圖（2x2 格一張），大地圖也不吃記憶體
    const px = 64, cv = document.createElement('canvas'); cv.width = cv.height = px * 2;
    const g = cv.getContext('2d');
    g.fillStyle = '#2b3150'; g.fillRect(0, 0, px * 2, px * 2);
    g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(px, 0, px, px); g.fillRect(0, px, px, px);
    g.strokeStyle = 'rgba(150,170,235,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, px, px); g.strokeRect(px, 0, px, px); g.strokeRect(0, px, px, px); g.strokeRect(px, px, px, px);
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(C / 2, R / 2); tex.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(C, R), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const out = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshLambertMaterial({ color: 0x20243a }));
    out.rotation.x = -Math.PI / 2; out.position.y = -0.02; this.scene.add(out);
    const wm = new THREE.MeshLambertMaterial({ color: 0x4a3c3e });   // 外牆壓暗，配合霧氣
    const mk = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wm); m.position.set(x, 0.55, z); m.castShadow = m.receiveShadow = true; this.scene.add(m); };
    mk(C + 2, 1, 0, -R / 2 - 0.5); mk(C + 2, 1, 0, R / 2 + 0.5); mk(1, R, -C / 2 - 0.5, 0); mk(1, R, C / 2 + 0.5, 0);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.position.y = 0.03; this.scene.add(this.marker);
  },
  /** 廢墟：用 InstancedMesh 一次畫完，高低、顏色各不同 */
  buildRocks() {
    if (this.rocksMesh) { this.scene.remove(this.rocksMesh); this.rocksMesh.geometry.dispose(); }
    let n = 0; for (let i = 0; i < N; i++) if (Grid.rock[i]) n++;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, n));
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < N; i++) {
      if (!Grid.rock[i]) continue;
      const h = 0.5 + hash01(i, 7) * 0.7,   // 不要太高，免得擋住角色
      [x, z] = W2(ix(i) + 0.5, iy(i) + 0.5);
      mat.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(0.98, h, 0.98));
      m.setMatrixAt(k, mat);
      col.setHSL(0.6 + hash01(i, 3) * 0.08, 0.12, 0.26 + hash01(i, 5) * 0.1); m.setColorAt(k, col);
      k++;
    }
    m.count = k; m.castShadow = m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.scene.add(m); this.rocksMesh = m;
    // 矮牆：比廢墟矮很多，看得出來可以翻
    if (this.lowMesh) { this.scene.remove(this.lowMesh); this.lowMesh.geometry.dispose(); }
    let nl = 0; for (let i = 0; i < N; i++) if (Grid.low[i]) nl++;
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, nl));
    let kl = 0;
    for (let i = 0; i < N; i++) {
      if (!Grid.low[i]) continue;
      const [x, z] = W2(ix(i) + 0.5, iy(i) + 0.5);
      mat.compose(new THREE.Vector3(x, 0.2, z), q, new THREE.Vector3(0.96, 0.4, 0.96));
      lm.setMatrixAt(kl, mat); col.setHSL(0.08, 0.12, 0.42 + hash01(i, 9) * 0.08); lm.setColorAt(kl, col); kl++;
    }
    lm.count = kl; lm.castShadow = lm.receiveShadow = true;
    lm.instanceMatrix.needsUpdate = true; if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    this.scene.add(lm); this.lowMesh = lm;
  },
  makeRadio() {
    const g = new THREE.Group(), L = c => new THREE.MeshLambertMaterial({ color: c });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), L(0x45506b)); base.position.y = 0.25; base.castShadow = true; g.add(base);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.4, 6), L(0xb7bccb)); mast.position.set(0.3, 1.5, 0); mast.castShadow = true; g.add(mast);
    this.radioLight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 })); this.radioLight.position.set(0.3, 2.75, 0); g.add(this.radioLight);
    this.radioZone = new THREE.Mesh(new THREE.RingGeometry(CFG.EVAC.radius - 0.08, CFG.EVAC.radius, 64), new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0, depthWrite: false }));
    this.radioZone.rotation.x = -Math.PI / 2; this.radioZone.position.y = 0.03; g.add(this.radioZone);
    this.radioBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fdc8c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.radioBeam.position.y = 7; g.add(this.radioBeam);
    const [x, z] = W2(RADIO.x, RADIO.y); g.position.set(x, 0, z); this.scene.add(g);
  },
  makeShared() {
    const L = c => new THREE.MeshLambertMaterial({ color: c });
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
  },
  makeZombie(z) {
    const G = this.G, M = this.M, g = new THREE.Group(); g.rotation.order = 'YXZ';
    const body = new THREE.Group(); g.add(body);
    const add = (geo, mat, x, y, zz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); m.castShadow = true; body.add(m); return m; };
    const l1 = add(G.leg, M.jeans, 0.1, 0.15, 0), l2 = add(G.leg, M.jeans, -0.1, 0.15, 0);
    add(G.torso, M.shirt[z.type], 0, 0.47, 0);
    const head = add(G.head, M.skin, 0, 0.81, 0.02); add(G.hair, M.hair, 0, 0.97, 0);
    const a1 = add(G.arm, M.skin, 0.24, 0.56, 0.16), a2 = add(G.arm, M.skin, -0.24, 0.56, 0.16);
    const s = z.def.scale; body.scale.setScalar(s);
    if (z.type === 'vaulter') { const band = add(G.hair, M.shirt.vaulter, 0, 0.88, 0.01); band.scale.set(1.04, 0.35, 1.04); }   // 跑酷殭屍：頭帶
    if (z.type === 'pathfinder') { const pack = add(G.torso, M.hair, 0, 0.5, -0.18); pack.scale.set(0.7, 0.8, 0.4); }          // 繞路殭屍：背包
    const alert = new THREE.Mesh(G.cone, M.alert); alert.rotation.x = Math.PI; alert.position.y = 1.4 * s; alert.visible = false; g.add(alert);
    this.scene.add(g);
    return { g, body, head, l1, l2, a1, a2, alert, phase: Math.random() * 6, hop: 0 };
  },
  makePlayer() {
    const L = c => new THREE.MeshLambertMaterial({ color: c });
    const g = new THREE.Group(), add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
    // 跑酷者：橘色帽 T、深色長褲、白球鞋、小背包；手腳各有關節可以擺動
    const hoodie = L(0xf07a2e), pants = L(0x2b3142), skin = L(0xe2b48c), shoe = L(0xf2f2f2), dark = L(0x1e222e);
    const limb = (x, y, len, mat, foot) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0); g.add(piv);
      add(new THREE.BoxGeometry(0.1, len, 0.1), mat, 0, -len / 2, 0, piv);
      if (foot) add(new THREE.BoxGeometry(0.12, 0.06, 0.18), shoe, 0, -len, 0.03, piv);
      return piv;
    };
    const legL = limb(0.08, 0.3, 0.27, pants, true), legR = limb(-0.08, 0.3, 0.27, pants, true);
    add(new THREE.BoxGeometry(0.32, 0.34, 0.2), hoodie, 0, 0.47, 0);                     // 帽 T 身體
    add(new THREE.BoxGeometry(0.22, 0.24, 0.1), dark, 0, 0.5, -0.14);                    // 背包
    add(new THREE.SphereGeometry(0.15, 12, 10), skin, 0, 0.78, 0.01);                    // 頭
    const hood = add(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), hoodie, 0, 0.8, -0.02); hood.rotation.x = -0.35;   // 帽兜
    add(new THREE.BoxGeometry(0.2, 0.05, 0.04), dark, 0, 0.8, 0.14);                     // 頭帶
    const armL = limb(0.21, 0.6, 0.27, hoodie, false), armR = limb(-0.21, 0.6, 0.27, hoodie, false);
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
    const tor = new THREE.Mesh(this.G.torus, this.M.partM); tor.position.y = 0.55; pg.add(tor);
    const beam = new THREE.Mesh(this.G.beam, this.M.beam); beam.position.y = 6; pg.add(beam);
    const ring = new THREE.Mesh(this.G.ring, new THREE.MeshBasicMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.6, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; pg.add(ring);
    pg.visible = false; this.scene.add(pg); this.partMesh = { g: pg, tor, ring };
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
    if (type === 'obstacle') {           // 矮路障：玩家跨得過的高度
      o.body = new THREE.Group(); g.add(o.body);
      add(M.obstacle, 0.9, 0.38, 0.5, 0.19, o.body);
      for (let k = 0; k < 3; k++) { const st = add(M.stripe, 0.12, 0.3, 0.52, 0.2, o.body); st.position.x = -0.3 + k * 0.3; }
    } else if (type === 'trap') {
      add(M.trap, 0.82, 0.05, 0.82, 0.025);
      for (let k = 0; k < 4; k++) { const s = add(M.spike, 0.1, 0.16, 0.1, 0.1); s.position.x = (k % 2 ? 0.2 : -0.2); s.position.z = (k < 2 ? 0.2 : -0.2); }
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
    FX.pickup = s => { this.burst(s.x, s.y, this.M.gold, 8, 2); UI.msg(`+${s.value} 材料`); };
    FX.part = (p, n) => { this.burst(p.x, p.y, this.M.partM, 16, 3); if (n < CFG.PARTS.goal) UI.msg(`找到零件 ${n}/${CFG.PARTS.goal}`); if (Feel.slowmo) Game.slowT = 0.35; };
    FX.horde = (dir, warn) => {
      const d = this.dirName(dir);
      if (warn) UI.alarm(`屍潮要來了，從${d}！`); else UI.alarm(`屍潮從${d}湧來`);
      UI.hordeDir = dir; UI.hordeFlash = warn ? CFG.HORDE.warn + 4 : 4;
    };
    FX.report = (n, lines) => { UI.showReport(n, lines); this.drawOverlay(); };
    FX.broke = () => { if (Feel.shake) this.shake = Math.max(this.shake, 0.15); };
    FX.evac = k => { UI.alarm(k === 'start' ? '救援呼叫成功！撐 30 秒，去哪都行' : '直升機降落了！衝回無線電'); if (Feel.shake) this.shake = 0.3; };
    FX.msg = m => UI.msg(m);
    FX.over = win => UI.over(win);
  },
  /** 邏輯方向 → 螢幕上的方位文字（直向時地圖轉了 90°） */
  dirName(a) {
    const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ['右邊', '右下', '下方', '左下', '左邊', '左上', '上方', '右上'][(k + (this.portrait ? 2 : 0)) % 8];
  },

  sync(dt, real) {
    const Pd = Game.player, P = this.P, t = performance.now() / 1000;
    const [px, pz] = W2(Pd.x, Pd.y);
    P.hop = (P.hop || 0) + ((Pd.vaulting ? 0.34 : 0) - (P.hop || 0)) * Math.min(1, real * 14);
    P.g.position.set(px, P.hop + (Math.hypot(Pd.vx, Pd.vy) > 0.5 ? Math.abs(Math.sin(t * 14)) * 0.05 : 0), pz);
    P.yaw = P.yaw === undefined ? yawOf(Pd.face) : lerpAngle(P.yaw, yawOf(Pd.face), 1 - Math.exp(-(Pd.shoveT > 0 ? 30 : 14) * real));
    P.g.rotation.y = P.yaw;
    P.g.visible = !(Pd.iframe > 0 && Math.floor(t * 20) % 2 === 0);
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

    for (const z of Game.zombies) {
      let o = this.zMap.get(z.id);
      if (!o) { o = this.makeZombie(z); this.zMap.set(z.id, o); }
      const [wx, wz] = W2(z.x, z.y);
      o.hop += ((z.vaulting ? 0.32 : 0) - o.hop) * Math.min(1, real * 14);   // 跨越時往上跳
      o.g.position.set(wx, o.hop, wz);
      o.yaw = o.yaw === undefined ? yawOf(z.dir) : lerpAngle(o.yaw, yawOf(z.dir), 1 - Math.exp(-8 * real * UI.speed));
      o.g.rotation.y = o.yaw;
      o.phase += dt * (z.moving ? z.def.speed * 6 : z.attacking ? 14 : 2);
      const sw = z.moving ? Math.sin(o.phase) * 0.5 : 0;
      o.l1.rotation.x = sw; o.l2.rotation.x = -sw;
      o.a1.rotation.x = z.attacking ? Math.sin(o.phase) * 0.6 - 0.2 : -0.1 + Math.sin(o.phase * 0.5) * 0.08;
      o.a2.rotation.x = z.attacking ? -Math.sin(o.phase) * 0.6 - 0.2 : -0.1 - Math.sin(o.phase * 0.5) * 0.08;
      o.body.rotation.z = z.moving ? Math.sin(o.phase * 0.5) * 0.08 : 0;
      const f = z.flash > 0 ? 1.18 : 1; o.body.scale.set(z.def.scale * f, z.def.scale / f, z.def.scale * f);
      o.head.position.y = z.waiting ? 0.81 + Math.sin(t * 2 + o.phase) * 0.02 : 0.81;
      // 頭上標記：紅 = 發現你；黃 = 被障礙卡住
      o.alert.visible = z.alertT > 0 || z.stuckMark > 0 || z.trapMark > 0; o.alert.material = z.alertT > 0 ? this.M.alert : this.M.stuck;
      o.alert.position.y = 1.4 * z.def.scale + Math.sin(t * 12) * 0.05;
      if (z.stuckMark > 0) o.body.position.x = Math.sin(t * 40) * 0.03; else o.body.position.x = 0;
    }
    for (let k = this.corpses.length - 1; k >= 0; k--) {
      const c = this.corpses[k], g = c.o.g; c.t += real;
      g.position.y = -c.t * 1.4;
      if (c.t > 0.9) { this.scene.remove(g); this.corpses.splice(k, 1); }
    }
    for (let i = 0; i < N; i++) {
      const s = Grid.cells[i]; let o = this.sMap.get(i);
      if (o && (!s || o.type !== s.type)) { this.scene.remove(o.g); this.sMap.delete(i); o = null; }
      if (!s) continue;
      if (!o) { o = this.makeStructure(s.type); const [wx, wz] = W2(ix(i) + 0.5, iy(i) + 0.5); o.g.position.set(wx, 0, wz); o.born = t; this.sMap.set(i, o); }
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
    if (Game.part) { const [wx, wz] = W2(Game.part.x, Game.part.y); pm.g.visible = true; pm.g.position.set(wx, 0, wz); pm.tor.rotation.y = t * 2; pm.tor.rotation.x = Math.sin(t) * 0.4; pm.tor.position.y = 0.55 + Math.sin(t * 3) * 0.08; pm.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.15); }
    else pm.g.visible = false;
    // 無線電
    const ev = Game.evac;
    this.radioLight.material.color.setHex(ev === 'none' ? 0xff4040 : 0x6fdc8c);
    this.radioLight.visible = ev === 'none' ? Math.floor(t * 2) % 2 === 0 : true;
    this.radioZone.material.opacity = ev === 'ready' || ev === 'pickup' ? 0.5 + Math.sin(t * 4) * 0.2 : 0;
    this.radioZone.scale.setScalar(ev === 'pickup' ? CFG.EVAC.pickupR / CFG.EVAC.radius : 1);
    this.radioBeam.material.opacity = ev === 'ready' || ev === 'pickup' ? 0.22 : 0.06;

    for (const p of this.parts) {
      if (p.t <= 0) continue;
      p.t -= dt; p.vy -= 12 * dt;
      p.m.position.x += p.vx * dt; p.m.position.y = Math.max(0.03, p.m.position.y + p.vy * dt); p.m.position.z += p.vz * dt;
      if (p.t <= 0) p.m.visible = false;
    }
    for (const s of this.shots) { if (s.t > 0) s.t -= real; s.l.material.opacity = Math.max(0, s.t / 0.08); }
    this.ov.visible = UI.mem;

    // 鏡頭與陰影跟隨
    const ext = this.portrait ? [R / 2 - 5, C / 2 - 6] : [C / 2 - 8.5, R / 2 - 4.5];
    let tx, tz;
    if (this.portrait) { tx = clamp(px, -ext[1], ext[1]) + 1.6; tz = clamp(pz, -ext[0], ext[0]); }
    else { tx = clamp(px, -ext[0], ext[0]); tz = clamp(pz, -ext[1], ext[1]) + 1.4; }
    const kc = Math.min(1, real * 6);
    this.camLook.x += (tx - this.camLook.x) * kc; this.camLook.z += (tz - this.camLook.z) * kc;
    this.cam.position.copy(this.camDir).multiplyScalar(this.camDist).add(this.camLook);
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
