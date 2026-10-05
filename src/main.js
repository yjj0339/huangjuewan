// 主程序：组装场景、灯光、材质、镜头预设与交互
import * as THREE from '../vendor/three.module.js?v=35';
import {
  makeAsphalt, makeConcrete, makeGrass,
  makeResiFacade, makeGlassFacade, makeShopFacade, makeCityGround,
  makeSign, makeCloudSprite, makeCloudShadowNoise, makeWater,
} from './textures.js?v=35';
import { buildNetwork, buildCollisionGrid, auditClearances, LEVELS } from './roads.js?v=35';
import { buildDeck, buildPiers } from './deck.js?v=35';
import {
  makeLampGeometry, placeLamps, makeSigns, makeGroundRoads,
  makeVegetation, makeCity, makePark, makeDelineators, makeMedianPosts,
} from './props.js?v=35';
import { Traffic, PlayerCar, loadCarAssets } from './traffic.js?v=35';
import { makeSky, makeLighting, makeClouds, makeOuterGround, makeMountains, makeSunGlow } from './env.js?v=35';

// ---------- 渲染器 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);

const params = new URLSearchParams(location.search); // 诊断/截图参数（全文件可用）

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d9e6, 1900, 6800);

// 诊断：?at=x,z,h → 任意点位俯视
let diagAt = null;
if (params.get('at')) {
  const [ax, az, ah] = params.get('at').split(',').map(Number);
  diagAt = { x: ax, z: az, h: ah || 120 };
}

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 12000);
camera.position.set(620, 470, 620);

// ---------- 纹理与材质 ----------
const asphalt3 = makeAsphalt(3, { roadW: 11.5 });
const asphalt2 = makeAsphalt(2, { roadW: 9 });
const asphaltG3 = makeAsphalt(3, { roadW: 11.25 });
const asphaltG2 = makeAsphalt(2, { roadW: 7.5 });
const concreteTex = makeConcrete();
const grassTex = makeGrass();
const parkTex = makeGrass();
const texResi = makeResiFacade();
const texGlass = makeGlassFacade();
const texShop = makeShopFacade();
const texCityGround = makeCityGround();
const waterTex = makeWater();

const asphaltMat = new THREE.MeshStandardMaterial({ map: asphalt3.tex, roughness: 0.94, metalness: 0 });
const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.88, metalness: 0.02 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.85, roughness: 0.38 });
const mats = { asphalt: asphaltMat, concrete: concreteMat, metal: metalMat, index: { asphalt: 0, concrete: 1, metal: 2 } };
// 匝道材质：深度偏移，保证与主线重叠汇合处稳定压过主线表面（无缝且不闪烁）
const rampAsphalt = asphaltMat.clone();
rampAsphalt.polygonOffset = true; rampAsphalt.polygonOffsetFactor = -2; rampAsphalt.polygonOffsetUnits = -2;
const rampConcrete = concreteMat.clone();
rampConcrete.polygonOffset = true; rampConcrete.polygonOffsetFactor = -2; rampConcrete.polygonOffsetUnits = -2;
const rampMats = { asphalt: rampAsphalt, concrete: rampConcrete, metal: metalMat, index: mats.index };

// ---------- 路网 + 桥梁 ----------
const net = buildNetwork();
const grid = buildCollisionGrid([...net.mains, ...net.ramps]);
if (params.get('audit')) {
  const conf = auditClearances(net);
  document.body.setAttribute('data-audit', JSON.stringify({ n: conf.length, items: conf.slice(0, 24) }));
  document.title = 'AUDIT' + conf.length;
}

