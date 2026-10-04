// 附属设施：路灯、交通标志（门架+立柱牌）、地面道路、公园绿地、乔灌木、远景城市
import * as THREE from '../vendor/three.module.js';
import { mergeGeoms } from './deck.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------- 路灯（实例化） ----------
export function makeLampGeometry() {
  const items = [];
  const M = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  // 灯杆（微锥）
  const pole = new THREE.CylinderGeometry(0.09, 0.14, 10, 8);
  items.push({ geo: pole, matrix: M(0, 5, 0), color: 0x8e9399 });
  // 悬臂弯向 +X
  const arm = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8);
  arm.rotateZ(Math.PI / 2 - 0.28);
  items.push({ geo: arm, matrix: M(1.25, 9.8, 0), color: 0x8e9399 });
  // 灯头
  const head = new THREE.BoxGeometry(1.15, 0.16, 0.34);
  items.push({ geo: head, matrix: M(2.45, 10.05, 0), color: 0xd8dade });
  const headL = new THREE.BoxGeometry(0.95, 0.05, 0.26);
  items.push({ geo: headL, matrix: M(2.45, 9.95, 0), color: 0xf2f6f8 });
  return mergeGeoms(items);
}

export function placeLamps(roads, lampsGeo) {
  const items = [];
  for (const road of roads) {
    if (road.kind === 'ground') continue;
    const gap = road.kind === 'main' ? 38 : 46;
    const half = road.width / 2;
    for (let s = 14; s < road.length - 10; s += gap) {
      const f = road.frameAt(s);
      for (const sgn of (road.kind === 'main' ? [1, -1] : [1])) {
        const base = f.p.clone().addScaledVector(f.side, sgn * (half + 0.5));
        // 悬臂朝向路中线 → +X 指向 -side*sgn
        const d = f.side.clone().multiplyScalar(-sgn);
        const rotY = Math.atan2(-d.z, d.x);
        items.push({
          pos: base, rotY,
          lift: road.kind === 'main' ? 0 : 0,
        });
      }
    }
  }
  const inst = new THREE.InstancedMesh(lampsGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.45 }), items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), ax = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(ax, it.rotY);
    m.compose(new THREE.Vector3(it.pos.x, it.pos.y, it.pos.z), q, sc);
    inst.setMatrixAt(i, m);
  });
  inst.castShadow = true;
  return inst;
}

// ---------- 交通标志 ----------
export function makeSigns(roads, signMats) {
  const g = new THREE.Group();
  const [A, B, C, D] = roads.mains;
  const postMat = signMats.post;
  // 门架（跨线龙架 + 绿牌）
  const gantryDefs = [
    { road: A, s: A.nearestS(-180, -60), w: A.width, tex: signMats.texG1, label: 'G50 往江北机场' },
    { road: A, s: A.nearestS(240, -60), w: A.width, tex: signMats.texG2, label: 'G75 往南岸' },
    { road: B, s: B.nearestS(40, -220), w: B.width, tex: signMats.texG3, label: '内环快速' },
    { road: C, s: C.nearestS(-260, -170), w: C.width, tex: signMats.texG4, label: '往大佛寺大桥' },
    { road: D, s: D.nearestS(40, -60), w: D.width, tex: signMats.texG5, label: '往朝天门大桥' },
    { road: C, s: C.nearestS(180, 120), w: C.width, tex: signMats.texG6, label: '黄桷湾立交' },
  ];
  for (const gd of gantryDefs) {
    const f = gd.road.frameAt(gd.s);
    const half = gd.w / 2;
    const grp = new THREE.Group();
    const postH = gd.road.kind === 'main' ? 7.2 : 6;
    for (const sgn of [1, -1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, postH, 8), postMat);
      post.position.set(sgn * (half + 0.8), postH / 2, 0);
      post.castShadow = true;
      grp.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(gd.w + 2.2, 0.75, 0.55), postMat);
    beam.position.set(0, postH - 0.4, 0);
    beam.castShadow = true;
    grp.add(beam);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4),
      new THREE.MeshStandardMaterial({ map: gd.tex, roughness: 0.55, side: THREE.DoubleSide }));
    panel.position.set(-half * 0.25, postH - 2.6, 0.05);
    grp.add(panel);
    const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.5),
      new THREE.MeshStandardMaterial({ map: signMats.texG1, roughness: 0.55, side: THREE.DoubleSide }));
    panel2.position.set(half * 0.42, postH - 2.5, 0.05);
    grp.add(panel2);
    grp.position.copy(f.p);
    grp.rotation.y = Math.atan2(f.tan.x, f.tan.z);
    g.add(grp);
  }
  // 立柱牌（匝道出口）
  const exitDefs = [
    { road: roads.ramps[0], tex: signMats.texG1 }, { road: roads.ramps[1], tex: signMats.texG3 },
    { road: roads.ramps[4], tex: signMats.texG2 }, { road: roads.ramps[5], tex: signMats.texG4 },
    { road: roads.ramps[8], tex: signMats.texG5 }, { road: roads.ramps[9], tex: signMats.texG6 },
    { road: roads.ramps[16], tex: signMats.texG1 }, { road: roads.ramps[17], tex: signMats.texG3 },
  ];
  for (const ed of exitDefs) {
    if (!ed.road) continue;
    const f = ed.road.frameAt(ed.road.length * 0.35);
    const grp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 8), postMat);
    post.position.y = 2.3;
    grp.add(post);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8),
      new THREE.MeshStandardMaterial({ map: ed.tex, roughness: 0.55, side: THREE.DoubleSide }));
    panel.position.set(0, 4.4, 0);
    grp.add(panel);
    grp.position.copy(f.p).addScaledVector(f.side, -(ed.road.width / 2 + 1.2));
    grp.rotation.y = Math.atan2(f.tan.x, f.tan.z);
    g.add(grp);
  }
  return g;
}

