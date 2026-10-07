// 路网：5 层立体交通骨架（参照重庆黄桷湾立交：5 层 / 20 条匝道 / 8 方向）
// 层1 地面道路 G | 层2 主线A y=9 | 层3 主线B y=18 | 层4 主线C y=27 | 层5 主线D y=36
// 匝道两端通过"锚点自动对接"生成：起点/终点直接吸附到目标道路的采样点，位置、
// 标高、切向自动吻合，保证结构上真正互通。
import * as THREE from '../vendor/three.module.js?v=48';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const LEVELS = { G: 0.4, A: 9, B: 18, C: 27, D: 36 };

function smooth01(t) { return t * t * (3 - 2 * t); }

export class Road {
  constructor(name, kind, level, opts, pts) {
    this.name = name;
    this.kind = kind; // 'main' | 'ramp' | 'ground'
    this.level = level;
    this.carriageways = opts.carriageways || 'single'; // 'dual' 主线双向 | 'single' 单幅
    this.lanes = opts.lanes; // 单幅车道数
    this.median = opts.median || 3; // 双幅中央分隔带宽度
    this.width = opts.width || (this.carriageways === 'dual' ? this.lanes * 3.75 * 2 + this.median : this.lanes * 3.75 + 1.6);
    this.pts = pts;
    this._finalize();
  }
  _finalize() {
    const n = this.pts.length;
    this.cum = new Float32Array(n);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += this.pts[i].distanceTo(this.pts[i - 1]);
      this.cum[i] = acc;
    }
    this.length = acc;
    this._searchCache = null;
  }
  // 弧长 s → 段索引
  _seg(s) {
    const cum = this.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    return lo;
  }
  frameAt(s) {
    s = Math.max(0.001, Math.min(this.length - 0.001, s));
    const i = this._seg(s);
    const p0 = this.pts[i], p1 = this.pts[i + 1];
    const segLen = this.cum[i + 1] - this.cum[i] || 1e-6;
    const f = (s - this.cum[i]) / segLen;
    const p = p0.clone().lerp(p1, f);
    const tan = p1.clone().sub(p0).normalize();
    const side = tan.clone().cross(V3(0, 1, 0)).normalize(); // 行进方向右侧
    return { p, tan, side };
  }
  // 零分配采样：结果写入调用方提供的向量（热路径专用，避免每帧数千次 GC 卡顿）
  frameAtInto(s, p, tan, side) {
    s = Math.max(0.001, Math.min(this.length - 0.001, s));
    const i = this._seg(s);
    const p0 = this.pts[i], p1 = this.pts[i + 1];
    const segLen = this.cum[i + 1] - this.cum[i] || 1e-6;
    const f = (s - this.cum[i]) / segLen;
    p.copy(p0).lerp(p1, f);
    tan.copy(p1).sub(p0).normalize();
    side.copy(tan).cross(V3(0, 1, 0)).normalize();
  }
  anchorAt(s) {
    const f = this.frameAt(s);
    return { p: f.p, tan: f.tan, side: f.side, road: this, s, half: this.width / 2 };
  }
  // 找到距 (x,z) 水平距离最近的本道路弧长
  nearestS(x, z, yMax = Infinity) {
    let best = 0, bd = Infinity;
    const step = 4;
    for (let s = 0; s <= this.length; s += step) {
      const p = this.pts[this._seg(s)];
      if (p.y > yMax) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // 连续精确投影：粗定位后在相邻段上做点到线段投影（无量化跳变，驾驶吸附用）
  nearestSFine(x, z) {
    const i0 = this._seg(this.nearestS(x, z));
    let bs = 0, bpx = 0, bpz = 0, bd = Infinity;
    for (let i = Math.max(0, i0 - 1); i <= Math.min(this.pts.length - 2, i0 + 1); i++) {
      const a = this.pts[i], b = this.pts[i + 1];
      const ax = b.x - a.x, az = b.z - a.z;
      const L2 = ax * ax + az * az || 1e-6;
      let t = ((x - a.x) * ax + (z - a.z) * az) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ax * t, pz = a.z + az * t;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 < bd) { bd = d2; bs = this.cum[i] + Math.sqrt(L2) * t; bpx = px; bpz = pz; }
    }
    return { s: bs, x: bpx, z: bpz };
  }
}

// ---------- 基元采样 ----------
export function lineRoad(p0, p1, step = 6) {
  const pts = [];
  const len = p0.distanceTo(p1);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) pts.push(p0.clone().lerp(p1, i / n));
  return pts;
}

// 城市干道轴线（用于让主线落地后精确终止在路口，消灭"半路断头"）
const CITY_LINES = [
  { axis: 'z', v: 90 }, { axis: 'z', v: -280 }, { axis: 'z', v: -1500 }, { axis: 'z', v: 1500 },
  { axis: 'x', v: -90 }, { axis: 'x', v: -1500 }, { axis: 'x', v: 1500 },
];