const deckGroup = new THREE.Group();
for (const road of [...net.mains, ...net.ramps]) {
  const mm = road.kind === 'ramp' ? rampMats : mats;
  const geo = buildDeck(road, mm);
  const mesh = new THREE.Mesh(geo, [mm.asphalt, mm.concrete, mm.metal]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  deckGroup.add(mesh);
}
scene.add(deckGroup);

// ---------- 驾驶小地图（拓扑底图一次绘制 + 动态目标点） ----------
const miniCv = document.getElementById('minimap-cv');
const miniCtx = miniCv.getContext('2d');
const miniSize = miniCv.width;
const miniWorld = 4900;
const miniScale = miniSize / miniWorld;
const miniBase = document.createElement('canvas');
miniBase.width = miniBase.height = miniSize;
{
  const g = miniBase.getContext('2d');
  g.fillStyle = '#eef3f7';
  g.fillRect(0, 0, miniSize, miniSize);
  const lvlColor = { A: '#9b59b6', B: '#e67e22', C: '#2ecc71', D: '#3498db' };
  const draw = (road, color, width) => {
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round';
    g.beginPath();
    const step = Math.max(1, Math.floor(road.pts.length / 90));
    for (let i = 0; i < road.pts.length; i += step) {
      const p = road.pts[i];
      const x = (p.x + miniWorld / 2) * miniScale, y = (p.z + miniWorld / 2) * miniScale;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  };
  for (const r of net.grounds) draw(r, '#aab2b8', 1.1);
  for (const r of net.ramps) draw(r, '#c3cad0', 0.8);
  for (const m of net.mains) draw(m, lvlColor[m.level] || '#888888', 1.8);
}
const miniXY = (p) => [(p.x + miniWorld / 2) * miniScale, (p.z + miniWorld / 2) * miniScale];
function drawMinimap() {
  miniCtx.clearRect(0, 0, miniSize, miniSize);
  miniCtx.drawImage(miniBase, 0, 0);
  if (mode === 'drive' && player) {
    // 前方 500m 内的匝道出口提示点
    miniCtx.fillStyle = '#00b4d8';
    for (const ex of (player.exitsByRoad.get(player.road) || [])) {
      const ahead = ex.s - player.s;
      if (ahead > 0 && ahead < 500) {
        const [ex1, ey1] = miniXY(player.road.frameAt(ex.s).p);
        miniCtx.beginPath(); miniCtx.arc(ex1, ey1, 3, 0, 7); miniCtx.fill();
      }
    }
    const f = player.road.frameAt(player.s);
    const [mx, my] = miniXY(f.p);
    miniCtx.fillStyle = '#ff7a1f';
    miniCtx.beginPath(); miniCtx.arc(mx, my, 3.6, 0, 7); miniCtx.fill();
    miniCtx.strokeStyle = '#ff7a1f'; miniCtx.lineWidth = 2;
    miniCtx.beginPath(); miniCtx.moveTo(mx, my);
    miniCtx.lineTo(mx + f.tan.x * 9, my + f.tan.z * 9);
    miniCtx.stroke();
  } else if (mode === 'follow' && followCar) {
    const [mx, my] = miniXY(followCar.road.frameAt(followCar.s).p);
    miniCtx.fillStyle = '#2b6fd4';
    miniCtx.beginPath(); miniCtx.arc(mx, my, 3.6, 0, 7); miniCtx.fill();
  }
}

// 桥墩
const piers = buildPiers([...net.mains, ...net.ramps], grid, net.grounds);
const pierMesh = new THREE.Mesh(piers.geo, concreteMat);
pierMesh.castShadow = true;
pierMesh.receiveShadow = true;
if (params.get('hidepiers')) pierMesh.visible = false; // 诊断开关
if (params.get('pierdbg')) {
  const near = piers.placed.filter(p => Math.abs(p.x - 205) < 40 && Math.abs(p.z + 55) < 40 && p.capY > 11);
  console.log('PIERDBG', JSON.stringify(near));
}
scene.add(pierMesh);

// ---------- 地面：公园 + 道路 + 外圈 ----------
scene.add(makeOuterGround(grassTex));
const park = makePark(parkTex, null, waterTex);
scene.add(park);
const groundRoads = makeGroundRoads(net.grounds, { 3: asphaltG3, 2: asphaltG2 });
scene.add(groundRoads);

// ---------- 附属 ----------
const lamps = placeLamps([...net.grounds, ...net.mains, ...net.ramps], makeLampGeometry(), grid);
scene.add(lamps);
scene.add(makeDelineators(net));   // 匝道诱导柱
scene.add(makeMedianPosts(net));   // 主线防眩柱

const signMats = {
  post: new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.4 }),
  texG1: makeSign('green', [{ text: 'G50 沪渝高速', arrow: 'up' }, { text: '江北机场', arrow: 'right' }]),
  texG2: makeSign('green', [{ text: 'G75 兰海高速', arrow: 'up' }, { text: '南岸区', arrow: 'right' }]),
  texG3: makeSign('green', [{ text: '内环快速', arrow: 'up' }, { text: '大佛寺大桥', arrow: 'left' }]),
  texG4: makeSign('green', [{ text: '广阳岛', arrow: 'right' }, { text: '弹子石', arrow: 'up' }]),
  texG5: makeSign('green', [{ text: '朝天门大桥', arrow: 'up' }, { text: '江北区', arrow: 'left' }]),
  texG6: makeSign('green', [{ text: '黄桷湾立交', arrow: 'up' }, { text: '盘龙 出口', arrow: 'right' }]),
};
scene.add(makeSigns(net, signMats, grid));

