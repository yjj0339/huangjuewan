// 附属设施：路灯、交通标志（门架+立柱牌）、地面道路、公园绿地、乔灌木、远景城市
import * as THREE from '../vendor/three.module.js?v=38';
import { mergeGeoms } from './deck.js?v=38';

const UP = new THREE.Vector3(0, 1, 0);

// 点位上方 [dyMin, dyMax] 高度带内是否有别的桥面经过（水平半径 rad 内）
function blockedAbove(grid, pos, deckY, rad, dyMax, dyMin = 1.5) {
  const near = grid.circle(pos.x, pos.z, rad);
  for (const q of near) {
    if (q.y > deckY + dyMin && q.y < deckY + dyMax) return true;
  }
  return false;
}

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

export function placeLamps(roads, lampsGeo, grid) {
  const items = [];
  for (const road of roads) {
    const gap = road.kind === 'main' ? 38 : road.kind === 'ramp' ? 46 : 55;
    const half = road.width / 2;
    for (let s = 14; s < road.length - 10; s += gap) {
      const f = road.frameAt(s);
      for (const sgn of (road.kind === 'ramp' ? [1] : [1, -1])) {
        const base = f.p.clone().addScaledVector(f.side, sgn * (half + 0.5));
        // 上方 11m 内有别的桥面经过 → 灯杆会戳穿它，跳过
        if (grid && blockedAbove(grid, base, f.p.y, 7, 11)) continue;
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
  inst.castShadow = false; // 灯杆投影收益小、阴影开销大
  return inst;
}

// ---------- 匝道线形诱导柱（弯道外侧白柱，高速细节） ----------
export function makeDelineators(roads) {
  const list = [];
  for (const road of roads.ramps) {
    for (let s = 6; s < road.length - 6; s += 10) {
      const f = road.frameAt(s);
      for (const sgn of [1, -1]) {
        const p = f.p.clone().addScaledVector(f.side, sgn * (road.width / 2 + 0.4));
        list.push({ x: p.x, y: p.y + 0.48, z: p.z });
      }
    }
  }
  const geo = new THREE.CylinderGeometry(0.045, 0.055, 0.95, 6);
  const inst = new THREE.InstancedMesh(geo,
    new THREE.MeshStandardMaterial({ color: 0xf0f3f5, roughness: 0.5 }), list.length);
  const m = new THREE.Matrix4();
  list.forEach((it, i) => { m.makeTranslation(it.x, it.y, it.z); inst.setMatrixAt(i, m); });
  inst.castShadow = false;
  return inst;
}

// ---------- 主线中央分隔防眩柱 ----------
export function makeMedianPosts(roads) {
  const list = [];
  for (const road of roads.mains) {
    for (let s = 4; s < road.length - 4; s += 8) {
      const f = road.frameAt(s);
      list.push({ x: f.p.x, y: f.p.y + 0.95 + 0.26, z: f.p.z });
    }
  }
  const geo = new THREE.BoxGeometry(0.10, 0.52, 0.10);
  const inst = new THREE.InstancedMesh(geo,
    new THREE.MeshStandardMaterial({ color: 0x59616a, roughness: 0.7 }), list.length);
  const m = new THREE.Matrix4();
  list.forEach((it, i) => { m.makeTranslation(it.x, it.y, it.z); inst.setMatrixAt(i, m); });
  inst.castShadow = false;
  return inst;
}

// ---------- 交通标志 ----------
export function makeSigns(roads, signMats, grid) {
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
    if (grid && blockedAbove(grid, f.p, f.p.y, gd.w / 2 + 2, 9.5, 1.5)) continue; // 上方有桥面穿过则不设门架
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
    // 标志牌：单面文字 + 灰色背板（背面不再透出镜像字）
    const backMat = new THREE.MeshStandardMaterial({ color: 0xaeb4b9, roughness: 0.7, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4),
      new THREE.MeshStandardMaterial({ map: gd.tex, roughness: 0.55 }));
    panel.position.set(-half * 0.25, postH - 2.6, 0.05);
    grp.add(panel);
    const back1 = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 3.4), backMat);
    back1.position.set(-half * 0.25, postH - 2.6, 0.02);
    back1.rotation.y = Math.PI;
    grp.add(back1);
    const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.5),
      new THREE.MeshStandardMaterial({ map: signMats.texG1, roughness: 0.55 }));
    panel2.position.set(half * 0.42, postH - 2.5, 0.05);
    grp.add(panel2);
    const back2 = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.5), backMat);
    back2.position.set(half * 0.42, postH - 2.5, 0.02);
    back2.rotation.y = Math.PI;
    grp.add(back2);
    grp.position.copy(f.p);
    grp.rotation.y = Math.atan2(f.tan.x, f.tan.z) + Math.PI; // 牌面朝向来车方向，文字正读
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
    if (grid && blockedAbove(grid, f.p, f.p.y, 4, 7, 1.5)) continue;
    const grp = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.6, 8), postMat);
    post.position.y = 2.3;
    grp.add(post);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8),
      new THREE.MeshStandardMaterial({ map: ed.tex, roughness: 0.55 }));
    panel.position.set(0, 4.4, 0.02);
    grp.add(panel);
    const backS = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xaeb4b9, roughness: 0.7 }));
    backS.position.set(0, 4.4, -0.02);
    backS.rotation.y = Math.PI;
    grp.add(backS);
    grp.position.copy(f.p).addScaledVector(f.side, -(ed.road.width / 2 + 1.2));
    grp.rotation.y = Math.atan2(f.tan.x, f.tan.z) + Math.PI; // 牌面朝向来车方向
    g.add(grp);
  }
  return g;
}