// 沿方向 d 从 p 出发，到最近城市干道轴线的距离（取不到则 null）
function rayCityCross(p, d) {
  let best = null;
  for (const L of CITY_LINES) {
    const dc = L.axis === 'z' ? d.z : d.x;
    if (Math.abs(dc) < 1e-3) continue;
    const t = ((L.v) - (L.axis === 'z' ? p.z : p.x)) / dc;
    if (t < 40 || t > 3200) continue;
    const cross = L.axis === 'z' ? p.x + d.x * t : p.z + d.z * t;
    if (Math.abs(cross) > 2450) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

// 末端落地段：平滑降到地面，并一直延伸到最近的干道路口（路口即终点）
// 最后 15m 微抬 +0.12m 与干道沥青面齐平略高（形成路缘；不再下埋造成穿插）
export function endDescent(pts, dropLen = 320, yGround = 0.4) {
  const n0 = pts.length;
  const d = pts[n0 - 1].clone().sub(pts[n0 - 8]).setY(0).normalize();
  const y0 = pts[n0 - 1].y;
  const cross = rayCityCross(pts[n0 - 1], d);
  const totalLen = cross !== null
    ? Math.max(dropLen + 35, cross + 2)
    : dropLen + 60;
  const n = Math.max(10, Math.round(totalLen / 6));
  for (let i = 1; i <= n; i++) {
    const dist = totalLen * i / n;
    const e = smooth01(Math.min(1, dist / dropLen));
    let y = y0 + (yGround - y0) * e;
    const tailStart = totalLen - 15;
    if (dist > tailStart) y += 0.12 * ((dist - tailStart) / 15);
    pts.push(pts[n0 - 1].clone().addScaledVector(d, dist).setY(y));
  }
  return pts;
}

// 起点引坡段：反向外推（远端最后 15m 同样微抬与干道齐平略高）
export function headDescent(pts, dropLen = 320, yGround = 0.4) {
  const d = pts[0].clone().sub(pts[7]).setY(0).normalize(); // 指向起点的外侧
  const y0 = pts[0].y;
  const cross = rayCityCross(pts[0], d);
  const totalLen = cross !== null
    ? Math.max(dropLen + 35, cross + 2)
    : dropLen + 60;
  const n = Math.max(10, Math.round(totalLen / 6));
  const head = [];
  for (let i = n; i >= 1; i--) { // 从远端向近端
    const dist = totalLen * i / n;
    const e = smooth01(Math.min(1, dist / dropLen));
    let y = y0 + (yGround - y0) * e;
    const tailStart = totalLen - 15;
    if (dist > tailStart) y += 0.12 * ((dist - tailStart) / 15);
    head.push(pts[0].clone().addScaledVector(d, dist).setY(y));
  }
  pts.unshift(...head);
  return pts;
}

export function bezierRoad(p0, p1, p2, p3, step = 5) {
  const pts = [];
  const approxLen = p0.distanceTo(p3) * 1.3;
  const n = Math.max(8, Math.round(approxLen / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    const z = u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z;
    pts.push(V3(x, y, z));
  }
  return pts;
}

export function arcRoad(center, r0, r1, a0, a1, y0, y1, step = 4) {
  // r0→r1 半径线性变化（= 螺旋）；a0→a1 弧度（含方向）；y 线性过渡
  const pts = [];
  const totalAngle = Math.abs(a1 - a0);
  const avgR = (r0 + r1) / 2;
  const n = Math.max(12, Math.round((totalAngle * avgR) / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const r = r0 + (r1 - r0) * t;
    pts.push(V3(center.x + r * Math.cos(a), y0 + (y1 - y0) * t, center.z + r * Math.sin(a)));
  }
  return pts;
}

// ---------- 匝道生成 ----------
const crossY = (t, v) => t.z * v.x - t.x * v.z;
const RAMP_HALF = 4.55; // 匝道半宽

// 贝塞尔 S 形匝道：两端锚点（位置+切向）自动对接。
// 分支端/汇入端自动外移到主路路缘（留 0.3m 缝），消灭与主路共面重叠的 z-fighting。
export function rampFromAnchors(name, a0, a1, { ext0 = 70, ext1 = 70, off0 = true, off1 = true } = {}) {
  let p0 = a0.p.clone(), p3 = a1.p.clone();
  let c1 = p0.clone().addScaledVector(a0.tan, ext0);
  let c2 = p3.clone().addScaledVector(a1.tan, -ext1);
  if (off0 && a0.half) {
    const s0 = Math.sign(crossY(a0.tan, c2.clone().sub(p0))) || 1;
    // 重叠 2.6m 而非留缝：桥面深度偏移材质保证不闪烁，视觉上无缝汇入
    const o = a0.side.clone().multiplyScalar(-s0 * (a0.half + RAMP_HALF - 0.3));
    p0 = p0.add(o); c1 = c1.add(o);
  }
  if (off1 && a1.half) {
    const s1 = Math.sign(crossY(a1.tan, c2.clone().sub(p3))) || -1;
    const o = a1.side.clone().multiplyScalar(-s1 * (a1.half + RAMP_HALF - 0.3));
    p3 = p3.add(o); c2 = c2.add(o.clone().multiplyScalar(0.55));
  }
  const pts = bezierRoad(p0, c1, c2, p3, 5);
  // 高度：端点已有 y，内部余弦过渡（保证与两端标高严格吻合）
  const y0 = a0.p.y, y1 = a1.p.y;
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    pts[i].y = y0 + (y1 - y0) * smooth01(t);
  }
  return new Road(name, 'ramp', null, { carriageways: 'single', lanes: 2 }, pts);
}

// 环形匝道：起点切向贴合 fromRoad（贴路缘），圆弧扫过 sweepDeg 后自动对接 toRoad 路缘
// profile 可选：{t0, amp, w} —— 沿弧长的正态凸/凹（确定性上跨/下穿，解决多重编织无解区）
export function loopRamp(name, fromRoad, sExit, turn, r, sweepDeg, toRoad, profile = null) {
  const a0 = fromRoad.anchorAt(sExit);
  const sideDir = a0.side.clone().multiplyScalar(turn);
  const start = a0.half ? a0.p.clone().addScaledVector(sideDir, a0.half + RAMP_HALF - 0.3) : a0.p.clone();
  const center = start.clone().addScaledVector(sideDir, r);
  const yTarget = toRoad.pts[0].y; // 目标层高
  const θ0 = Math.atan2(start.z - center.z, start.x - center.x);
  const θ1 = θ0 + turn * (sweepDeg * Math.PI / 180);
  const arcPts = arcRoad(center, r, r, θ0, θ1, a0.p.y, yTarget, 4);
  if (profile) {
    for (let i = 0; i < arcPts.length; i++) {
      const t = i / (arcPts.length - 1);
      arcPts[i].y += profile.amp * Math.exp(-(((t - profile.t0) / (profile.w || 0.18)) ** 2));
    }
  }
  const arc = new Road(name + '_arc', 'ramp', null, { carriageways: 'single', lanes: 2 }, arcPts);
  const arcEnd = arc.anchorAt(arc.length);
  const sMerge = toRoad.nearestS(arcEnd.p.x, arcEnd.p.z);
  const aMerge = toRoad.anchorAt(sMerge);
  const road = joinRoads(name, arc, aMerge, { ext1: 45, off0: false });
  road.exit = { road: fromRoad, s: sExit };      // 驾驶系统：从 fromRoad 的 s 处进入本匝道
  road.merge = { road: toRoad, s: sMerge };      // 驾驶系统：本匝道末端并入 toRoad 的 s 处
  return road;
}

// 把 roadA 末端与锚点 a1 用短贝塞尔连成一条匝道
export function joinRoads(name, roadA, a1, { ext1 = 45, off1 = true } = {}) {
  const a0 = roadA.anchorAt(roadA.length);
  const tail = rampFromAnchors(name + '_tail', a0, a1, { ext0: 30, ext1, off0: false, off1 });
  const pts = roadA.pts.concat(tail.pts.slice(1));
  return new Road(name, 'ramp', null, { carriageways: 'single', lanes: 2 }, pts);
}

// 螺旋匝道（展示性大件）：给定圆心/角度域，两端各自自动对接
export function spiralRamp(name, center, rOuter, rInner, a0, turns, turn, y0, y1) {
  const a1 = a0 + turn * turns * Math.PI * 2;
  return { center, rOuter, rInner, a0, a1, y0, y1 };
}

// ---------- 整网 ----------
export function buildNetwork() {
  const mains = [], ramps = [], grounds = [];

  // ===== 主线（两端落地延伸，接入城市路网，不再是断头高架）=====
  // 主线 A：东西向高架（层2）——两端落地并终止于城市干道路口
  {
    const pts = lineRoad(V3(-1050, LEVELS.A, -60), V3(1050, LEVELS.A, -60));
    headDescent(pts, 220); endDescent(pts, 220);
    mains.push(new Road('主线A·东西', 'main', 'A', { carriageways: 'dual', lanes: 3, median: 3 }, pts));
  }
  // 主线 B：南北向高架（层3）
  {
    const pts = lineRoad(V3(40, LEVELS.B, 1050), V3(40, LEVELS.B, -1050));
    headDescent(pts, 340); endDescent(pts, 340);
    mains.push(new Road('主线B·南北', 'main', 'B', { carriageways: 'dual', lanes: 3, median: 3 }, pts));
  }
  // 主线 C：西北—东南 对角主线（层4，带缓曲）
  {
    const bez = bezierRoad(V3(-440, LEVELS.C, -330), V3(-150, LEVELS.C, -80), V3(140, LEVELS.C, 60), V3(440, LEVELS.C, 330));
    const end = bez[bez.length - 1];
    const d = bez[bez.length - 1].clone().sub(bez[bez.length - 6]).setY(0).normalize();
    const ext = lineRoad(end, end.clone().addScaledVector(d, 700));
    const pts = bez.concat(ext.slice(1));
    headDescent(pts, 480); endDescent(pts, 480);
    mains.push(new Road('主线C·西北东南', 'main', 'C', { carriageways: 'dual', lanes: 3, median: 3 }, pts));
  }
  // 主线 D：西南—东北 对角主线（层5 最高）
  {
    const bez = bezierRoad(V3(-440, LEVELS.D, 330), V3(-160, LEVELS.D, 100), V3(150, LEVELS.D, -70), V3(440, LEVELS.D, -330));
    const end = bez[bez.length - 1];
    const d = bez[bez.length - 6].clone().sub(bez[bez.length - 1]).setY(0).normalize().negate();
    const ext = lineRoad(end, end.clone().addScaledVector(d, 700));
    const pts = bez.concat(ext.slice(1));
    headDescent(pts, 620); endDescent(pts, 620);
    mains.push(new Road('主线D·西南东北', 'main', 'D', { carriageways: 'dual', lanes: 3, median: 3 }, pts));
  }
  const A = mains[0], B = mains[1], C = mains[2], D = mains[3];

  // 地面道路（层1，延伸进城市深处；双向双幅，宽度由车道自动推算）
  grounds.push(new Road('地面·滨江路', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(-2300, LEVELS.G, 90), V3(2300, LEVELS.G, 90))));
  grounds.push(new Road('地面·林荫大道', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(-90, LEVELS.G, 2300), V3(-90, LEVELS.G, -2300))));
  grounds.push(new Road('地面·北横路', 'ground', 'G', { carriageways: 'dual', lanes: 2, median: 2 },
    lineRoad(V3(-2300, LEVELS.G, -280), V3(2300, LEVELS.G, -280))));
  // 二环干道（主线落地段的终点路口就落在这些路上）
  grounds.push(new Road('地面·西三环', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(-1500, LEVELS.G, 2400), V3(-1500, LEVELS.G, -2400))));
  grounds.push(new Road('地面·东三环', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(1500, LEVELS.G, 2400), V3(1500, LEVELS.G, -2400))));
  grounds.push(new Road('地面·南四路', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(-2400, LEVELS.G, -1500), V3(2400, LEVELS.G, -1500))));
  grounds.push(new Road('地面·北四路', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4 },
    lineRoad(V3(-2400, LEVELS.G, 1500), V3(2400, LEVELS.G, 1500))));
  const G1 = grounds[0], G2 = grounds[1], G3 = grounds[2];

  // ===== 20 条匝道 =====
  // -- A×B 苜蓿叶环圈（4 条，围绕交点 (40,-60)）--
  ramps.push(loopRamp('匝道R1·A东转B北', A, A.nearestS(150, -60), +1, 52, 262, B));   // 9→18 上
  ramps.push(loopRamp('匝道R2·B北转A西', B, B.nearestS(40, -180), -1, 52, 262, A));   // 18→9 下
  ramps.push(loopRamp('匝道R3·A西转B南', A, A.nearestS(-60, -60), +1, 52, 262, B, { t0: 0.70, amp: +5.0, w: 0.22 }));
  ramps.push(loopRamp('匝道R4·B南转A东', B, B.nearestS(40, 60), -1, 52, 262, A, { t0: 0.70, amp: -5.0, w: 0.22 }));

  // -- B×C 环圈（4 条，围绕交点 (40,~95)）--
  ramps.push(loopRamp('匝道R5·C转B北', C, C.nearestS(150, 190), -1, 40, 262, B));
  ramps.push(loopRamp('匝道R6·B北转C', B, B.nearestS(40, 0), +1, 40, 262, C));
  ramps.push(loopRamp('匝道R7·C转B南', C, C.nearestS(-60, 10), +1, 40, 262, B));
  ramps.push(loopRamp('匝道R8·B南转C', B, B.nearestS(40, 190), -1, 40, 262, C));

  // -- C×D 定向半直接匝道（4 条，大 S 曲线）--
  const direct = (name, fromRoad, s0, toRoad, s1, ext = 110) => {
    const r = rampFromAnchors(name, fromRoad.anchorAt(s0), toRoad.anchorAt(s1), { ext0: ext, ext1: ext });
    r.exit = { road: fromRoad, s: s0 };
    r.merge = { road: toRoad, s: s1 };
    ramps.push(r);
    return r;
  };
  direct('匝道R9·D转C', D, D.nearestS(150, -110), C, C.nearestS(260, 175));
  direct('匝道R10·C转D', C, C.nearestS(-120, -55), D, D.nearestS(-230, 160));
  direct('匝道R11·D转C', D, D.nearestS(-180, 130), C, C.nearestS(-300, -160));
  direct('匝道R12·C转D', C, C.nearestS(60, 120), D, D.nearestS(180, -140));

  // -- 落地匝道（主线 ⇄ 地面路，塑造 8 方向）--
  const land = (name, fromRoad, s0, toRoad, s1, ext0 = 80, ext1 = 130) => {
    const r = rampFromAnchors(name, fromRoad.anchorAt(s0), toRoad.anchorAt(s1), { ext0, ext1 });
    r.exit = { road: fromRoad, s: s0 };
    r.merge = { road: toRoad, s: s1 };
    ramps.push(r);
    return r;
  };
  land('匝道R13·A西落地', A, A.nearestS(-560, -60), G3, G3.nearestS(-560, -280));
  land('匝道R14·A东落地', A, A.nearestS(500, -60), G1, G1.nearestS(500, 90));
  land('匝道R15·C东南落地', C, C.nearestS(600, 480), G1, G1.nearestS(560, 90), 110, 140);
  land('匝道R16·B北落地', B, B.nearestS(40, 560), G2, G2.nearestS(-90, 560), 80, 110);
  land('匝道R20·B南落地', B, B.nearestS(40, 300), G1, G1.nearestS(120, 90), 90, 130);
  land('匝道R21·D东北落地', D, D.nearestS(600, -500), G3, G3.nearestS(560, -280), 110, 120);

  // -- 两条螺旋匝道（地标性）--
  // SP1：东南象限，地面 G1 → 层4 主线C，顺时针爬升 1.6 圈
  {
    const sp = spiralRamp('匝道SP1·螺旋上行', V3(270, 0, 165), 68, 46, -Math.PI / 2, 1.6, +1, LEVELS.G, LEVELS.C);
    const arcPts = arcRoad(sp.center, sp.rOuter, sp.rInner, sp.a0, sp.a1, sp.y0, sp.y1, 4);
    const arc = new Road('匝道SP1·螺旋上行', 'ramp', null, { carriageways: 'single', lanes: 2 }, arcPts);
    const head = arc.anchorAt(0);
    const sG = G1.nearestS(head.p.x, head.p.z);
    const aG = G1.anchorAt(sG);
    // 引道：G1 → 螺旋起点（起点外移到 G1 路缘，终点切向 = 螺旋起点切向）
    const c2L = head.p.clone().addScaledVector(head.tan, -30);
    const s0L = Math.sign(crossY(aG.tan, c2L.clone().sub(aG.p))) || 1;
    const offL = aG.side.clone().multiplyScalar(-s0L * (aG.half + RAMP_HALF - 0.3));
    const startL = aG.p.clone().add(offL);
    const leadPts = bezierRoad(startL, startL.clone().addScaledVector(aG.tan, 40),
      c2L, head.p, 5);
    const y0 = aG.p.y;
    for (let i = 0; i < leadPts.length; i++) leadPts[i].y = y0;
    const endA = arc.anchorAt(arc.length);
    const sC = C.nearestS(endA.p.x, endA.p.z);
    const aC = C.anchorAt(sC);
    const full = joinRoads('匝道SP1·螺旋上行', arc, aC, { ext1: 50 });
    const road = new Road('匝道SP1·螺旋上行', 'ramp', null, { carriageways: 'single', lanes: 2 },
      leadPts.concat(arc.pts.slice(1), full.pts.slice(arc.pts.length)));
    road.exit = { road: G1, s: sG };
    road.merge = { road: C, s: sC };
    ramps.push(road);
  }  // SP2：西北象限，层4 主线C → 地面 G2，逆时针下降 1.5 圈
  {
    const sp = spiralRamp('匝道SP2·螺旋下行', V3(-155, 0, -115), 66, 44, Math.PI * 0.22, 1.5, -1, LEVELS.C, LEVELS.G);
    const arcPts = arcRoad(sp.center, sp.rOuter, sp.rInner, sp.a0, sp.a1, sp.y0, sp.y1, 4);
    const arc = new Road('匝道SP2·螺旋下行', 'ramp', null, { carriageways: 'single', lanes: 2 }, arcPts);
    const head = arc.anchorAt(0);
    const sC = C.nearestS(head.p.x, head.p.z);
    const aC = C.anchorAt(sC);
    const lead = rampFromAnchors('SP2引道', aC, { ...head, tan: head.tan.clone() }, { ext0: 60, ext1: 30, off1: false });
    const endA = arc.anchorAt(arc.length);
    const sG = G2.nearestS(endA.p.x, endA.p.z);
    const aG = G2.anchorAt(sG);
    const full = joinRoads('匝道SP2·螺旋下行', arc, aG, { ext1: 60 });
    const road = new Road('匝道SP2·螺旋下行', 'ramp', null, { carriageways: 'single', lanes: 2 },
      lead.pts.concat(arc.pts.slice(1), full.pts.slice(arc.pts.length)));
    road.exit = { road: C, s: sC };
    road.merge = { road: G2, s: sG };
    ramps.push(road);
  }

  // 净空松驰：把中途跨越净空不足的匝道推到安全高度
  const net = { mains, ramps, grounds, all: [...grounds, ...mains, ...ramps] };
  // 主线末端 → 最近城市干道路口（驾驶与 AI 车流在尽头自动转入干道，不再凭空消失）
  for (const m of mains) {
    const end = m.pts[m.pts.length - 1];
    let best = null, bd = Infinity;
    for (const g of grounds) {
      const sg = g.nearestS(end.x, end.z);
      const p = g.pts[g._seg(sg)];
      const d2 = (p.x - end.x) ** 2 + (p.z - end.z) ** 2;
      if (d2 < bd) { bd = d2; best = { road: g, s: sg }; }
    }
    if (best && Math.sqrt(bd) < 22) {
      m.merge = best;
      const e1 = m.pts[m.pts.length - 1], e0 = m.pts[m.pts.length - 8];
      m.merge.fwd = landingFwd(e1.clone().sub(e0).setY(0).normalize(), best.road.frameAt(best.s).tan);
      // 终点路口：两侧护栏都开豁口（路口不设护栏）；目标干道的护栏同样断开
      regOpening(m, 1, m.length, 26);
      regOpening(m, -1, m.length, 26);
      regOpening(best.road, 1, best.s, 20);
      regOpening(best.road, -1, best.s, 20);
    }
  }
  // 汇入段延伸：匝道末端沿目标路面前行 ~52m 并横向收进目标路面内，
  // 沥青真正叠在目标路上（深度偏移材质防闪烁），消灭"斜插路肩即断头"的观感
  extendMergeTails(ramps);
  // 地面路中分带断口：G×G 平交路口 + 主线/匝道汇入点（墙不能横穿路口）
  for (const g of grounds) g.medianBreaks = [];
  for (const m of mains) m.medianBreaks = [];
  for (let i = 0; i < grounds.length; i++) for (let j = i + 1; j < grounds.length; j++) {
    const a = grounds[i], b = grounds[j];
    const ad = a.pts[a.pts.length - 1].clone().sub(a.pts[0]).setY(0).normalize();
    const bd = b.pts[b.pts.length - 1].clone().sub(b.pts[0]).setY(0).normalize();
    if (Math.abs(ad.dot(bd)) > 0.7) continue; // 平行不相交
    for (let s = 20; s < a.length - 20; s += 6) {
      const p = a.pts[a._seg(s)];
      const sb = b.nearestS(p.x, p.z);
      const q = b.pts[b._seg(sb)];
      if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 4) {
        a.medianBreaks.push(s);
        b.medianBreaks.push(sb);
        regOpening(a, 1, s, 16); regOpening(a, -1, s, 16);   // 路口护栏断开
        regOpening(b, 1, sb, 16); regOpening(b, -1, sb, 16);
        break;
      }
    }
  }
  const breakMedianAt = (r) => {
    if (!r.merge || r.merge.road.kind !== 'ground') return;
    r.merge.road.medianBreaks.push(r.merge.s);
  };
  for (const r of ramps) breakMedianAt(r);
  for (const m of mains) breakMedianAt(m);
  // 主线落地段以地面高度横穿地面路（如 B 落地穿过北横路）：双方护栏/中分墙断开
  for (const m of mains) {
    m._gradeX = [];
    for (let s = 40; s < m.length - 40; s += 6) {
      const p = m.pts[m._seg(s)];
      if (p.y > 1.3) continue; // 仅落地段参与平交
      for (const g of grounds) {
        const sg = g.nearestS(p.x, p.z);
        const q = g.pts[g._seg(sg)];
        if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 < (m.width / 2 + g.width / 2) ** 2) {
          m.medianBreaks.push(s);
          g.medianBreaks.push(sg);
          regOpening(m, 1, s, 20); regOpening(m, -1, s, 20);
          regOpening(g, 1, sg, 20); regOpening(g, -1, sg, 20);
          m._gradeX.push({ s, W: g.width / 2 + m.width / 2 });
        }
      }
    }
    // 平交处主线沥青与地面路共面 → 微抬 16cm 防闪烁（缓坡过渡，行车无感）
    for (const cx of m._gradeX) {
      for (let i = 0; i < m.pts.length; i++) {
        const d = Math.abs(m.cum[i] - cx.s);
        if (d < cx.W + 14) m.pts[i].y += 0.16 * smooth01(Math.min(1, (cx.W + 14 - d) / 14));
      }
    }
  }
  // 主线头端落地：同样接入最近地面路（AI 反向车流到头不再瞬移环回）
  for (const m of mains) {
    const end = m.pts[0];
    let best = null, bd = Infinity;
    for (const g of grounds) {
      const sg = g.nearestS(end.x, end.z);
      const p = g.pts[g._seg(sg)];
      const d2 = (p.x - end.x) ** 2 + (p.z - end.z) ** 2;
      if (d2 < bd) { bd = d2; best = { road: g, s: sg }; }
    }
    if (best && Math.sqrt(bd) < 22) {
      best.fwd = landingFwd(m.pts[0].clone().sub(m.pts[7]).setY(0).normalize(), best.road.frameAt(best.s).tan);
      m.mergeHead = best;
      regOpening(m, 1, 0.5, 26);
      regOpening(m, -1, 0.5, 26);
      regOpening(best.road, 1, best.s, 20);
      regOpening(best.road, -1, best.s, 20);
    }
  }
  // 护栏豁口登记：所有匝道↔主线的分流/汇合点，双方对应侧都开口（车辆与视觉真正互通）
  for (const r of ramps) {
    if (r.exit) {
      const f = r.exit.road.frameAt(r.exit.s);
      const rp = r.frameAt(2);
      const uParent = rp.p.clone().sub(f.p).dot(f.side);        // 主线相对匝道的方位
      regOpening(r, uParent >= 0 ? 1 : -1, 0.5, 45);
      const uRamp = f.p.clone().sub(rp.p).dot(rp.side);          // 匝道相对主线的方位
      regOpening(r.exit.road, uRamp >= 0 ? 1 : -1, r.exit.s, 48);
    }
    if (r.merge) {
      const f = r.merge.road.frameAt(r.merge.s);
      const rp = r.frameAt((r.preTailLen ?? r.length) - 2);
      const uParent = rp.p.clone().sub(f.p).dot(f.side);
      regOpening(r, uParent >= 0 ? 1 : -1, r.length, 60);
      const uRamp = f.p.clone().sub(rp.p).dot(rp.side);
      regOpening(r.merge.road, uRamp >= 0 ? 1 : -1, r.merge.s, 60);
    }
  }
  relaxClearances(net);
  return net;
}