// ---------- 绿化 + 城市 ----------
// 植被避让：乔木避开 14m 以下的桥面（树高可到 13m），灌木避开 4.5m 以下的低桥
const treeClear = [], bushClear = [];
for (const road of [...net.ramps, ...net.mains]) {
  for (let s = 0; s <= road.length; s += 8) {
    const p = road.pts[road._seg(s)];
    if (p.y < 14) treeClear.push(p.x, p.z);
    if (p.y < 4.5) bushClear.push(p.x, p.z);
  }
}
scene.add(makeVegetation(piers.placed, [...net.grounds], treeClear, bushClear));
scene.add(makeCity(net, texResi, texGlass, texShop, texCityGround));

// ---------- 天空/光/云 ----------
scene.add(makeSky());
scene.add(makeMountains());   // 远山近丘天际线
scene.add(makeSunGlow());     // 太阳光晕
const { sun } = makeLighting(scene);
const clouds = makeClouds(makeCloudSprite(3), makeCloudShadowNoise(7));
scene.add(clouds);

// ---------- 车流 + 玩家驾驶车（异步加载 Blender GLB，失败自动回退方块车） ----------
let traffic = null;
let player = null;
loadCarAssets('./assets/cars/').then((assets) => {
  traffic = new Traffic(net, 1, assets);
  scene.add(traffic.group);
  player = new PlayerCar(net, assets);
  scene.add(player.mesh);
  window.__DIAG.cars = traffic.cars.length;
  if (params.get('drive')) setMode('drive');
  if (params.get('follow')) {
    followCar = traffic.cars[(Math.random() * traffic.cars.length) | 0];
    setMode('follow');
  }
});

