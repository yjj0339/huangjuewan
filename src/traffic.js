// 车流：多车型实例化（轿车/SUV/公交/货柜），沿路网按车道行驶
import * as THREE from '../vendor/three.module.js';
import { mergeGeoms } from './deck.js';

// 单位车（车头朝 +Z），体块拼装 + 顶点色
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
    items.push({ geo: new THREE.BoxGeometry(2.42, 1.1, 4.8), matrix: M(0, 1.5, -2.7), color: 0x36506b });
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
  } else { // sedan
    items.push({ geo: new THREE.BoxGeometry(1.8, 0.62, 4.3), matrix: M(0, 0.66, 0), color: 0xffffff });
    items.push({ geo: new THREE.BoxGeometry(1.64, 0.52, 2.2), matrix: M(0, 1.2, -0.2), color: 0x2a3542 });
    items.push(wheel(0.8, 1.38, 0.33, 0.24)); items.push(wheel(-0.8, 1.38, 0.33, 0.24));
    items.push(wheel(0.8, -1.38, 0.33, 0.24)); items.push(wheel(-0.8, -1.38, 0.33, 0.24));
  }
  return mergeGeoms(items);
}

const PALETTE = [0xf4f5f6, 0xd6d9dc, 0x9aa1a8, 0x2b2f36, 0x8c1f28, 0x1d3f6e, 0xe8b820, 0x2d6a4f, 0xc96f2f, 0xf2f2f2];
// 大型车用浅色涂装（避免远景近黑块）
const BUS_PALETTE = [0xeef0f2, 0xd9dcdf, 0x9fb3c8, 0x4a7ba6, 0xd98e2f, 0xb8bcc2, 0x5d8a4f];

export class Traffic {
  constructor(roads, density = 1) {
    this.group = new THREE.Group();
    this.kinds = {};
    this.cars = [];
    const kindSpec = [
      ['sedan', 0.52, 24, [26, 34]],
      ['suv', 0.24, 22, [24, 32]],
      ['bus', 0.12, 16, [15, 20]],
      ['truck', 0.12, 18, [16, 22]],
    ];
    for (const road of roads.all) {
      const isGround = road.kind === 'ground';
      const isRamp = road.kind === 'ramp';
      // 每条路按长度铺车
      const per100 = isGround ? 2.6 : isRamp ? 3.4 : 7.5;
      const count = Math.round((road.length / 100) * per100 * density);
      const dirSigns = road.carriageways === 'dual' ? [1, -1] : [1];
      const laneOffsets = this.laneOffsets(road);
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        let acc = 0;
        let kind = kindSpec[0];
        for (const k of kindSpec) { acc += k[1]; if (r < acc) { kind = k; break; } }
        const [kName, , , spd] = kind;
        const dirSign = dirSigns[(Math.random() * dirSigns.length) | 0];
        const laneIdx = (Math.random() * laneOffsets.length) | 0;
        // 对向车流在另一半幅：取对应车道并镜像
        let laneOff, forward;
        if (road.carriageways === 'dual') {
          if (dirSign === 1) { laneOff = laneOffsets[laneIdx]; forward = 1; }
          else { laneOff = -laneOffsets[laneIdx]; forward = -1; }
        } else { laneOff = laneOffsets[laneIdx]; forward = 1; }
        this.cars.push({
          road,
          s: Math.random() * road.length,
          laneOff,
          forward,
          speed: (spd[0] + Math.random() * (spd[1] - spd[0])) * (isRamp ? 0.55 : isGround ? 0.42 : 1) * (forward === 1 ? 1 : 1),
          kind: kName,
        });
      }
    }
    // 每车型一个 InstancedMesh
    const byKind = {};
    for (const c of this.cars) (byKind[c.kind] = byKind[c.kind] || []).push(c);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.42 });
    const col = new THREE.Color();
    for (const [kName, list] of Object.entries(byKind)) {
      const inst = new THREE.InstancedMesh(carGeo(kName), mat, list.length);
      list.forEach((c, i) => {
        const pal = (c.kind === 'bus' || c.kind === 'truck') ? BUS_PALETTE : PALETTE;
        col.setHex(pal[(Math.random() * pal.length) | 0]);
        inst.setColorAt(i, col);
        c.inst = inst; c.idx = i;
      });
      inst.castShadow = true;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(inst);
      this.kinds[kName] = inst;
    }
  }
  laneOffsets(road) {
    const L = 3.75;
    if (road.carriageways === 'dual') {
      const off = road.median / 2;
      return Array.from({ length: road.lanes }, (_, i) => off + L * (i + 0.5));
    }
    return Array.from({ length: road.lanes }, (_, i) => (i - (road.lanes - 1) / 2) * L);
  }
  update(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    for (const c of this.cars) {
      c.s += c.speed * c.forward * dt;
      if (c.s > c.road.length) c.s -= c.road.length;
      if (c.s < 0) c.s += c.road.length;
      const f = c.road.frameAt(c.s);
      const pos = f.p.clone().addScaledVector(f.side, c.laneOff);
      // 车头朝行进方向（模型头朝 +Z）
      const fwd = f.tan.clone().multiplyScalar(c.forward);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwd);
      m.compose(pos, q, sc);
      c.inst.setMatrixAt(c.idx, m);
    }
    for (const inst of Object.values(this.kinds)) inst.instanceMatrix.needsUpdate = true;
  }
}