// 落地合并的行进方向选择：优先右转（右侧通行自然转向），其次同向
// outDir = 主线冲出端口的行进方向; gtan = 目标路规范切向
function landingFwd(outDir, gtan) {
  const rightZ = outDir.z, rightX = -outDir.x; // up × outDir 的水平分量
  const dotR = rightZ * gtan.z + rightX * gtan.x;
  if (Math.abs(dotR) > 0.3) return dotR >= 0 ? 1 : -1;
  return outDir.dot(gtan) >= 0 ? 1 : -1;
}

// 汇入段延伸：沿目标路面前行 EXT 米、横向从"路缘外"平滑收进目标车道内。
// 结束点严格位于目标路面内（|lat| + 匝道半宽 ≤ 目标半宽 - 0.8），
// 高度每点贴合目标路面 +5cm（深度偏移材质防共面闪烁）。
// r.merge.sEnd = 汇入完成点在目标路上的弧长（traffic 换道落点用）。
function extendMergeTails(ramps) {
  ramps.forEach((r, idx) => {
    const mg = r.merge;
    if (!mg) return;
    const target = mg.road;
    const half = target.width / 2;
    const endF = r.frameAt(r.length);
    const mF = target.frameAt(mg.s);
    const lat0 = endF.p.clone().sub(mF.p).dot(mF.side);
    const dir = Math.sign(lat0) || 1;
    const endLat = Math.max(2.0, half - r.width / 2 - 0.8) * dir;
    const EXT = 52;
    const n = 13;
    r.preTailLen = r.length;
    // 同点汇入的匝道尾巴会共面叠加（如 R1/R3 同汇 B），按序号错开 3.5cm 防闪烁
    const yOff = 0.05 + (idx % 4) * 0.035;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const f = target.frameAt(mg.s + EXT * t);
      const lat = lat0 + (endLat - lat0) * smooth01(t);
      r.pts.push(f.p.clone().addScaledVector(f.side, lat).setY(f.p.y + yOff));
    }
    r.mergeTailS0 = r.preTailLen - 10; // 净空松驰跳过尾段（尾段与目标路共面是刻意的）
    r._finalize();
    r.merge.sEnd = Math.min(target.length - 6, mg.s + EXT);
    regOpening(r, 1, r.length - EXT / 2, EXT / 2 + 10);   // 尾段双侧护栏全开
    regOpening(r, -1, r.length - EXT / 2, EXT / 2 + 10);
  });
}

