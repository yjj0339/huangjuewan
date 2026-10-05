// 车流 + 玩家驾驶车：Blender GLB 精细车辆（按材质拆分实例化），
// AI 车流在匝道/主线/地面路之间自动转接，全程连续不凭空消失。
import * as THREE from '../vendor/three.module.js?v=35';
import { mergeGeoms } from './deck.js?v=35';
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js?v=35';

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
      const parts = {};
      for (const [mn, gs] of Object.entries(byMat)) {
        parts[mn] = mergeGeoms(gs.map((g) => ({ geo: g })));
      }
      out[k] = parts;
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
        });
      }
    }
    // 按车型分组建实例（GLB 分材质 / 回退方块）
    const byKind = {};
    for (const c of this.cars) (byKind[c.kind] = byKind[c.kind] || []).push(c);
    const col = new THREE.Color();
    for (const [kName, list] of Object.entries(byKind)) {
      const parts = assets && assets[kName];
      if (parts) {
        for (const [mn, geo] of Object.entries(parts)) {
          const mat = CAR_MATS[mn] || CAR_MATS.trim;
          const inst = new THREE.InstancedMesh(geo, mat, list.length);
          inst.castShadow = mn !== 'glass';
          inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          inst.userData.cars = list;
          this.group.add(inst);
          this.insts.push(inst);
          for (let i = 0; i < list.length; i++) {
            list[i].parts = list[i].parts || [];
            list[i].parts.push({ inst, idx: i });
            if (mn === 'paint') {
              const pal = (kName === 'bus' || kName === 'truck') ? BUS_PALETTE : PALETTE;
              col.setHex(pal[(Math.random() * pal.length) | 0]);
              inst.setColorAt(i, col);
            }
          }
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
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const fz = V3(0, 0, 1);
    this.followGaps();
    for (const c of this.cars) {
      this.advance(c, dt);
      const f = c.road.frameAt(c.s);
      const pos = f.p.clone().addScaledVector(f.side, c.laneOff);
      const fwd = f.tan.clone().multiplyScalar(c.forward);
      q.setFromUnitVectors(fz, fwd);
      m.compose(pos, q, sc);
      for (const p of c.parts) p.inst.setMatrixAt(p.idx, m);
    }
    for (const inst of this.insts) inst.instanceMatrix.needsUpdate = true;
  }

  // 单车推进：到主线/匝道尽头时驶入汇入道路（世界坐标连续）
  advance(c, dt) {
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
        c.laneOff = offs[bi];
        c.forward = 1;
        return;
      }
    }
    if (c.s >= c.road.length) c.s -= c.road.length;
    if (c.s < 0) c.s += c.road.length;
  }

  // 同车道跟车：与前车保持安全间距
  followGaps() {
    const groups = new Map();
    for (const c of this.cars) {
      const k = c.road.name + '|' + c.laneIdx + '|' + c.forward;
      let arr = groups.get(k);
      if (!arr) { arr = []; groups.set(k, arr); }
      arr.push(c);
    }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => a.s - b.s);
      const L = arr[0].road.length;
      const wrapGap = arr[0].s + L - arr[arr.length - 1].s;
      const mgLast = 9 + arr[arr.length - 1].speed * 0.55;
      if (wrapGap < mgLast) arr[arr.length - 1].s = arr[0].s + L - mgLast;
      for (let j = arr.length - 1; j >= 1; j--) {
        const mg = 9 + arr[j - 1].speed * 0.55;
        if (arr[j].s - arr[j - 1].s < mg) arr[j - 1].s = arr[j].s - mg;
      }
      for (const c of arr) {
        if (c.s >= L) c.s -= L;
        if (c.s < 0) c.s += L;
      }
    }
  }
}