// ---------- 地面道路（双幅平铺，与高架车道逻辑一致） ----------
export function makeGroundRoads(grounds, asphaltTexByLanes) {
  const g = new THREE.Group();
  grounds.forEach((road, i) => {
    const p0 = road.pts[0], p1 = road.pts[road.pts.length - 1];
    const len = p0.distanceTo(p1);
    const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const rotZ = -Math.atan2(dir.z, dir.x);
    const cw = (road.width - road.median) / 2; // 单幅宽
    for (const sgn of [1, -1]) {
      const t = asphaltTexByLanes[road.lanes].tex.clone();
      t.needsUpdate = true;
      t.repeat.set(1, len / 18);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(cw, len),
        new THREE.MeshStandardMaterial({ map: t, roughness: 0.94, color: 0xcfcfcf }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rotZ;
      mesh.position.set((p0.x + p1.x) / 2, 0.07 + i * 0.02 + (sgn > 0 ? 0.004 : 0), (p0.z + p1.z) / 2)
        .addScaledVector(side, sgn * (road.median / 2 + cw / 2));
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    // 路缘石
    for (const sgn of [1, -1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, len),
        new THREE.MeshStandardMaterial({ color: 0xc2c4c6, roughness: 0.8 }));
      curb.position.set((p0.x + p1.x) / 2, 0.11, (p0.z + p1.z) / 2)
        .addScaledVector(side, sgn * (road.width / 2 + 0.17));
      curb.rotation.y = Math.atan2(dir.x, dir.z);
      g.add(curb);
    }
  });
  return g;
}

// ---------- 乔木几何（公园/街区共用） ----------
export function makeTreeGeometry() {
  const treeItems = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.6, 6);
  treeItems.push({ geo: trunk, matrix: new THREE.Matrix4().makeTranslation(0, 1.3, 0), color: 0x6d5136 });
  const c1 = new THREE.IcosahedronGeometry(1.7, 1);
  treeItems.push({ geo: c1, matrix: new THREE.Matrix4().makeTranslation(0, 3.4, 0), color: 0x3f6e30 });
  const c2 = new THREE.IcosahedronGeometry(1.2, 1);
  treeItems.push({ geo: c2, matrix: new THREE.Matrix4().makeTranslation(0.5, 4.5, 0.2), color: 0x4c8038 });
  return mergeGeoms(treeItems);
}