// 给道路登记一段护栏豁口（side: 本路 frame 的左右；s: 中点弧长；half: 半长）
// 地面路同样生效：G 路护栏在平交路口/匝道汇入点必须断开，否则栏杆横穿路面
function regOpening(road, side, s, half) {
  if (!road) return;
  if (!road.openings) road.openings = [];
  road.openings.push({ side, s, half });
}

// ---------- 净空松驰与审计 ----------
const CLEAR = 5.2;
const OVERSHOOT = 1.6;
function buildSampleMap(all, cell = 22) {
  const map = new Map();
  const add = (o) => {
    const k = Math.floor(o.x / cell) + ',' + Math.floor(o.z / cell);
    let arr = map.get(k);
    if (!arr) { arr = []; map.set(k, arr); }
    arr.push(o);
  };
  for (const r of all) {
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i];
      add({ x: p.x, z: p.z, y: p.y, half: r.width / 2, road: r, idx: i });
    }
  }
  const near = (x, z, rad) => {
    const out = [];
    const x0 = Math.floor((x - rad) / cell), x1 = Math.floor((x + rad) / cell);
    const z0 = Math.floor((z - rad) / cell), z1 = Math.floor((z + rad) / cell);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const arr = map.get(i + ',' + j);
      if (arr) out.push(...arr);
    }
    return out;
  };
  return { near, rebuild: () => { map.clear(); } };
}