// ---------- 地面道路（平铺） ----------
export function makeGroundRoads(grounds, asphaltTexByLanes) {
  const g = new THREE.Group();
  grounds.forEach((road, i) => {
    const p0 = road.pts[0], p1 = road.pts[road.pts.length - 1];
    const len = p0.distanceTo(p1);
    const tex = asphaltTexByLanes[road.lanes].tex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, len / 18);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(road.width, len),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.94, color: 0xcfcfcf }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    mesh.position.set((p0.x + p1.x) / 2, 0.05 + i * 0.025, (p0.z + p1.z) / 2);
    mesh.receiveShadow = true;
    g.add(mesh);
    // 路缘石
    for (const sgn of [1, -1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, len),
        new THREE.MeshStandardMaterial({ color: 0xc2c4c6, roughness: 0.8 }));
      const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      curb.position.copy(mesh.position).addScaledVector(side, sgn * (road.width / 2 + 0.17));
      curb.position.y = 0.11;
      curb.rotation.y = Math.atan2(dir.x, dir.z);
      g.add(curb);
    }
  });
  return g;
}

// ---------- 绿化：灌木 / 乔木 ----------
export function makeVegetation(pierPositions, groundRoads, lowSamples) {
  const group = new THREE.Group();
  // 灌木
  const shrubGeo = new THREE.IcosahedronGeometry(1, 1);
  shrubGeo.scale(1, 0.72, 1);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 0.95, flatShading: true });
  const N_SHRUB = 1400;
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, N_SHRUB);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  let placedShrub = 0;
  for (let tries = 0; tries < N_SHRUB * 14 && placedShrub < N_SHRUB; tries++) {
    const x = (Math.random() - 0.5) * 760, z = (Math.random() - 0.5) * 760;
    if (!clearOfRoads(x, z, 5.5, groundRoads, lowSamples)) continue;
    const s = 0.5 + Math.random() * 1.5;
    q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    sc.set(s, s * (0.7 + Math.random() * 0.5), s);
    m.compose(new THREE.Vector3(x, 0.35 * s, z), q, sc);
    shrubs.setMatrixAt(placedShrub, m);
    col.setHSL(0.28 + Math.random() * 0.06, 0.42 + Math.random() * 0.2, 0.3 + Math.random() * 0.12);
    shrubs.setColorAt(placedShrub, col);
    placedShrub++;
  }
  shrubs.count = placedShrub;
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  group.add(shrubs);

  // 乔木（干+双层冠）
  const treeItems = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6);
  treeItems.push({ geo: trunk, matrix: new THREE.Matrix4().makeTranslation(0, 1.3, 0), color: 0x6d5136 });
  const c1 = new THREE.IcosahedronGeometry(1.7, 1);
  treeItems.push({ geo: c1, matrix: new THREE.Matrix4().makeTranslation(0, 3.4, 0), color: 0x3f6e30 });
  const c2 = new THREE.IcosahedronGeometry(1.2, 1);
  treeItems.push({ geo: c2, matrix: new THREE.Matrix4().makeTranslation(0.5, 4.5, 0.2), color: 0x4c8038 });
  const treeGeo = mergeGeoms(treeItems);
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const N_TREE = 620;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, N_TREE);
  const placedTree = [];
  let tCount = 0;
  for (let tries = 0; tries < N_TREE * 20 && tCount < N_TREE; tries++) {
    const x = (Math.random() - 0.5) * 780, z = (Math.random() - 0.5) * 780;
    if (!clearOfRoads(x, z, 7.5, groundRoads, lowSamples)) continue;
    if (pierPositions.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 30)) continue;
    if (placedTree.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
    const s = 1.15 + Math.random() * 1.15;
    q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    sc.set(s, s * (0.9 + Math.random() * 0.3), s);
    m.compose(new THREE.Vector3(x, 0, z), q, sc);
    trees.setMatrixAt(tCount, m);
    col.setHSL(0.26 + Math.random() * 0.07, 0.4 + Math.random() * 0.18, 0.32 + Math.random() * 0.1);
    trees.setColorAt(tCount, col);
    placedTree.push({ x, z });
    tCount++;
  }
  trees.count = tCount;
  trees.castShadow = true;
  group.add(trees);
  return group;
}