// ---------- 玩家驾驶车 ----------
export class PlayerCar {
  constructor(roads, assets) {
    this.roads = roads;
    const parts = assets && assets.sedan;
    if (parts) {
      this.mesh = new THREE.Group();
      for (const [mn, geo] of Object.entries(parts)) {
        const mat = mn === 'paint'
          ? new THREE.MeshStandardMaterial({ color: 0xff7a1f, metalness: 0.7, roughness: 0.28 })
          : (CAR_MATS[mn] || CAR_MATS.trim);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.mesh.add(mesh);
      }
    } else {
      this.mesh = new THREE.Mesh(carGeo('sedan'),
        new THREE.MeshStandardMaterial({ color: 0xff7a1f, vertexColors: true, metalness: 0.6, roughness: 0.32 }));
      this.mesh.castShadow = true;
    }
    this.mesh.visible = false;
    this.exitsByRoad = new Map();
    for (const r of roads.ramps) {
      if (!r.exit) continue;
      const arr = this.exitsByRoad.get(r.exit.road) || [];
      arr.push({ s: r.exit.s, ramp: r });
      this.exitsByRoad.set(r.exit.road, arr);
    }
    for (const arr of this.exitsByRoad.values()) arr.sort((a, b) => a.s - b.s);
    this.road = roads.mains[0];
    this.s = this.road.length * 0.42;
    this.lane = 2;
    this.laneOff = laneOffsetsOf(this.road)[2] || 0;
    this.speed = 0;
    this.hint = '';
  }
  worldPos() {
    const f = this.road.frameAt(this.s);
    return f.p.clone().addScaledVector(f.side, this.laneOff);
  }
  place(road) {
    this.road = road || this.roads.mains[0];
    this.s = this.road.length * 0.42;
    this.lane = this.road.carriageways === 'dual' ? this.road.lanes - 1 : 1;
    this.laneOff = laneOffsetsOf(this.road)[this.lane];
    this.speed = 0;
    this.mesh.visible = true;
  }
  // 切换线路：用世界坐标反算新路侧向偏移，位置连续不跳变
  switchRoad(r, s) {
    const oldPos = this.worldPos();
    this.road = r;
    this.s = clamp(s, 1, r.length - 1);
    const f = this.road.frameAt(this.s);
    const lat = oldPos.clone().sub(f.p).dot(f.side);
    this.laneOff = clamp(lat, -this.road.width / 2 + 1.0, this.road.width / 2 - 1.0);
    const offs = laneOffsetsOf(this.road);
    let bi = 0, bd = Infinity;
    for (let i = 0; i < offs.length; i++) {
      const d = Math.abs(offs[i] - Math.max(0, this.laneOff));
      if (d < bd) { bd = d; bi = i; }
    }
    this.lane = this.road.carriageways === 'dual' ? bi : clamp(bi, 0, offs.length - 1);
  }
  update(dt, input) {
    const road = this.road;
    const limit = road.kind === 'main' ? 32 : road.kind === 'ramp' ? 17 : 15;
    if (input.up) this.speed += 12 * dt;
    else if (input.down) this.speed -= 28 * dt;
    else this.speed -= 5.5 * dt;
    this.speed = clamp(this.speed, 0, limit);
    this.s += this.speed * dt;

    const offsets = laneOffsetsOf(road);
    let taking = null;
    for (const ex of (this.exitsByRoad.get(road) || [])) {
      if (this.s > ex.s - 30 && this.s < ex.s + 10) {
        this.hint = '按 ← / → 转入 ' + ex.ramp.name;
        if (input.turn !== 0) { taking = ex; input.turn = 0; }
        break;
      }
    }
    if (taking) {
      this.switchRoad(taking.ramp, 1);
      this.hint = '已驶入 ' + taking.ramp.name;
    } else {
      if (this.s <= road.length - 1) {
        if (input.turn !== 0) { this.lane = clamp(this.lane + input.turn, 0, offsets.length - 1); input.turn = 0; }
        this.hint = '';
      }
      const target = offsets[clamp(this.lane, 0, offsets.length - 1)];
      this.laneOff += (target - this.laneOff) * Math.min(1, dt * 4);
    }
    // 线路末端：匝道→主线 / 主线→城市干道，位置连续
    if (!taking && this.s >= road.length - 0.5) {
      if (road.merge) {
        this.switchRoad(road.merge.road, road.merge.s + 2);
      } else {
        this.s = 2; // 干道尽头兜底环回（远在雾中）
      }
    }
    const f = this.road.frameAt(this.s);
    const pos = f.p.clone().addScaledVector(f.side, this.laneOff);
    const fwd = f.tan.clone();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), fwd);
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(q);
    return { pos, fwd, speed: this.speed };
  }
}