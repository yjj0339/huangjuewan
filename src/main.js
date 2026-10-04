// 主程序：组装场景、灯光、材质、镜头预设与交互
import * as THREE from '../vendor/three.module.js';
import {
  makeAsphalt, makeConcrete, makeGrass,
  makeResiFacade, makeGlassFacade, makeShopFacade, makeCityGround,
  makeSign, makeCloudSprite, makeCloudShadowNoise, makeWater,
} from './textures.js';
import { buildNetwork, buildCollisionGrid, LEVELS } from './roads.js';
import { buildDeck, buildPiers } from './deck.js';
import {
  makeLampGeometry, placeLamps, makeSigns, makeGroundRoads,
  makeVegetation, makeCity, makePark,
} from './props.js';
import { Traffic, PlayerCar } from './traffic.js';
import { makeSky, makeLighting, makeClouds, makeOuterGround } from './env.js';

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

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d9e6, 1900, 6800);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 12000);
camera.position.set(620, 470, 620);

// ---------- 纹理与材质 ----------
const asphalt3 = makeAsphalt(3, { roadW: 11.5 });
const asphalt2 = makeAsphalt(2, { roadW: 9 });
const asphaltG3 = makeAsphalt(3, { roadW: 13 });
const asphaltG2 = makeAsphalt(2, { roadW: 11 });
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

// ---------- 路网 + 桥梁 ----------
const net = buildNetwork();
const grid = buildCollisionGrid(net.mains);

// 沥青纹理按车道数分配：先铺 deck 前给每种 road 绑定纹理（通过材质分组：主/匝道共用3车道贴图，
// 匝道9m 宽用 2 车道贴图 —— 通过在 buildDeck 里按 road.lanes 换 u 缩放即可，此处简单起见共用）
const deckGroup = new THREE.Group();
for (const road of [...net.mains, ...net.ramps]) {
  const geo = buildDeck(road, mats);
  const mesh = new THREE.Mesh(geo, [asphaltMat, concreteMat, metalMat]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  deckGroup.add(mesh);
}
scene.add(deckGroup);

// 桥墩
const piers = buildPiers([...net.mains, ...net.ramps], grid);
const pierMesh = new THREE.Mesh(piers.geo, concreteMat);
pierMesh.castShadow = true;
pierMesh.receiveShadow = true;
scene.add(pierMesh);

// ---------- 地面：公园 + 道路 + 外圈 ----------
scene.add(makeOuterGround(grassTex));
const park = makePark(parkTex, null, waterTex);
scene.add(park);
const groundRoads = makeGroundRoads(net.grounds, { 3: asphaltG3, 2: asphaltG2 });
scene.add(groundRoads);

// ---------- 附属 ----------
const lamps = placeLamps([...net.mains, ...net.ramps], makeLampGeometry());
scene.add(lamps);

const signMats = {
  post: new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.4 }),
  texG1: makeSign('green', [{ text: 'G50 沪渝高速', arrow: 'up' }, { text: '江北机场', arrow: 'right' }]),
  texG2: makeSign('green', [{ text: 'G75 兰海高速', arrow: 'up' }, { text: '南岸区', arrow: 'right' }]),
  texG3: makeSign('green', [{ text: '内环快速', arrow: 'up' }, { text: '大佛寺大桥', arrow: 'left' }]),
  texG4: makeSign('green', [{ text: '广阳岛', arrow: 'right' }, { text: '弹子石', arrow: 'up' }]),
  texG5: makeSign('green', [{ text: '朝天门大桥', arrow: 'up' }, { text: '江北区', arrow: 'left' }]),
  texG6: makeSign('green', [{ text: '黄桷湾立交', arrow: 'up' }, { text: '盘龙 出口', arrow: 'right' }]),
};
scene.add(makeSigns(net, signMats));

// ---------- 绿化 + 城市 ----------
// 近地匝道段样本（扁平 [x,z,...]），供植被避让
const lowSamples = [];
for (const road of [...net.ramps, ...net.mains]) {
  for (let s = 0; s <= road.length; s += 8) {
    const p = road.pts[road._seg(s)];
    if (p.y < 3.2) { lowSamples.push(p.x, p.z); }
  }
}
scene.add(makeVegetation(piers.placed, [...net.grounds], lowSamples));
scene.add(makeCity(net, texResi, texGlass, texShop, texCityGround));

// ---------- 天空/光/云 ----------
scene.add(makeSky());
const { sun } = makeLighting(scene);
const clouds = makeClouds(makeCloudSprite(3), makeCloudShadowNoise(7));
scene.add(clouds);

// ---------- 车流 ----------
const traffic = new Traffic(net, 1);
scene.add(traffic.group);

// ---------- 玩家驾驶车 ----------
const player = new PlayerCar(net);
scene.add(player.mesh);

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
  mode = m;
  if (m === 'drive') {
    player.mesh.visible = true;
    player.spawn(net.mains[0]);
    followCar = null;
    ctl.auto = false;
  } else if (m !== 'follow') {
    player.mesh.visible = false;
    followCar = null;
    camera.fov = 52;
    camera.updateProjectionMatrix();
  }
  touchPad.style.display = m === 'drive' ? 'flex' : 'none';
  hud.style.display = (m === 'drive' || m === 'follow') ? 'block' : 'none';
  document.getElementById('drive').classList.toggle('on', m === 'drive');
  document.getElementById('spin').style.visibility = m === 'orbit' ? 'visible' : 'hidden';
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
dom.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
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
const params = new URLSearchParams(location.search);
window.__READY = false;
window.__DIAG = { tris: 0, calls: 0, cars: traffic.cars.length, piers: 0, fps: 0 };
if (params.get('shot')) {
  applyPreset(params.get('shot'));
  ctl.auto = false;
}
if (params.get('drive')) setMode('drive');
if (params.get('follow')) {
  followCar = traffic.cars[(Math.random() * traffic.cars.length) | 0];
  setMode('follow');
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
const UPV = new THREE.Vector3(0, 1, 0);
const chaseTarget = new THREE.Vector3(), lookPos = new THREE.Vector3();
const focus = new THREE.Vector3(0, 12, 0);
let frames = 0, fpsAcc = 0, readyFrames = 0;
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
    chaseCam(pos, fwd, 8.5, 3.3, 9, dt, followCar.speed * followCar.forward);
    focus.copy(pos);
    hudSpeed.textContent = Math.round(Math.abs(followCar.speed) * 3.6);
    hudRoad.textContent = followCar.road.name;
  } else if (mode === 'drive') {
    const st = player.update(dt, input);
    chaseCam(st.pos, st.fwd, 8.2 + st.speed * 0.05, 3.4, 12, dt, st.speed);
    focus.copy(st.pos);
    hudSpeed.textContent = Math.round(st.speed * 3.6);
    hudRoad.textContent = player.road.name;
    hudHint.textContent = player.hint || 'W/↑ 油门 · S/↓ 刹车 · A/D 变道（出口提示出现时按 ←/→ 转入匝道）· ESC 退出';
  }

  traffic.update(dt * (params.get('speed') ? parseFloat(params.get('speed')) : 1));
  clouds.userData.tick(dt);

  // 太阳阴影相机跟随视野中心
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(new THREE.Vector3(420, 560, 300));

  renderer.render(scene, camera);

  if (readyFrames < 6) {
    readyFrames++;
    if (readyFrames === 6) {
      window.__DIAG.tris = renderer.info.render.triangles;
      window.__DIAG.calls = renderer.info.render.calls;
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
  }
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