// ---------- 绿化：灌木 / 乔木 ----------
export function makeVegetation(pierPositions, groundRoads, treeClear, bushClear) {
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
    if (!clearOfRoads(x, z, 5.5, groundRoads, bushClear)) continue;
    if (inPond(x, z, 42)) continue;
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

  // 乔木（干+双层冠，几何与街区绿化共用）
  const treeGeo = makeTreeGeometry();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  const N_TREE = 620;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, N_TREE);
  const placedTree = [];
  let tCount = 0;
  for (let tries = 0; tries < N_TREE * 20 && tCount < N_TREE; tries++) {
    const x = (Math.random() - 0.5) * 780, z = (Math.random() - 0.5) * 780;
    if (!clearOfRoads(x, z, 7.5, groundRoads, treeClear)) continue;
    if (inPond(x, z, 48)) continue;
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

function clearOfRoads(x, z, r, groundRoads, clearList) {
  for (const road of groundRoads) {
    for (let s = 0; s <= road.length; s += 6) {
      const p = road.pts[road._seg(s)];
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz < (r + road.width / 2) ** 2) return false;
    }
  }
  // 低空桥面样本（扁平 [x,z,...]）：乔木高度可能戳穿低桥面
  if (clearList) {
    const rr = (r + 6) * (r + 6);
    for (let i = 0; i < clearList.length; i += 2) {
      const dx = clearList[i] - x, dz = clearList[i + 1] - z;
      if (dx * dx + dz * dz < rr) return false;
    }
  }
  return true;
}

// 池塘区域（椭圆 34×1.35 @ (-350,250)）
function inPond(x, z, margin) {
  const dx = (x + 350) / 1.35, dz = z - 250;
  return dx * dx + dz * dz < (34 + margin) ** 2;
}

// ---------- 远景城市（四类建筑原型，带屋顶细节） ----------
function bboxMerge(items) { return mergeGeoms(items); }
const B = (items, w, h, d, x, y, z, color) =>
  items.push({ geo: new THREE.BoxGeometry(w, h, d), matrix: new THREE.Matrix4().makeTranslation(x, y, z), color });
const C = (items, r0, r1, h, x, y, z, color, seg = 8) =>
  items.push({ geo: new THREE.CylinderGeometry(r0, r1, h, seg), matrix: new THREE.Matrix4().makeTranslation(x, y, z), color });