function rebuildMap(all, sampler) {
  sampler.rebuild();
  // 重新填充：直接再跑一遍 add（rebuild 只清了 map，借助闭包太绕，这里简单重扫）
  return buildSampleMap(all);
}

// 匝道中途跨越其它道路时高度不足 → 沿程推高/压低到安全净空（主线/地面路固定，只动匝道）
// 推挤方向由「初始高度关系」锁定，避免两路高度接近时每轮翻向造成震荡
export function relaxClearances(net) {
  const origY = new Map();
  for (const r of net.all) {
    const a = new Float32Array(r.pts.length);
    for (let i = 0; i < r.pts.length; i++) a[i] = r.pts[i].y;
    origY.set(r, a);
  }
  let sampler = buildSampleMap(net.all);
  for (let pass = 0; pass < 6; pass++) {
    let changed = 0;
    for (let ri = 0; ri < net.ramps.length; ri++) {
      const R = net.ramps[ri];
      const n = R.pts.length;
      const dy = new Float32Array(n);
      const rOrig = origY.get(R) || null;
      for (let i = 0; i < n; i++) {
        const p = R.pts[i];
        const s = R.cum[i];
        if (s < 32 || s > R.length - 32) continue; // 分支/汇入段不调
        if (R.mergeTailS0 != null && s >= R.mergeTailS0) continue; // 汇入延伸段与目标路共面是刻意的
        const cand = sampler.near(p.x, p.z, R.width / 2 + 18);
        for (const q of cand) {
          if (q.road === R) continue;
          if (q.road === R.exit?.road && s < 80) continue;
          if (q.road === R.merge?.road && s > R.length - 80) continue;
          const lat = Math.hypot(q.x - p.x, q.z - p.z);
          if (lat > R.width / 2 + q.half + 1.2) continue;
          if (Math.abs(p.y - q.y) >= CLEAR) continue;
          let need;
          if (q.y < 1) need = q.y + CLEAR;            // 地面路：只能从上方跨
          else if (p.y > q.y) need = q.y + CLEAR;      // 当前在上方 → 抬到安全高
          else {
            need = q.y - CLEAR;                        // 当前在下方 → 压到安全低
            if (need < 1.2) need = q.y + CLEAR;        // 压不下去就翻到上方
          }
          need += (p.y > q.y ? 1 : -1) * OVERSHOOT;    // 过冲补偿平滑稀释
          const d = need - p.y;
          dy[i] = d > 0 ? Math.max(dy[i], d) : Math.min(dy[i], d);
        }
      }
      if (!dy.some(v => v !== 0)) continue;
      // 沿程平滑（盒滤波两轮，窗口收窄减少稀释）
      for (let it = 0; it < 2; it++) {
        const sm = dy.slice();
        for (let i = 0; i < n; i++) {
          let a = 0, c = 0;
          for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) { a += sm[j]; c++; }
          dy[i] = a / c;
        }
      }
      // 两端渐变到 0（保持锚点接合）
      const stepLen = R.length / (n - 1);
      const fadeN = Math.min(Math.round(60 / stepLen), (n - 1) >> 1);
      for (let i = 0; i < fadeN; i++) {
        const f = i / fadeN;
        dy[i] *= f; dy[n - 1 - i] *= f;
      }
      for (let i = 0; i < n; i++) R.pts[i].y = Math.max(0.45, R.pts[i].y + dy[i]);
      const nr = new Road(R.name, R.kind, R.level, { carriageways: 'single', lanes: 2 }, R.pts);
      nr.exit = R.exit; nr.merge = R.merge;
      nr.openings = R.openings;
      net.ramps[ri] = nr;
      const ia = net.all.indexOf(R);
      if (ia >= 0) net.all[ia] = nr;
      origY.set(nr, rOrig || new Float32Array(nr.pts.length).fill(0));
      changed++;
    }
    if (!changed) break;
    sampler = rebuildMap(net.all, sampler);
  }
}