// ---------- 轨道控制（自制，带阻尼） ----------
const ctl = {
  target: new THREE.Vector3(0, 14, 0),
  sph: new THREE.Spherical().setFromVector3(camera.position.clone().sub(new THREE.Vector3(0, 14, 0))),
  vSph: new THREE.Spherical(0, 0, 0),
  dragging: false,
  panning: false,
  lx: 0, ly: 0,
  auto: true,
};
const dom = renderer.domElement;
dom.addEventListener('pointerdown', (e) => {
  ctl.dragging = true; ctl.panning = e.button === 2;
  ctl.lx = e.clientX; ctl.ly = e.clientY;
  ctl.auto = false;
  dom.setPointerCapture(e.pointerId);
});
addEventListener('pointerup', () => { ctl.dragging = false; ctl.panning = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointermove', (e) => {
  if (!ctl.dragging) return;
  const dx = e.clientX - ctl.lx, dy = e.clientY - ctl.ly;
  ctl.lx = e.clientX; ctl.ly = e.clientY;
  if (ctl.panning) {
    const panScale = ctl.sph.radius * 0.0012;
    const fwd = new THREE.Vector3().subVectors(ctl.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate();
    ctl.target.addScaledVector(right, dx * panScale).addScaledVector(fwd, dy * panScale);
  } else {
    ctl.vSph.theta -= dx * 0.005;
    ctl.vSph.phi -= dy * 0.004;
  }
});
dom.addEventListener('wheel', (e) => {
  e.preventDefault();
  ctl.sph.radius *= Math.pow(1.0012, e.deltaY);
  ctl.sph.radius = THREE.MathUtils.clamp(ctl.sph.radius, 12, 4200);
  ctl.auto = false;
}, { passive: false });

// ---------- 音效：引擎声随车速 ----------
let audio = null;
let muted = false;
const soundBtn = document.getElementById('sound');
function ensureAudio() {
  if (audio || muted) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.Q.value = 1.6;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 28;
    const g2 = ctx.createGain();
    g2.gain.value = 0.3;
    osc.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    audio = { ctx, gain, osc, osc2, filter };
  } catch (err) { /* 无音频环境时静默 */ }
}
function engineSound(speed) {
  if (!audio) return;
  const t = audio.ctx.currentTime;
  const f = 50 + Math.abs(speed) * 3.4;
  audio.osc.frequency.setTargetAtTime(f, t, 0.08);
  audio.osc2.frequency.setTargetAtTime(f / 2, t, 0.08);
  audio.filter.frequency.setTargetAtTime(450 + Math.abs(speed) * 60, t, 0.1);
  const g = muted ? 0 : Math.min(0.055, 0.014 + Math.abs(speed) * 0.0011);
  audio.gain.gain.setTargetAtTime(g, t, 0.12);
}
soundBtn.addEventListener('click', () => {
  muted = !muted;
  if (!muted && mode !== 'orbit') ensureAudio();
  soundBtn.textContent = muted ? '🔇 已静音' : '🔊 音效';
  soundBtn.classList.toggle('on', !muted && mode !== 'orbit');
});

// ---------- 拍照模式（H 键或按钮切换） ----------
const toggleUI = () => document.body.classList.toggle('hideui');
document.getElementById('hideui').addEventListener('click', toggleUI);
document.getElementById('showui').addEventListener('click', toggleUI);
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'h' && mode !== 'drive') toggleUI();
});

// ---------- 模式系统：环视 / 跟随车辆 / 自由驾驶 ----------
let mode = 'orbit';          // 'orbit' | 'follow' | 'drive'
let followCar = null;
const input = { up: false, down: false, turn: 0 };
const raycaster = new THREE.Raycaster();
const hud = document.getElementById('drive-hud');
const hudSpeed = document.getElementById('hud-speed');
const hudRoad = document.getElementById('hud-road');
const hudHint = document.getElementById('hud-hint');
const touchPad = document.getElementById('touch-controls');

function setMode(m) {
  if ((m === 'drive' && !player) || (m === 'follow' && !traffic)) return; // 车辆资源未就绪
  mode = m;
  document.body.classList.toggle('in-car', m === 'drive' || m === 'follow');
  if (m === 'drive') {
    player.mesh.visible = true;
    player.place(net.mains[0]);
    followCar = null;
    ctl.auto = false;
  } else if (m === 'follow') {
    if (!followCar) followCar = traffic.cars[(Math.random() * traffic.cars.length) | 0];
    ctl.auto = false;
  } else {
    if (player) player.mesh.visible = false;
    followCar = null;
    camera.fov = 52;
    camera.updateProjectionMatrix();
  }
  const inCar = (m === 'drive' || m === 'follow');
  if (inCar) {
    ensureAudio();
    if (params.get('topview')) {
      // 诊断：从目标正上方俯视（可带高度）
      const h = parseFloat(params.get('topview')) || 45;
      const f = m === 'drive' ? player.road.frameAt(player.s) : followCar.road.frameAt(followCar.s);
      const base = m === 'drive' ? f.p.clone().addScaledVector(f.side, player.laneOff)
        : f.p.clone().addScaledVector(f.side, followCar.laneOff);
      camera.position.copy(base).add(new THREE.Vector3(0.01, h, 0.01));
      camera.lookAt(base);
    } else {
      snapChase(); // 进入时直接吸附到理想追尾机位，不做长距离漂移
    }
  } else {
    engineSound(0);
  }
  touchPad.style.display = m === 'drive' ? 'flex' : 'none';
  hud.style.display = inCar ? 'block' : 'none';
  document.getElementById('drive').classList.toggle('on', m === 'drive');
  document.getElementById('followRandom').classList.toggle('on', m === 'follow');
  document.getElementById('spin').style.visibility = m === 'orbit' ? 'visible' : 'hidden';
}

