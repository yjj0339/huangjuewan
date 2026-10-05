// 车流 + 玩家驾驶车：Blender GLB 精细车辆（按材质拆分实例化），
// AI 车流在匝道/主线/地面路之间自动转接，全程连续不凭空消失。
import * as THREE from '../vendor/three.module.js?v=41';
import { mergeGeoms } from './deck.js?v=41';
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js?v=41';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const KINDS = ['sedan', 'suv', 'bus', 'truck'];
export const PALETTE = [0xf4f5f6, 0xd6d9dc, 0x9aa1a8, 0x2b2f36, 0x8c1f28, 0x1d3f6e, 0xe8b820, 0x2d6a4f, 0xc96f2f, 0xf2f2f2];
export const BUS_PALETTE = [0xeef0f2, 0xd9dcdf, 0x9fb3c8, 0x6f93b8, 0xd98e2f, 0xb8bcc2, 0x5d8a4f];

// GLB 材质名 → three 材质（paint 用实例色驱动）
export const CAR_MATS = {
  paint: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x141f2a, metalness: 0.45, roughness: 0.12 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.25, roughness: 0.72 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xb9c0c6, metalness: 0.95, roughness: 0.22 }),
  light: new THREE.MeshStandardMaterial({ color: 0xe8ecef, metalness: 0.35, roughness: 0.25 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8c1a12, metalness: 0.3, roughness: 0.3 }),
  cargo: new THREE.MeshStandardMaterial({ color: 0xd4d7da, metalness: 0.3, roughness: 0.55 }),
};

// 加载四辆车 GLB → 按材质合并成可实例化的几何组
export async function loadCarAssets(basePath) {
  const loader = new GLTFLoader();
  const out = {};
  await Promise.all(KINDS.map(async (k) => {
    try {
      const gltf = await loader.loadAsync(basePath + k + '.glb');
      gltf.scene.updateMatrixWorld(true);
      const byMat = {};
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        const mn = (o.material && o.material.name) || 'trim';
        (byMat[mn] = byMat[mn] || []).push(g);
      });
      // 归并为两组：paint（instanceColor 上色）+ rest（细节件按材质色烘焙进顶点色）
      // → 每车型只有 2 个实例缓冲，逐帧上传量降为 1/6
      const DETAIL_COLORS = {
        glass: 0x1a2732, trim: 0x17191c, chrome: 0xb9c0c6,
        light: 0xe8ecef, tail: 0x8c1a12, cargo: 0xd4d7da,
      };
      const paintGs = byMat.paint || [];
      const restItems = [];
      for (const [mn, gs] of Object.entries(byMat)) {
        if (mn === 'paint') continue;
        const c = new THREE.Color(DETAIL_COLORS[mn] || 0x17191c);
        for (const g of gs) restItems.push({ geo: g, color: c.getHex() });
      }
      out[k] = {
        paint: paintGs.length ? mergeGeoms(paintGs.map((g) => ({ geo: g }))) : null,
        rest: restItems.length ? mergeGeoms(restItems) : null,
      };
    } catch (err) {
      out[k] = null; // 加载失败 → 回退方块车
    }
  }));
  return out;
}

