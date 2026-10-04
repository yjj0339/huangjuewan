// 路网：5 层立体交通骨架（参照重庆黄桷湾立交：5 层 / 20 条匝道 / 8 方向）
// 层1 地面道路 G | 层2 主线A y=9 | 层3 主线B y=18 | 层4 主线C y=27 | 层5 主线D y=36
// 匝道两端通过"锚点自动对接"生成：起点/终点直接吸附到目标道路的采样点，位置、
// 标高、切向自动吻合，保证结构上真正互通。
import * as THREE from '../vendor/three.module.js';

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
  anchorAt(s) {
    const f = this.frameAt(s);
    return { p: f.p, tan: f.tan, side: f.side, road: this, s };
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
}

// ---------- 基元采样 ----------
export function lineRoad(p0, p1, step = 6) {
  const pts = [];
  const len = p0.distanceTo(p1);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) pts.push(p0.clone().lerp(p1, i / n));
  return pts;
}

// 落地延伸段：沿末端切向先平滑降到地面，再贴地延伸一段（消灭"断头高架桥"）
export function descentTail(pts, dropLen = 460, runLen = 420, yGround = 0.4) {
  const n0 = pts.length;
  const d = pts[n0 - 1].clone().sub(pts[n0 - 8]).setY(0).normalize();
  const y0 = pts[n0 - 1].y;
  const nDrop = Math.max(8, Math.round(dropLen / 6));
  for (let i = 1; i <= nDrop; i++) {
    const t = i / nDrop;
    const e = smooth01(t);
    pts.push(pts[n0 - 1].clone().addScaledVector(d, dropLen * t).setY(y0 + (yGround - y0) * e));
  }
  const last = pts[pts.length - 1];
  const nRun = Math.max(4, Math.round(runLen / 8));
  for (let i = 1; i <= nRun; i++) pts.push(last.clone().addScaledVector(d, runLen * i / nRun).setY(yGround));
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
// 贝塞尔 S 形匝道：两端锚点（位置+切向）自动对接，控制点沿切向伸出
export function rampFromAnchors(name, a0, a1, { ext0 = 70, ext1 = 70 } = {}) {
  const p0 = a0.p.clone();
  const p3 = a1.p.clone();
  const c1 = p0.clone().addScaledVector(a0.tan, ext0);
  const c2 = p3.clone().addScaledVector(a1.tan, -ext1);
  const pts = bezierRoad(p0, c1, c2, p3, 5);
  // 高度：端点已有 y，内部余弦过渡（保证与两端标高严格吻合）
  const y0 = a0.p.y, y1 = a1.p.y;
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    pts[i].y = y0 + (y1 - y0) * smooth01(t);
  }
  return new Road(name, 'ramp', null, { carriageways: 'single', lanes: 2 }, pts);
}

// 环形匝道：起点切向贴合 fromRoad，圆弧扫过 sweepDeg 后自动搜索 toRoad 最近点对接
export function loopRamp(name, fromRoad, sExit, turn, r, sweepDeg, toRoad) {
  const a0 = fromRoad.anchorAt(sExit);
  const sideDir = a0.side.clone().multiplyScalar(turn);
  const center = a0.p.clone().addScaledVector(sideDir, r);
  const yTarget = toRoad.pts[0].y; // 目标层高
  const θ0 = Math.atan2(a0.p.z - center.z, a0.p.x - center.x);
  const θ1 = θ0 + turn * (sweepDeg * Math.PI / 180);
  const arcPts = arcRoad(center, r, r, θ0, θ1, a0.p.y, yTarget, 4);
  const arc = new Road(name + '_arc', 'ramp', null, { carriageways: 'single', lanes: 2 }, arcPts);
  const arcEnd = arc.anchorAt(arc.length);
  const sMerge = toRoad.nearestS(arcEnd.p.x, arcEnd.p.z);
  const aMerge = toRoad.anchorAt(sMerge);
  const road = joinRoads(name, arc, aMerge, { ext1: 45 });
  road.exit = { road: fromRoad, s: sExit };      // 驾驶系统：从 fromRoad 的 s 处进入本匝道
  road.merge = { road: toRoad, s: sMerge };      // 驾驶系统：本匝道末端并入 toRoad 的 s 处
  return road;
}