// 计算当前跟随/驾驶目标的追尾机位并直接摆放相机
function snapChase() {
  const up = new THREE.Vector3(0, 1, 0);
  let pos, fwd, speed = 0, dist = 8.2, height = 3.4;
  if (mode === 'drive') {
    const f = player.road.frameAt(player.s);
    pos = f.p.clone().addScaledVector(f.side, player.laneOff);
    fwd = f.tan.clone();
    speed = player.speed;
  } else if (followCar) {
    const f = followCar.road.frameAt(followCar.s);
    pos = f.p.clone().addScaledVector(f.side, followCar.laneOff);
    fwd = f.tan.clone().multiplyScalar(followCar.forward);
    speed = followCar.speed;
    const extra = followCar.kind === 'bus' ? 4.5 : followCar.kind === 'truck' ? 6 : 0;
    dist = 8.5 + extra;
    height = 3.3 + extra * 0.25;
  } else return;
  camera.position.copy(pos).addScaledVector(fwd, -dist).addScaledVector(up, height);
  const look = pos.clone().addScaledVector(fwd, 12);
  look.y += 1.4;
  camera.lookAt(look);
}
function exitToOrbit() {
  setMode('orbit');
  applyPreset('bird');
}

function handleClick(e) {
  if (e.target !== dom) return; // 只响应画布点击（UI 按钮不触发）
  const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(traffic.insts, false);
  if (hits.length) {
    const inst = hits[0].object;
    const car = inst.userData.cars[hits[0].instanceId];
    if (car) {
      followCar = car;
      setMode('follow');
      hudHint.textContent = '跟随视角：' + car.road.name + ' · 点击空白处或按 ESC 退出';
    }
  } else if (mode === 'follow') {
    exitToOrbit();
  }
}

// 点击（与拖拽区分）
let downX = 0, downY = 0;
dom.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY;
  if (audio && audio.ctx.state === 'suspended') audio.ctx.resume(); // 浏览器手势要求
});
addEventListener('pointerup', (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) < 6) handleClick(e);
});

// 键盘
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (mode !== 'orbit') exitToOrbit(); return; }
  if (mode !== 'drive') return;
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') input.up = true;
  if (k === 's' || k === 'arrowdown') input.down = true;
  if (k === 'a' || k === 'arrowleft') input.turn = -1;
  if (k === 'd' || k === 'arrowright') input.turn = 1;
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') input.up = false;
  if (k === 's' || k === 'arrowdown') input.down = false;
});

// 触屏驾驶按钮
const bindTouch = (id, on, off) => {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); on(); });
  el.addEventListener('pointerup', (ev) => { ev.stopPropagation(); off(); });
  el.addEventListener('pointerleave', () => off());
};
bindTouch('tc-left', () => { input.turn = -1; }, () => {});
bindTouch('tc-right', () => { input.turn = 1; }, () => {});
bindTouch('tc-gas', () => { input.up = true; }, () => { input.up = false; });
bindTouch('tc-brake', () => { input.down = true; }, () => { input.down = false; });

document.getElementById('drive').addEventListener('click', () => {
  setMode(mode === 'drive' ? 'orbit' : 'drive');
});
const followBtn = document.getElementById('followRandom');
followBtn.addEventListener('click', () => {
  if (!traffic) return;
  followCar = traffic.cars[(Math.random() * traffic.cars.length) | 0];
  setMode('follow');
  hudHint.textContent = '跟随视角：' + followCar.road.name + ' · 点击空白处或按 ESC 退出';
});