// ---------- 回退用方块车（GLB 加载失败时） ----------
function carGeo(kind) {
  const items = [];
  const M = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const wheel = (x, z, r, w) => {
    const g = new THREE.CylinderGeometry(r, r, w, 10);
    g.rotateZ(Math.PI / 2);
    return { geo: g, matrix: M(x, r, z), color: 0x14161a };
  };
  if (kind === 'bus') {
    items.push({ geo: new THREE.BoxGeometry(2.5, 2.0, 10.6), matrix: M(0, 1.55, 0), color: 0xffffff });
    items.push({ geo: new THREE.BoxGeometry(2.52, 0.85, 10.2), matrix: M(0, 1.95, -0.2), color: 0x2e4d68 });
    items.push(wheel(1.15, 3.4, 0.52, 0.34)); items.push(wheel(-1.15, 3.4, 0.52, 0.34));
    items.push(wheel(1.15, -3.2, 0.52, 0.34)); items.push(wheel(-1.15, -3.2, 0.52, 0.34));
  } else if (kind === 'truck') {
    items.push({ geo: new THREE.BoxGeometry(2.4, 2.1, 5.2), matrix: M(0, 2.25, -2.6), color: 0xffffff });
    items.push({ geo: new THREE.BoxGeometry(2.3, 1.5, 4.6), matrix: M(0, 1.0, -2.6), color: 0x22262c });
    items.push({ geo: new THREE.BoxGeometry(2.45, 2.5, 8.2), matrix: M(0, 2.0, 2.6), color: 0xd7dadd });
    items.push(wheel(1.2, -4.6, 0.55, 0.36)); items.push(wheel(-1.2, -4.6, 0.55, 0.36));
    items.push(wheel(1.2, 0.4, 0.55, 0.36)); items.push(wheel(-1.2, 0.4, 0.55, 0.36));
    items.push(wheel(1.2, 5.6, 0.55, 0.36)); items.push(wheel(-1.2, 5.6, 0.55, 0.36));
  } else if (kind === 'suv') {
    items.push({ geo: new THREE.BoxGeometry(1.86, 0.85, 4.5), matrix: M(0, 0.78, 0), color: 0xffffff });
    items.push({ geo: new THREE.BoxGeometry(1.72, 0.62, 2.9), matrix: M(0, 1.5, -0.15), color: 0x27313d });
    items.push(wheel(0.82, 1.45, 0.37, 0.26)); items.push(wheel(-0.82, 1.45, 0.37, 0.26));
    items.push(wheel(0.82, -1.45, 0.37, 0.26)); items.push(wheel(-0.82, -1.45, 0.37, 0.26));
  } else {
    items.push({ geo: new THREE.BoxGeometry(1.8, 0.62, 4.3), matrix: M(0, 0.66, 0), color: 0xffffff });
    items.push({ geo: new THREE.BoxGeometry(1.64, 0.52, 2.2), matrix: M(0, 1.2, -0.2), color: 0x2a3542 });
    items.push(wheel(0.8, 1.38, 0.33, 0.24)); items.push(wheel(-0.8, 1.38, 0.33, 0.24));
    items.push(wheel(0.8, -1.38, 0.33, 0.24)); items.push(wheel(-0.8, -1.38, 0.33, 0.24));
  }
  return mergeGeoms(items);
}