// 把 roadA 末端与锚点 a1 用短贝塞尔连成一条匝道
export function joinRoads(name, roadA, a1, { ext1 = 45 } = {}) {
  const a0 = roadA.anchorAt(roadA.length);
  const tail = rampFromAnchors(name + '_tail', a0, a1, { ext0: 30, ext1 });
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
  // 主线 A：东西向高架（层2）
  mains.push(new Road('主线A·东西', 'main', 'A', { carriageways: 'dual', lanes: 3, median: 3 },
    descentTail(lineRoad(V3(-1050, LEVELS.A, -60), V3(1050, LEVELS.A, -60)))));
  // 主线 B：南北向高架（层3）
  mains.push(new Road('主线B·南北', 'main', 'B', { carriageways: 'dual', lanes: 3, median: 3 },
    descentTail(lineRoad(V3(40, LEVELS.B, 1050), V3(40, LEVELS.B, -1050)))));
  // 主线 C：西北—东南 对角主线（层4，带缓曲）
  {
    const bez = bezierRoad(V3(-440, LEVELS.C, -330), V3(-150, LEVELS.C, -80), V3(140, LEVELS.C, 60), V3(440, LEVELS.C, 330));
    const end = bez[bez.length - 1];
    const d = bez[bez.length - 1].clone().sub(bez[bez.length - 6]).setY(0).normalize();
    const ext = lineRoad(end, end.clone().addScaledVector(d, 700));
    mains.push(new Road('主线C·西北东南', 'main', 'C', { carriageways: 'dual', lanes: 3, median: 3 },
      descentTail(bez.concat(ext.slice(1)))));
  }
  // 主线 D：西南—东北 对角主线（层5 最高）
  {
    const bez = bezierRoad(V3(-440, LEVELS.D, 330), V3(-160, LEVELS.D, 100), V3(150, LEVELS.D, -70), V3(440, LEVELS.D, -330));
    const end = bez[bez.length - 1];
    const d = bez[bez.length - 6].clone().sub(bez[bez.length - 1]).setY(0).normalize().negate();
    const ext = lineRoad(end, end.clone().addScaledVector(d, 700));
    mains.push(new Road('主线D·西南东北', 'main', 'D', { carriageways: 'dual', lanes: 3, median: 3 },
      descentTail(bez.concat(ext.slice(1)))));
  }
  const A = mains[0], B = mains[1], C = mains[2], D = mains[3];

  // 地面道路（层1，延伸进城市深处）
  grounds.push(new Road('地面·滨江路', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4, width: 13 },
    lineRoad(V3(-2300, LEVELS.G, 90), V3(2300, LEVELS.G, 90))));
  grounds.push(new Road('地面·林荫大道', 'ground', 'G', { carriageways: 'dual', lanes: 3, median: 2.4, width: 13 },
    lineRoad(V3(-90, LEVELS.G, 2300), V3(-90, LEVELS.G, -2300))));
  grounds.push(new Road('地面·北横路', 'ground', 'G', { carriageways: 'dual', lanes: 2, median: 2, width: 11 },
    lineRoad(V3(-2300, LEVELS.G, -280), V3(2300, LEVELS.G, -280))));
  const G1 = grounds[0], G2 = grounds[1], G3 = grounds[2];

  // ===== 20 条匝道 =====
  // -- A×B 苜蓿叶环圈（4 条，围绕交点 (40,-60)）--
  ramps.push(loopRamp('匝道R1·A东转B北', A, A.nearestS(150, -60), +1, 52, 262, B));   // 9→18 上
  ramps.push(loopRamp('匝道R2·B北转A西', B, B.nearestS(40, -180), -1, 52, 262, A));   // 18→9 下
  ramps.push(loopRamp('匝道R3·A西转B南', A, A.nearestS(-60, -60), +1, 52, 262, B));   // 9→18 上
  ramps.push(loopRamp('匝道R4·B南转A东', B, B.nearestS(40, 60), -1, 52, 262, A));     // 18→9 下

  // -- B×C 环圈（4 条，围绕交点 (40,~95)）--
  ramps.push(loopRamp('匝道R5·C转B北', C, C.nearestS(150, 190), -1, 52, 262, B));     // 27→18 下
  ramps.push(loopRamp('匝道R6·B北转C', B, B.nearestS(40, 0), +1, 52, 262, C));        // 18→27 上
  ramps.push(loopRamp('匝道R7·C转B南', C, C.nearestS(-60, 10), +1, 52, 262, B));      // 27→18 下
  ramps.push(loopRamp('匝道R8·B南转C', B, B.nearestS(40, 190), -1, 52, 262, C));      // 18→27 上

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
    // 引道：G1 → 螺旋起点（终点切向 = 螺旋起点切向）
    const leadPts = bezierRoad(aG.p, aG.p.clone().addScaledVector(aG.tan, 40),
      head.p.clone().addScaledVector(head.tan, -30), head.p, 5);
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
  }
  // SP2：西北象限，层4 主线C → 地面 G2，逆时针下降 1.5 圈
  {
    const sp = spiralRamp('匝道SP2·螺旋下行', V3(-155, 0, -115), 66, 44, Math.PI * 0.22, 1.5, -1, LEVELS.C, LEVELS.G);
    const arcPts = arcRoad(sp.center, sp.rOuter, sp.rInner, sp.a0, sp.a1, sp.y0, sp.y1, 4);
    const arc = new Road('匝道SP2·螺旋下行', 'ramp', null, { carriageways: 'single', lanes: 2 }, arcPts);
    const head = arc.anchorAt(0);
    const sC = C.nearestS(head.p.x, head.p.z);
    const aC = C.anchorAt(sC);
    const lead = rampFromAnchors('SP2引道', aC, { ...head, tan: head.tan.clone() }, { ext0: 60, ext1: 30 });
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

  return { mains, ramps, grounds, all: [...grounds, ...mains, ...ramps] };
}

// 收集所有高架路面采样点 → 桥墩碰撞网格
export function buildCollisionGrid(roads) {
  const cell = 24;
  const grid = new Map();
  for (const road of roads) {
    if (road.kind === 'ground') continue;
    for (let s = 0; s <= road.length; s += 5) {
      const p = road.pts[road._seg(s)];
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x: p.x, z: p.z, y: p.y });
    }
  }
  return {
    cell,
    query(x, z, radius) {
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