// ---------- 镜头预设 ----------
const PRESETS = {
  bird: { pos: [620, 470, 620], tgt: [0, 12, 0], phi: null },           // 鸟瞰全貌
  north: { pos: [-520, 160, -520], tgt: [0, 16, 0] },
  under: { pos: [180, 6, 150], tgt: [40, 20, -60] },                    // 桥下仰视
  spiral: { pos: [455, 210, 430], tgt: [262, 8, 160] },                 // 螺旋匝道（高角度俯瞰盘桥）
  street: { pos: [40, 22, -180], tgt: [40, 17, 100] },                  // 主线穿行视角
  tower: { pos: [120, 90, -280], tgt: [40, 20, -60] },
  west: { pos: [-1520, 130, 340], tgt: [-900, 12, -60] },               // 西端落地段
};
let presetName = 'bird';
function applyPreset(name, instant = true) {
  if (diagAt) {
    ctl.target.set(diagAt.x, 0, diagAt.z);
    camera.position.set(diagAt.x + 0.01, diagAt.h, diagAt.z + 0.01);
    camera.lookAt(ctl.target);
    ctl.sph.setFromVector3(camera.position.clone().sub(ctl.target));
    ctl.vSph.theta = 0; ctl.vSph.phi = 0;
    ctl.auto = false;
    return;
  }
  const p = PRESETS[name];
  if (!p) return;
  presetName = name;
  ctl.auto = false;
  ctl.target.set(...p.tgt);
  camera.position.set(...p.pos);
  ctl.sph.setFromVector3(camera.position.clone().sub(ctl.target));
  ctl.vSph.theta = 0; ctl.vSph.phi = 0;
  updateHud();
}
function updateHud() {
  document.querySelectorAll('[data-view]').forEach(b =>
    b.classList.toggle('on', b.dataset.view === presetName));
}

// ---------- UI ----------
document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => applyPreset(b.dataset.view)));
const spinBtn = document.getElementById('spin');
spinBtn.addEventListener('click', () => {
  ctl.auto = !ctl.auto;
  spinBtn.classList.toggle('on', ctl.auto);
});
spinBtn.classList.add('on');

// ---------- 无头截图/诊断钩子 ----------
window.__READY = false;
window.__DIAG = { tris: 0, calls: 0, cars: 0, piers: 0, fps: 0 };
if (params.get('shot')) {
  applyPreset(params.get('shot'));
  ctl.auto = false;
}
if (params.get('run')) input.up = true; // 截图钩子：驾驶模式自动踩油门