// 审计：返回仍存在的交叉净空冲突（分支/汇入区除外）
// full=1 时检查所有道路对（含主线↔主线、主线↔地面路、地面路↔地面路）
export function auditClearances(net, full = false) {
  const sampler = buildSampleMap(net.all);
  const out = [];
  const roadsToCheck = full ? net.all : net.ramps;
  for (const R of roadsToCheck) {
    for (let i = 0; i < R.pts.length; i++) {
      const p = R.pts[i];
      const s = R.cum[i];
      const isEnd = s < 32 || s > R.length - 32;
      if (!full && (isEnd)) continue;
      const cand = sampler.near(p.x, p.z, R.width / 2 + 18);
      for (const q of cand) {
        if (q.road === R || q.road.name <= R.name) continue; // 每对只报一次
        // 分支/汇入区跳过
        if (R.exit?.road === q.road && s < 80) continue;
        if (R.merge?.road === q.road && s > R.length - 80) continue;
        if (q.road.exit?.road === R && q.idx * (q.road.length / q.road.pts.length) < 80) continue;
        if (q.road.merge?.road === R && (q.road.length - q.idx * (q.road.length / q.road.pts.length)) < 80) continue;
        // 地面路交叉跳过（平交路口正常）
        if (R.kind === 'ground' && q.road.kind === 'ground') continue;
        // 主线落地段贴地部分 vs 地面路跳过
        if (p.y < 1.5 && q.y < 1.5) continue;
        const lat = Math.hypot(q.x - p.x, q.z - p.z);
        if (lat > R.width / 2 + q.half + 1.2) continue;
        const dy = Math.abs(p.y - q.y);
        if (dy < CLEAR) {
          out.push({ a: R.name, b: q.road.name, lat: +lat.toFixed(1), dy: +dy.toFixed(1), x: +p.x.toFixed(0), z: +p.z.toFixed(0) });
        }
      }
    }
  }
  return out;
}

// 收集所有高架路面采样点 → 空间网格（桥墩/路灯/门架避让查询用）
export function buildCollisionGrid(roads) {
  const cell = 24;
  const grid = new Map();
  for (const road of roads) {
    if (road.kind === 'ground') continue;
    for (let s = 0; s <= road.length; s += 5) {
      const p = road.pts[road._seg(s)];
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x: p.x, z: p.z, y: p.y, road, half: road.width / 2 });
    }
  }
  return {
    cell,
    circle(x, z, radius) {
      const out = [];
      const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell);
      const z0 = Math.floor((z - radius) / cell), z1 = Math.floor((z + radius) / cell);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const arr = grid.get(`${i},${j}`);
        if (arr) out.push(...arr);
      }
      return out;
    },
  };
}