function laneOffsetsOf(road) {
  const L = 3.75;
  if (road.carriageways === 'dual') {
    const off = road.median / 2;
    return Array.from({ length: road.lanes }, (_, i) => off + L * (i + 0.5));
  }
  return Array.from({ length: road.lanes }, (_, i) => (i - (road.lanes - 1) / 2) * L);
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 热路径共享临时量（零分配，避免每帧数千次 GC）
const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _SC = new THREE.Vector3(1, 1, 1);
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _S = new THREE.Vector3();
const _FZ = new THREE.Vector3(0, 0, 1);

export class Traffic {
  constructor(roads, density = 1, assets = null) {
    this.group = new THREE.Group();
    this.kinds = {};
    this.cars = [];
    this.insts = [];
    const kindSpec = [
      ['sedan', 0.52, 24, [26, 34]],
      ['suv', 0.24, 22, [24, 32]],
      ['bus', 0.12, 16, [15, 20]],
      ['truck', 0.12, 18, [16, 22]],
    ];
    for (const road of roads.all) {
      const isGround = road.kind === 'ground';
      const isRamp = road.kind === 'ramp';
      const per100 = isGround ? 2.2 : isRamp ? 3.2 : 6.5;
      const count = Math.round((road.length / 100) * per100 * density);
      const dirSigns = road.carriageways === 'dual' ? [1, -1] : [1];
      const laneOffsets = laneOffsetsOf(road);
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        let acc = 0;
        let kind = kindSpec[0];
        for (const k of kindSpec) { acc += k[1]; if (r < acc) { kind = k; break; } }
        const [kName, , , spd] = kind;
        const dirSign = dirSigns[(Math.random() * dirSigns.length) | 0];
        const laneIdx = (Math.random() * laneOffsets.length) | 0;
        let laneOff, forward;
        if (road.carriageways === 'dual') {
          if (dirSign === 1) { laneOff = laneOffsets[laneIdx]; forward = 1; }
          else { laneOff = -laneOffsets[laneIdx]; forward = -1; }
        } else { laneOff = laneOffsets[laneIdx]; forward = 1; }
        this.cars.push({
          road, s: Math.random() * road.length, laneOff, laneIdx, forward,
          speed: (spd[0] + Math.random() * (spd[1] - spd[0])) * (isRamp ? 0.55 : isGround ? 0.42 : 1),
          kind: kName,
          parts: null,
          laneTarget: laneOff,
        });
      }
    }
    // 同（路|车道|方向）共享速度：车道内间距恒定，根除跟车抽搐
    {
      const gs = new Map();
      for (const c of this.cars) {
        const k = c.road.name + '|' + c.laneIdx + '|' + c.forward;
        if (!gs.has(k)) gs.set(k, c.speed);
        c.speed = gs.get(k);
        c.baseSpeed = c.speed;
      }
    }
    // 按道路分桶（玩家碰撞查询用）
    this.byRoad = new Map();
    for (const c of this.cars) {
      let a = this.byRoad.get(c.road);
      if (!a) { a = []; this.byRoad.set(c.road, a); }
      a.push(c);
    }
    // 地面路平交路口表：每条地面路记录与其相交的路口点（沿路弧长）
    this.gcross = new Map();
    const gl = roads.grounds.filter(g => g.kind === 'ground');
    for (let i = 0; i < gl.length; i++) {
      for (let j = 0; j < gl.length; j++) {
        if (i === j) continue;
        const a = gl[i], b = gl[j];
        // a 轴向：起点→终点方向
        const ad = a.pts[a.pts.length - 1].clone().sub(a.pts[0]).setY(0).normalize();
        const aAlongX = Math.abs(ad.x) > 0.7;
        const bd = b.pts[b.pts.length - 1].clone().sub(b.pts[0]).setY(0).normalize();
        const bAlongX = Math.abs(bd.x) > 0.7;
        if (aAlongX === bAlongX) continue; // 平行不相交
        const cx = aAlongX ? (b.pts[0].x) : (a.pts[0].z);
        const cz = aAlongX ? (a.pts[0].z) : (b.pts[0].z);
        // a 上的弧长位置
        const px = aAlongX ? cx : (b.pts[0].x);
        const pz = aAlongX ? (a.pts[0].z) : cz;
        const s = a.nearestS(px, pz);
        const arr = this.gcross.get(a.name) || [];
        arr.push({ x: px, z: pz, s, other: b.name });
        this.gcross.set(a.name, arr);
      }
    }
    this.player = null;
    // 按车型分组建实例（GLB 分材质 / 回退方块）
    const byKind = {};
    for (const c of this.cars) (byKind[c.kind] = byKind[c.kind] || []).push(c);
    const col = new THREE.Color();
    for (const [kName, list] of Object.entries(byKind)) {
      const parts = assets && assets[kName];
      if (parts && (parts.paint || parts.rest)) {
        // 两组实例：paint（实例色车漆）+ rest（细节件，材质色烘焙顶点色）
        const paintInst = parts.paint
          ? new THREE.InstancedMesh(parts.paint,
            new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.78, roughness: 0.3 }), list.length)
          : null;
        const restInst = parts.rest
          ? new THREE.InstancedMesh(parts.rest,
            new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.42 }), list.length)
          : null;
        for (const inst of [paintInst, restInst]) {
          if (!inst) continue;
          inst.castShadow = true;
          inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          inst.userData.cars = list;
          this.group.add(inst);
          this.insts.push(inst);
        }
        const pal = (kName === 'bus' || kName === 'truck') ? BUS_PALETTE : PALETTE;
        for (let i = 0; i < list.length; i++) {
          list[i].parts = [];
          if (paintInst) {
            list[i].parts.push({ inst: paintInst, idx: i });
            col.setHex(pal[(Math.random() * pal.length) | 0]);
            paintInst.setColorAt(i, col);
          }
          if (restInst) list[i].parts.push({ inst: restInst, idx: i });
        }
      } else {
        const inst = new THREE.InstancedMesh(carGeo(kName),
          new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 }), list.length);
        inst.castShadow = true;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.userData.cars = list;
        for (let i = 0; i < list.length; i++) {
          const pal = (kName === 'bus' || kName === 'truck') ? BUS_PALETTE : PALETTE;
          col.setHex(pal[(Math.random() * pal.length) | 0]);
          inst.setColorAt(i, col);
          list[i].parts = [{ inst, idx: i }];
        }
        this.group.add(inst);
        this.insts.push(inst);
      }
    }
  }

  update(dt) {
    // 跟车约束每 3 帧一次（组内共享速度后间距基本恒定，无需每帧）
    this._fgc = (this._fgc || 0) + 1;
    if (this._fgc % 3 === 1) this.followGaps();
    for (const c of this.cars) {
      this.advance(c, dt);
      c.road.frameAtInto(c.s, _P, _T, _S);
      // 换路后车道偏移向目标车位平滑滑入（不瞬移、不抽搐）
      if (c.laneOff !== c.laneTarget) {
        c.laneOff += (c.laneTarget - c.laneOff) * Math.min(1, dt * 1.8);
        if (Math.abs(c.laneTarget - c.laneOff) < 0.04) c.laneOff = c.laneTarget;
      }
      _P.addScaledVector(_S, c.laneOff);
      _T.multiplyScalar(c.forward);
      _Q.setFromUnitVectors(_FZ, _T);
      _M.compose(_P, _Q, _SC);
      for (const p of c.parts) p.inst.setMatrixAt(p.idx, _M);
    }
    for (const inst of this.insts) inst.instanceMatrix.needsUpdate = true;
  }

  // 单车推进：到主线/匝道尽头时驶入汇入道路（位置连续、车道平滑滑入）
  advance(c, dt) {
    // 平交路口让行减速：接近路口时降速通过（减少路口车辆互穿，观感更真实）
    if (c.road.kind === 'ground' && this.gcross) {
      const list = this.gcross.get(c.road.name);
      if (list) {
        for (const cp of list) {
          if (Math.abs(cp.s - c.s) < 20 && Math.abs(cp.s - c.s) > 4) {
            c.speed = Math.min(c.speed, (c.baseSpeed || c.speed) * 0.4);
            break;
          }
        }
      }
    }
    c.s += c.speed * c.forward * dt;
    if (c.forward > 0 && c.s >= c.road.length - 0.2) {
      const mg = c.road.merge;
      if (mg) {
        const oldF = c.road.frameAt(c.road.length);
        const oldPos = oldF.p.clone().addScaledVector(oldF.side, c.laneOff);
        c.road = mg.road;
        c.s = clamp(mg.s + 2, 2, c.road.length - 2);
        const nf = c.road.frameAt(c.s);
        const lat = oldPos.clone().sub(nf.p).dot(nf.side);
        const offs = laneOffsetsOf(c.road);
        let bi = 0, bd = Infinity;
        for (let i = 0; i < offs.length; i++) {
          const d = Math.abs(offs[i] - lat);
          if (d < bd) { bd = d; bi = i; }
        }
        c.laneIdx = bi;
        c.laneOff = clamp(lat, -c.road.width / 2 + 1, c.road.width / 2 - 1);
        c.laneTarget = offs[bi];
        c.forward = 1;
        // 落点找空档：目标落点附近已有车则顺移到其后（不叠车）
        const near = (this.byRoad.get(c.road) || []).filter(o => o !== c && Math.abs(o.laneOff - c.laneOff) < 3.2 && Math.abs(o.s - c.s) < 11);
        for (const o of near) c.s = (o.s + 11 > c.road.length - 2) ? o.s - 11 : o.s + 11;
        return;
      }
    }
    if (c.s >= c.road.length) c.s -= c.road.length;
    if (c.s < 0) c.s += c.road.length;
  }

  // 同车道跟车（软化版）：优先速度匹配，硬保底仅在极近时生效