// ---------- 主循环 ----------
window.__BUILT_MS = Math.round(performance.now());
document.body.dataset.build = window.__BUILT_MS;
const clock = new THREE.Clock();
const UPV = new THREE.Vector3(0, 1, 0);
const chaseTarget = new THREE.Vector3(), lookPos = new THREE.Vector3();
const focus = new THREE.Vector3(0, 12, 0);
let frames = 0, fpsAcc = 0, readyFrames = 0;
let fpsAvg = 60, pxTier = 0, lastPRChange = 0;
function applyPR() {
  const prs = [Math.min(devicePixelRatio, 2), 1.5, 1];
  renderer.setPixelRatio(prs[pxTier]);
}
function chaseCam(targetPos, fwd, dist, height, lookAhead, dt, speed = 0) {
  chaseTarget.copy(targetPos).addScaledVector(fwd, -dist).addScaledVector(UPV, height);
  camera.position.lerp(chaseTarget, 1 - Math.exp(-5.5 * dt));
  lookPos.copy(targetPos).addScaledVector(fwd, lookAhead);
  lookPos.y += 1.4;
  camera.lookAt(lookPos);
  const targetFov = 52 + Math.min(26, speed * 0.5);
  if (Math.abs(camera.fov - targetFov) > 0.3) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }
}
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'orbit') {
    // 轨道相机（带阻尼）
    if (ctl.auto) ctl.vSph.theta += dt * 0.028;
    ctl.sph.theta += ctl.vSph.theta; ctl.sph.phi += ctl.vSph.phi;
    ctl.vSph.theta *= 0.86; ctl.vSph.phi *= 0.86;
    ctl.sph.phi = THREE.MathUtils.clamp(ctl.sph.phi, 0.06, Math.PI / 2 - 0.02);
    camera.position.setFromSpherical(ctl.sph).add(ctl.target);
    camera.lookAt(ctl.target);
    focus.copy(ctl.target);
  } else if (mode === 'follow' && followCar) {
    const f = followCar.road.frameAt(followCar.s);
    const pos = f.p.clone().addScaledVector(f.side, followCar.laneOff);
    const fwd = f.tan.clone().multiplyScalar(followCar.forward);
    const extra = followCar.kind === 'bus' ? 4.5 : followCar.kind === 'truck' ? 6 : 0;
    chaseCam(pos, fwd, 8.5 + extra, 3.3 + extra * 0.25, 9, dt, followCar.speed * followCar.forward);
    focus.copy(pos);
    engineSound(followCar.speed * followCar.forward);
    hudSpeed.textContent = Math.round(Math.abs(followCar.speed) * 3.6);
    hudRoad.textContent = followCar.road.name;
  } else if (mode === 'drive') {
    const st = player.update(dt, input);
    chaseCam(st.pos, st.fwd, 8.2 + st.speed * 0.05, 3.4, 12, dt, st.speed);
    focus.copy(st.pos);
    engineSound(st.speed);
    if (!params.get('camdbg')) {
      hudSpeed.textContent = Math.round(st.speed * 3.6);
      hudRoad.textContent = player.road.name;
      hudHint.textContent = player.hint || 'W/↑ 油门 · S/↓ 刹车 · A/D 变道（出口提示出现时按 ←/→ 转入匝道）· ESC 退出';
    }
  }

  if (traffic) traffic.update(dt * (params.get('speed') ? parseFloat(params.get('speed')) : 1));
  clouds.userData.tick(dt);
  // 池塘水面微动
  const pond = park.userData.pond;
  if (pond) {
    pond.material.map.offset.x = clock.elapsedTime * 0.016;
    pond.material.map.offset.y = clock.elapsedTime * 0.009;
  }

  // 太阳阴影相机跟随视野中心
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(new THREE.Vector3(420, 560, 300));

  renderer.render(scene, camera);
  document.body.dataset.fr = frames; // 探针：rAF 帧计数
  document.body.dataset.ft = Math.round(performance.now()); // 探针：真实时间

  if (readyFrames < 2) {
    readyFrames++;
    if (readyFrames === 2) {
      window.__DIAG.tris = renderer.info.render.triangles;
      window.__DIAG.calls = renderer.info.render.calls;
      if (params.get('camdbg') && mode === 'drive') {
        const wrap = document.getElementById('tc-gas').parentElement;
        const wr = wrap.getBoundingClientRect();
        hudRoad.textContent = `wrap w=${wr.width.toFixed(0)} x=${wr.x.toFixed(0)} vw=${innerWidth} dpr=${devicePixelRatio}`;
      }
      window.__READY = true;
      document.title = 'READY';
    }
  }
  frames++;
  fpsAcc += dt;
  if (fpsAcc >= 0.5) {
    window.__DIAG.fps = Math.round(frames / fpsAcc);
    frames = 0; fpsAcc = 0;
    const fpsEl = document.getElementById('fps');
    if (fpsEl) {
      fpsEl.textContent = window.__DIAG.fps;
      fpsEl.parentElement.style.visibility = 'visible';
    }
    // 自适应分辨率：帧率低自动降采样（弱机保流畅），恢复后再升回
    fpsAvg = fpsAvg * 0.62 + window.__DIAG.fps * 0.38;
    const nowMs = performance.now();
    if (nowMs - lastPRChange > 5000) {
      if (fpsAvg < 32 && pxTier < 2) { pxTier++; applyPR(); lastPRChange = nowMs; }
      else if (fpsAvg > 54 && pxTier > 0) { pxTier--; applyPR(); lastPRChange = nowMs; }
    }
  }
  // 驾驶小地图
  if (mode !== 'orbit') drawMinimap();
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