export function makeCity(roads, texResi, texGlass, texShop, texGround) {
  const group = new THREE.Group();
  // 城市街区地坪（圆形，与环形外圈草地无缝拼接不重叠）
  {
    const gt = texGround.clone();
    gt.needsUpdate = true;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2300, 64),
      new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.05;
    ground.receiveShadow = true;
    group.add(ground);
  }
  const corridor = [];
  // 主线（含落地段）+ 地面路 + 全部匝道：建筑不得压在Any道路上
  for (const road of [...roads.mains, ...roads.grounds, ...roads.ramps]) {
    for (let s = 0; s <= road.length; s += 8) corridor.push(road.pts[road._seg(s)]);
  }
  // 走廊空间哈希（线性扫描上万点会拖慢构建数秒）
  const cCell = 40, cMap = new Map();
  for (const p of corridor) {
    const k = Math.floor(p.x / cCell) + ',' + Math.floor(p.z / cCell);
    let arr = cMap.get(k);
    if (!arr) { arr = []; cMap.set(k, arr); }
    arr.push(p);
  }
  const clearOfCorridor = (x, z, r) => {
    const x0 = Math.floor((x - r) / cCell), x1 = Math.floor((x + r) / cCell);
    const z0 = Math.floor((z - r) / cCell), z1 = Math.floor((z + r) / cCell);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const arr = cMap.get(i + ',' + j);
      if (!arr) continue;
      for (const p of arr) {
        const dx = p.x - x, dz = p.z - z;
        if (dx * dx + dz * dz < r * r) return false;
      }
    }
    return true;
  };
  // 占位网格：防止建筑互相叠压
  const occupied = new Set();
  const claim = (x, z) => {
    const key = Math.round(x / 55) + ',' + Math.round(z / 55);
    if (occupied.has(key)) return false;
    occupied.add(key);
    return true;
  };

  // ---- 原型几何 ----
  const WALL = 0xffffff, ROOF = 0x4a4d52, METAL = 0x8a9096, DARKCORE = 0x3a3e44;
  // 住宅楼：主楼 + 女儿墙 + 楼梯间 + 水箱
  const resiItems = [];
  B(resiItems, 24, 33, 14, 0, 16.5, 0, WALL);
  B(resiItems, 24.8, 1.1, 0.6, 0, 33, 7, 0xd6cfc2);
  B(resiItems, 24.8, 1.1, 0.6, 0, 33, -7, 0xd6cfc2);
  B(resiItems, 0.6, 1.1, 14.8, 12.1, 33, 0, 0xd6cfc2);
  B(resiItems, 0.6, 1.1, 14.8, -12.1, 33, 0, 0xd6cfc2);
  B(resiItems, 6, 2.6, 4.5, 3, 34.3, 0, 0xd0c9bc);
  C(resiItems, 1.05, 1.05, 2.4, -5.5, 34.2, 3.2, METAL);
  C(resiItems, 1.05, 1.05, 2.4, -5.5, 34.2, -3.2, METAL);
  const resiGeo = bboxMerge(resiItems);
  // 写字楼：玻璃主楼 + 退台 + 屋面核心筒 + 空调机组 + 天线
  const offItems = [];
  B(offItems, 26, 52, 26, 0, 26, 0, WALL);
  B(offItems, 19, 9, 19, 0, 56.5, 0, WALL);
  B(offItems, 20, 1, 20, 0, 52.2, 0, 0xb9c2c9);
  B(offItems, 7, 3, 7, 0, 62.5, 0, DARKCORE);
  B(offItems, 3.2, 1.4, 2.6, -5, 61.7, 5, 0x8d949b);
  B(offItems, 2.6, 1.2, 2.2, 5.5, 61.6, -4, 0x8d949b);
  C(offItems, 0.12, 0.2, 7, 2, 66, 2, 0x7d858c, 6);
  const offGeo = bboxMerge(offItems);
  // 商业裙楼：大盒子 + 底商带 + 屋面机组 + 天线
  const podItems = [];
  B(podItems, 36, 9, 24, 0, 4.5, 0, WALL);
  B(podItems, 37, 0.8, 25, 0, 9.1, 0, 0xcac4ba);
  B(podItems, 5, 2.2, 4, 8, 10.4, 4, DARKCORE);
  B(podItems, 4, 1.8, 3.4, -7, 10.2, -3, DARKCORE);
  B(podItems, 3, 1.5, 2.8, 0, 10.0, 8, 0x8d949b);
  C(podItems, 0.1, 0.16, 5.5, -12, 12.5, 6, 0x7d858c, 6);
  const podGeo = bboxMerge(podItems);
  // 点式塔楼裙房（上部塔身用玻璃材质，单独实例化）
  const baseItems = [];
  B(baseItems, 30, 7.5, 30, 0, 3.75, 0, WALL);
  B(baseItems, 30.8, 0.9, 30.8, 0, 7.6, 0, 0xcac4ba);
  const baseGeo = bboxMerge(baseItems);
  const towerItems = [];
  B(towerItems, 18, 42, 18, 0, 21, 0, WALL);
  B(towerItems, 18.7, 1, 18.7, 0, 42.4, 0, 0xb9c2c9);
  B(towerItems, 6, 2.6, 6, 0, 44, 0, DARKCORE);
  const towerGeo = bboxMerge(towerItems);

  const matResi = new THREE.MeshStandardMaterial({ map: texResi, vertexColors: true, roughness: 0.85 });
  const matGlass = new THREE.MeshStandardMaterial({ map: texGlass, vertexColors: true, roughness: 0.32, metalness: 0.38 });
  const matShop = new THREE.MeshStandardMaterial({ map: texShop, vertexColors: true, roughness: 0.8 });

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const col = new THREE.Color();
  const fills = (n, rMin, rMax, clearR, place) => {
    let n0 = 0;
    for (let tries = 0; tries < n * 16 && n0 < n; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.pow(Math.random(), 0.75) * (rMax - rMin);
      const gx = Math.round(Math.cos(a) * r / 55) * 55;
      const gz = Math.round(Math.sin(a) * r / 55) * 55;
      if (Math.hypot(gx, gz) < 530) continue;
      if (!claim(gx, gz)) continue;
      if (!clearOfCorridor(gx, gz, clearR)) continue; // 含楼体半宽，楼不压路
      place(gx, gz, n0);
      n0++;
    }
    return n0;
  };
  const setInst = (inst, i, x, y, z, sx, sy, sz, tint) => {
    q.setFromAxisAngle(UP, Math.floor(Math.random() * 4) * Math.PI / 2);
    sc.set(sx, sy, sz);
    m.compose(new THREE.Vector3(x, y, z), q, sc);
    inst.setMatrixAt(i, m);
    inst.setColorAt(i, col.set(tint));
  };
  const warm = () => new THREE.Color().setHSL(0.07 + Math.random() * 0.06, 0.05 + Math.random() * 0.07, 0.72 + Math.random() * 0.13).getHex();
  const cool = () => new THREE.Color().setHSL(0.55 + Math.random() * 0.06, 0.06 + Math.random() * 0.08, 0.66 + Math.random() * 0.13).getHex();

  // 住宅楼
  const NResi = 300;
  const resi = new THREE.InstancedMesh(resiGeo, matResi, NResi);
  fills(NResi, 560, 2050, 48, (x, z, i) => {
    setInst(resi, i, x, 0, z, 0.72 + Math.random() * 0.5, 0.62 + Math.random() * 0.75, 0.72 + Math.random() * 0.5, warm());
  });
  resi.count = NResi;
  resi.castShadow = false;
  group.add(resi);

  // 写字楼
  const NOff = 130;
  const office = new THREE.InstancedMesh(offGeo, matGlass, NOff);
  fills(NOff, 560, 2050, 50, (x, z, i) => {
    setInst(office, i, x, 0, z, 0.78 + Math.random() * 0.5, 0.75 + Math.random() * 0.85, 0.78 + Math.random() * 0.5, cool());
  });
  office.count = NOff;
  group.add(office);

  // 商业裙楼
  const NPois = 150;
  const podium = new THREE.InstancedMesh(podGeo, matShop, NPois);
  fills(NPois, 560, 1500, 54, (x, z, i) => {
    setInst(podium, i, x, 0, z, 0.75 + Math.random() * 0.6, 0.75 + Math.random() * 0.6, 0.75 + Math.random() * 0.6, warm());
  });
  podium.count = NPois;
  group.add(podium);

  // 点式塔楼（裙房 + 玻璃塔身同位）
  const NPoint = 80;
  const pbase = new THREE.InstancedMesh(baseGeo, matShop, NPoint);
  const ptower = new THREE.InstancedMesh(towerGeo, matGlass, NPoint);
  fills(NPoint, 620, 1750, 44, (x, z, i) => {
    setInst(pbase, i, x, 0, z, 0.8, 1, 0.8, warm());
    setInst(ptower, i, x, 7.5, z, 0.85 + Math.random() * 0.3, 0.75 + Math.random() * 0.6, 0.85 + Math.random() * 0.3, cool());
  });
  pbase.count = NPoint; ptower.count = NPoint;
  group.add(pbase);
  group.add(ptower);

  // 街区绿化：未被建筑占用的格子按概率种树（城市不再光秃）
  {
    const cityTreeGeo = makeTreeGeometry();
    const cityTreeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const cap = 900;
    const ct = new THREE.InstancedMesh(cityTreeGeo, cityTreeMat, cap);
    const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3();
    const ccol = new THREE.Color();
    let cn = 0;
    const R2 = 1900 * 1900, R1 = 530 * 530;
    for (let gx = -1900; gx <= 1900 && cn < cap; gx += 36) {
      for (let gz = -1900; gz <= 1900 && cn < cap; gz += 36) {
        const d2 = gx * gx + gz * gz;
        if (d2 < R1 || d2 > R2) continue;
        if (occupied.has(Math.round(gx / 55) + ',' + Math.round(gz / 55))) continue;
        if (Math.random() > 0.34) continue;
        if (!clearOfCorridor(gx, gz, 26)) continue;
        const nTree = 1 + (Math.random() * 3 | 0);
        for (let k = 0; k < nTree && cn < cap; k++) {
          const x = gx + (Math.random() - 0.5) * 12, z = gz + (Math.random() - 0.5) * 12;
          if (!clearOfCorridor(x, z, 12)) continue;
          const s = 0.8 + Math.random() * 0.6;
          cq.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
          cs.set(s, s * (0.9 + Math.random() * 0.3), s);
          cm.compose(new THREE.Vector3(x, 0, z), cq, cs);
          ct.setMatrixAt(cn, cm);
          ccol.setHSL(0.25 + Math.random() * 0.07, 0.38 + Math.random() * 0.16, 0.3 + Math.random() * 0.1);
          ct.setColorAt(cn, ccol);
          cn++;
        }
      }
    }
    ct.count = cn;
    ct.castShadow = false;
    group.add(ct);
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
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.72, w), glassMatLandmark);
    body.position.set(x, h * 0.36, z);
    group.add(body);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, h * 0.28, w * 0.72), glassMatLandmark);
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
const glassMatLandmark = new THREE.MeshStandardMaterial({ color: 0x8fb4c8, roughness: 0.22, metalness: 0.55 });

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
  g.userData.pond = pond;
  return g;
}