// 注入玩家虚拟车（AI 会为玩家排队让行，不再穿过玩家）
  setPlayer(p) { this.player = p; }

  followGaps() {
    const groups = new Map();
    for (const c of this.cars) {
      const k = c.road.name + '|' + c.laneIdx + '|' + c.forward;
      let arr = groups.get(k);
      if (!arr) { arr = []; groups.set(k, arr); }
      arr.push(c);
    }
    // 玩家作为虚拟车加入其所在车道的队列（AI 会避让玩家）
    if (this.player && this.player.mesh.visible) {
      const pr = this.player;
      const offs = laneOffsetsOf(pr.road);
      let li = 0, bd = Infinity;
      for (let i = 0; i < offs.length; i++) {
        const d = Math.abs(Math.abs(pr.laneOff) - offs[i]);
        if (d < bd) { bd = d; li = i; }
      }
      const k = pr.road.name + '|P' + (pr.laneOff >= 0 ? '+' : '-') + li;
      let arr = groups.get(k);
      if (!arr) { arr = []; groups.set(k, arr); }
      arr.push({ road: pr.road, s: pr.s, speed: Math.abs(pr.speed), isPlayer: true, parts: null });
    }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.s - b.s);
      const L = arr[0].road.length;
      const wrapGap = arr[0].s + L - arr[arr.length - 1].s;
      const mgLast = 8 + arr[arr.length - 1].speed * 0.55;
      if (wrapGap < mgLast) {
        arr[arr.length - 1].speed = Math.min(arr[arr.length - 1].speed, arr[0].speed);
        if (wrapGap < mgLast * 0.55) arr[arr.length - 1].s = arr[0].s + L - mgLast * 0.55;
      }
      for (let j = arr.length - 1; j >= 1; j--) {
        const gap = arr[j].s - arr[j - 1].s;
        const mg = 8 + arr[j - 1].speed * 0.55;
        if (gap < mg) {
          arr[j - 1].speed = Math.min(arr[j - 1].speed, arr[j].speed * (0.55 + 0.45 * clamp(gap / mg, 0, 1)));
          if (gap < mg * 0.55) arr[j - 1].s = arr[j].s - mg * 0.55;
        }
      }
      for (const c of arr) {
        // 速度缓慢恢复回本车道基准速度
        c.speed += (c.baseSpeed - c.speed) * 0.12;
        if (c.s >= L) c.s -= L;
        if (c.s < 0) c.s += L;
      }
    }
  }
}