function clearOfRoads(x, z, r, groundRoads, lowSamples) {
  for (const road of groundRoads) {
    for (let s = 0; s <= road.length; s += 6) {
      const p = road.pts[road._seg(s)];
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < (r + road.width / 2) ** 2) return false;
    }
  }
  // 近地匝道段（引道/落地段，lowSamples 为 [x,z,x,z...] 扁平数组）也不许长树
  if (lowSamples) {
    const rr = (r + 5) * (r + 5);
    for (let i = 0; i < lowSamples.length; i += 2) {
      const dx = lowSamples[i] - x, dz = lowSamples[i + 1] - z;
      if (dx * dx + dz * dz < rr) return false;
    }
  }
  return true;
}

// ---------- 远景城市 ----------
export function makeCity(facadeTex, roads) {
  const group = new THREE.Group();
  const corridor = [];
  for (const road of [...roads.mains, ...roads.grounds]) {
    for (let s = 0; s <= road.length; s += 10) corridor.push(road.pts[road._seg(s)]);
  }
  const clearOfCorridor = (x, z, r) => {
    for (const p of corridor) {
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < r * r) return false;
    }
    return true;
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: facadeTex, roughness: 0.75, metalness: 0.08 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 });
  const N = 560;
  const inst = new THREE.InstancedMesh(boxGeo, mat, N);
  const instTall = new THREE.InstancedMesh(boxGeo, glassMat, 160);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0, nt = 0;
  for (let tries = 0; tries < N * 14 && (n < N || nt < 160); tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = 540 + Math.pow(Math.random(), 0.7) * 1500;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // 让建筑对齐街区网格
    const gx = Math.round(x / 55) * 55, gz = Math.round(z / 55) * 55;
    if (Math.hypot(gx, gz) < 530) continue;
    const w = 14 + Math.random() * 34, d = 14 + Math.random() * 34;
    if (!clearOfCorridor(gx, gz, Math.max(w, d) / 2 + 20)) continue;
    const tall = Math.random() < 0.24 && nt < 160;
    q.setFromAxisAngle(UP, Math.floor(Math.random() * 4) * Math.PI / 2);
    if (tall) {
      const h = 70 + Math.random() * 150;
      sc.set(w * 0.8, h, d * 0.8);
      m.compose(new THREE.Vector3(gx, h / 2, gz), q, sc);
      instTall.setMatrixAt(nt, m);
      const t2 = Math.random();
      if (t2 < 0.5) col.setHSL(0.55, 0.16 + Math.random() * 0.1, 0.5 + Math.random() * 0.12);
      else col.setHSL(0.08, 0.04, 0.58 + Math.random() * 0.12);
      instTall.setColorAt(nt, col);
      nt++;
    } else {
      const h = 14 + Math.random() * 48;
      sc.set(w, h, d);
      m.compose(new THREE.Vector3(gx, h / 2, gz), q, sc);
      inst.setMatrixAt(n, m);
      const t = Math.random();
      if (t < 0.5) col.setHSL(0.08, 0.05 + Math.random() * 0.06, 0.6 + Math.random() * 0.14);
      else if (t < 0.8) col.setHSL(0.58, 0.04 + Math.random() * 0.05, 0.55 + Math.random() * 0.12);
      else col.setHSL(0.12, 0.08, 0.58 + Math.random() * 0.1);
      inst.setColorAt(n, col);
      n++;
    }
  }
  inst.count = n;
  instTall.count = nt;
  inst.castShadow = false;
  inst.receiveShadow = false;
  instTall.castShadow = false;
  group.add(inst);
  group.add(instTall);
  // 屋顶盖板（避免顶面出现窗格纹理）
  {
    const capGeo = new THREE.BoxGeometry(1, 1, 1);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const caps = new THREE.InstancedMesh(capGeo, capMat, n + nt);
    const posArr = inst.instanceMatrix.array;
    const cm = new THREE.Matrix4();
    let ci = 0;
    const addCap = (srcInst, count) => {
      const arr = srcInst.instanceMatrix.array;
      for (let i = 0; i < count; i++) {
        const o = i * 16;
        const sx = Math.hypot(arr[o], arr[o + 2]);
        const sy = Math.abs(arr[o + 5]);
        const sz = Math.hypot(arr[o + 8], arr[o + 10]);
        const x = arr[o + 12], y = arr[o + 13], z = arr[o + 14];
        cm.makeScale(sx * 1.05, 0.8, sz * 1.05);
        cm.setPosition(x, y + sy / 2 + 0.4, z);
        caps.setMatrixAt(ci, cm);
        col.setHSL(0.07, 0.04, 0.32 + Math.random() * 0.14);
        caps.setColorAt(ci, col);
        ci++;
      }
    };
    addCap(inst, n);
    addCap(instTall, nt);
    caps.count = ci;
    group.add(caps);
  }
  // 地标高塔（退台式玻璃塔 + 天线）
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.5, metalness: 0.25 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5;
    const r = 760 + Math.random() * 640;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clearOfCorridor(x, z, 60)) continue;
    const h = 170 + Math.random() * 120;
    const w = 24 + Math.random() * 16;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.72, w), glassMat);
    body.position.set(x, h * 0.36, z);
    group.add(body);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.28, w * 0.72), glassMat);
    upper.position.set(x, h * 0.86, z);
    group.add(upper);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h * 0.06, w * 0.4), towerMat);
    crown.position.set(x, h * 1.02, z);
    group.add(crown);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.0, h * 0.12, 6), towerMat);
    spire.position.set(x, h * 1.1, z);
    group.add(spire);
  }
  return group;
}

// ---------- 公园：内部草皮、步道、池塘 ----------
export function makePark(parkTex, pathTex, waterTex) {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(940, 940),
    new THREE.MeshStandardMaterial({ map: parkTex, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.03;
  lawn.material.map.repeat.set(26, 26);
  lawn.receiveShadow = true;
  g.add(lawn);
  // 池塘
  const pond = new THREE.Mesh(new THREE.CircleGeometry(34, 40),
    new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.12, metalness: 0.35 }));
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(1.35, 1, 1);
  pond.position.set(-350, 0.07, 250);
  g.add(pond);
  // 环形步道（细环）
  const ring = new THREE.Mesh(new THREE.RingGeometry(206, 211, 72),
    new THREE.MeshStandardMaterial({ color: 0xd8cfba, roughness: 0.9 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.045;
  ring.receiveShadow = true;
  g.add(ring);
  return g;
}