// ---------- 玩家驾驶车 ----------
export class PlayerCar {
  constructor(roads, assets, traffic = null) {
    this.traffic = traffic;
    this.roads = roads;
    const parts = assets && assets.sedan;
    if (parts && (parts.paint || parts.rest)) {
      this.mesh = new THREE.Group();
      if (parts.paint) {
        const m = new THREE.Mesh(parts.paint,
          new THREE.MeshStandardMaterial({ color: 0xff7a1f, metalness: 0.78, roughness: 0.28 }));
        m.castShadow = true;
        this.mesh.add(m);
      }
      if (parts.rest) {
        const m = new THREE.Mesh(parts.rest,
          new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.4 }));
        m.castShadow = true;
        this.mesh.add(m);
      }
    } else {
      this.mesh = new THREE.Mesh(carGeo('sedan'),
        new THREE.MeshStandardMaterial({ color: 0xff7a1f, vertexColors: true, metalness: 0.6, roughness: 0.32 }));
      this.mesh.castShadow = true;
    }
    this.mesh.visible = false;
    // 出口登记（带方位）：side = 匝道在主线的哪一侧（+1 右 / −1 左）
    this.exitsByRoad = new Map();
    for (const r of roads.ramps) {
      if (!r.exit) continue;
      const fr = r.exit.road.frameAt(r.exit.s);
      const rp = r.frameAt(2);
      const side = rp.p.clone().sub(fr.p).dot(fr.side) >= 0 ? 1 : -1;
      const arr = this.exitsByRoad.get(r.exit.road) || [];
      arr.push({ s: r.exit.s, ramp: r, side });
      this.exitsByRoad.set(r.exit.road, arr);
    }
    for (const arr of this.exitsByRoad.values()) arr.sort((a, b) => a.s - b.s);
    this.road = roads.mains[0];
    this.s = this.road.length * 0.42;
    {
      const [uMin, uMax] = this.uRange(this.road);
      this.laneOff = uMax - 2.6; // 外侧车道
    }
    this.speed = 0;
    this.heading = 0;      // 自由物理：车头朝向（0 = +Z，左转为正）
    this.pos = new THREE.Vector3();
    this.syncFromRoad();
    this.hint = '';
  }
  worldPos() {
    return this.pos.clone();
  }
  // 当前道路的可行横向范围（连续自由驾驶，u 从中线量起；双幅只在本侧幅内）
  uRange(road) {
    const half = road.width / 2;
    if (road.carriageways === 'dual') {
      const cw = (road.width - road.median) / 2;
      return [road.median / 2 + 1.1, road.median / 2 + cw - 0.6];
    }
    return [-half + 1.0, half - 1.0];
  }
  place(road) {
    this.road = road || this.roads.mains[0];
    // 出生点安全：避开 AI 车附近（不生成在别车身上）
    let s = this.road.length * 0.42;
    if (this.traffic) {
      const near = this.traffic.cars.filter(c => c.road === this.road).map(c => c.s);
      const ok = (sv) => near.every(n => Math.abs(n - sv) > 16 && Math.abs(n - sv) < this.road.length - 16);
      if (!ok(s)) {
        for (let d = 20; d <= 160; d += 20) {
          if (ok(s + d)) { s += d; break; }
          if (ok(s - d)) { s -= d; break; }
        }
      }
    }
    this.s = s;
    const [uMin] = this.uRange(this.road);
    this.laneOff = uMin + 3.0;
    this.speed = 0;
    this.syncFromRoad();
    this.steerVis = 0;
    this.mesh.visible = true;
  }
  // 由 road+s+laneOff 同步自由物理状态（位置/朝向）
  syncFromRoad() {
    const f = this.road.frameAt(this.s);
    this.pos = f.p.clone().addScaledVector(f.side, this.laneOff);
    this.heading = Math.atan2(f.tan.x, f.tan.z);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
  // 切换线路：按当前位置在新路上重投影（位置/朝向零跳变）
  switchRoad(r, s) {
    const oldPos = this.pos.clone();
    const oldH = this.heading;
    this.road = r;
    this.s = clamp(r.nearestS(oldPos.x, oldPos.z), 1, r.length - 1);
    if (s !== undefined) this.s = clamp(s, 1, r.length - 1);
    const f = this.road.frameAt(this.s);
    const lat = oldPos.clone().sub(f.p).dot(f.side);
    const [uMin, uMax] = this.uRange(this.road);
    this.laneOff = clamp(lat, uMin, uMax);
    this.heading = oldH; // 航向保持（分流/汇合口切向本就吻合）
    this.syncFromRoad();
  }
  update(dt, input) {
    const road = this.road;
    const limit = road.kind === 'main' ? 32 : road.kind === 'ramp' ? 17 : 15;
    if (input.up) this.speed += 12 * dt;
    else if (input.down) this.speed -= 28 * dt;
    else this.speed -= 5.5 * dt;
    this.speed = clamp(this.speed, 0, limit);

    // 自由转向：车头朝向随方向键连续偏转（速率随速度衰减，高速更稳）
    const steer = clamp(input.turn, -1, 1);
    const turnRate = 1.9 - Math.min(1.15, this.speed * 0.03);
    this.heading -= steer * turnRate * dt * Math.min(1, this.speed / 4);
    this.steerVis += (steer * 0.35 - this.steerVis) * Math.min(1, dt * 6);

    // 前进（自由位置）
    const fwdDrive = V3(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.pos.addScaledVector(fwdDrive, this.speed * dt);

    // 道路吸附辅助：投回当前道路，越出路缘则推回并蹭护栏减速
    this.s = road.nearestS(this.pos.x, this.pos.z);
    const f = road.frameAt(this.s);
    const [uMin, uMax] = this.uRange(road);
    const lat = this.pos.clone().sub(f.p).dot(f.side);
    const latC = clamp(lat, uMin - 0.5, uMax + 0.5);
    if (latC !== lat) {
      this.pos.copy(f.p).addScaledVector(f.side, latC);
      this.speed *= 0.985;
    }
    this.laneOff = latC;

    // 出口：窗口内 + 已在出口侧外缘 + 持续向该侧转向 → 平滑驶入匝道（位置连续）
    let taking = null;
    this.hint = '';
    for (const ex of (this.exitsByRoad.get(road) || [])) {
      if (this.s > ex.s - 130 && this.s < ex.s + 14) {
        const edgeU = ex.side > 0 ? uMax : uMin;
        const nearEdge = Math.abs(this.laneOff - edgeU) < 4.0;
        const dist = Math.max(0, Math.round(ex.s - this.s));
        this.hint = dist > 0
          ? `前方${dist}m ${ex.side > 0 ? '右' : '左'}侧出口：向${ex.side > 0 ? '右' : '左'}转向驶入 ${ex.ramp.name}`
          : `已到出口：保持向${ex.side > 0 ? '右' : '左'}转向驶入 ${ex.ramp.name}`;
        if (nearEdge && steer === ex.side && this.speed > 3) { taking = ex; break; }
      }
    }
    if (taking) {
      this.switchRoad(taking.ramp, 8);
      this.hint = '已驶入 ' + taking.ramp.name;
    }
    // 线路末端：匝道→主线 / 主线→城市干道，按当前位置重投影（连续）
    if (!taking && this.s >= road.length - 0.5) {
      if (road.merge) {
        this.switchRoad(road.merge.road, road.merge.s + 2);
      } else {
        this.s = 2; // 干道尽头兜底环回（远在雾中）
      }
    }
    // 与 AI 车碰撞避让：前方同向近车限制速度并保持间距（不再互相穿透）
    if (this.traffic) {
      const cars = this.traffic.byRoad.get(this.road) || [];
      let ahead = null, bestGap = Infinity;
      for (const c of cars) {
        if (c.forward !== 1) continue;
        if (Math.abs(c.laneOff - this.laneOff) > 2.6) continue;
        const gap = c.s - this.s;
        if (gap > 0 && gap < bestGap) { bestGap = gap; ahead = c; }
      }
      if (ahead) {
        const minGap = 9 + this.speed * 0.5;
        if (bestGap < minGap) this.speed = Math.min(this.speed, ahead.speed * 0.9);
        if (bestGap < 8) this.s = ahead.s - 8;
      }
    }
    // 位姿（含转向视觉偏航）
    const yawVis = this.steerVis;
    const fwd = V3(Math.sin(this.heading + yawVis * 0.12), 0, Math.cos(this.heading + yawVis * 0.12));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading + yawVis * 0.14;
    return { pos: this.pos.clone(), fwd, speed: this.speed };
  }
}