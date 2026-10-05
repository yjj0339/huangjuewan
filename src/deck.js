// 桥面几何：沿道路中心线扫描横断面 → 沥青桥面 + 混凝土边梁腹板 + 护栏 + 中央分隔墙；
// 桥墩：锥形方柱 + 盖梁 + 基座，自动避让下方穿越的其它桥面。
import * as THREE from '../vendor/three.module.js?v=32';

const UP = new THREE.Vector3(0, 1, 0);

// ---- 合并带索引几何 ----
export function mergeGeoms(items) {
  // items: [{geo, matrix?, color?}] → 单一 BufferGeometry（position/normal/uv/index/color）
  let vCount = 0, iCount = 0;
  const parts = items.map(({ geo, matrix, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    return { g, color };
  });
  for (const { g } of parts) { vCount += g.getAttribute('position').count; iCount += g.getAttribute('position').count; }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  const c = new THREE.Color();
  for (const { g, color } of parts) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    pos.set(p.array, vo * 3);
    if (n) nor.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    c.set(color !== undefined ? color : 0xffffff);
    for (let i = 0; i < p.count; i++) { col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
    for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
    vo += p.count; io += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---- 断面扫描 ----
// profile: [{u,v}] 折线（u=横向偏移, v=相对桥面顶面高度），open 或 closed
function sweep(profile, road, matIdx, opts, buffers) {
  const { frames, tileLen = 6, uScale = 1, closed = false } = opts;
  const n = frames.length;
  const m = profile.length;
  const segs = closed ? m : m - 1;
  for (let si = 0; si < segs; si++) {
    const a = profile[si], b = profile[(si + 1) % m];
    const edgeLen = Math.hypot(b.u - a.u, b.v - a.v) || 0.001;
    for (let i = 0; i < n - 1; i++) {
      const f0 = frames[i], f1 = frames[i + 1];
      const vBase = buffers.pos.length / 3;
      const corners = [
        [a, f0], [b, f0], [b, f1], [a, f1],
      ];
      for (const [pr, f] of corners) {
        const p = f.p.clone()
          .addScaledVector(f.side, pr.u)
          .addScaledVector(UP, pr.v);
        buffers.pos.push(p.x, p.y, p.z);
        buffers.uv.push(pr.u * uScale, f.s / tileLen);
      }
      // 面法线：断面边向量（经 side/up 映射到世界）× 切向
      const e1 = f1.side.clone().multiplyScalar(b.u - a.u)
        .addScaledVector(UP, b.v - a.v);
      const nrm = e1.cross(f1.tan).normalize();
      for (let k = 0; k < 4; k++) buffers.nor.push(nrm.x, nrm.y, nrm.z);
      const q = [vBase, vBase + 1, vBase + 2, vBase, vBase + 2, vBase + 3];
      // 缠绕方向保持一致
      buffers.idx.push(...q);
      buffers.mat.push(matIdx, matIdx, matIdx, matIdx, matIdx, matIdx);
    }
  }
}

function buildFrames(road, step) {
  const frames = [];
  for (let s = 0; s <= road.length; s += step) frames.push({ s, ...road.frameAt(s) });
  const last = road.frameAt(road.length);
  last.s = road.length;
  frames.push(last);
  return frames;
}

export function buildDeck(road, mats) {
  // mats: {asphalt, concrete, metal}
  const step = road.kind === 'main' ? 5 : 3.2;
  const frames = buildFrames(road, step);
  let sAcc = 0;
  for (let i = 0; i < frames.length; i++) {
    if (i === 0) frames[i].s = 0;
    else sAcc += frames[i].p.distanceTo(frames[i - 1].p), frames[i].s = sAcc;
  }
  const buffers = { pos: [], nor: [], uv: [], idx: [], mat: [] };
  const half = road.width / 2;

  if (road.carriageways === 'dual') {
    const cw = (road.width - road.median) / 2; // 单幅宽
    const off = road.median / 2 + cw / 2;
    for (const sgn of [1, -1]) {
      carriagewaySweep(buffers, frames, sgn * off, cw, mats);
    }
    // 中央分隔墙
    sweep([{ u: -0.42, v: 0 }, { u: 0.42, v: 0 }, { u: 0.30, v: 0.95 }, { u: -0.30, v: 0.95 }],
      null, mats.index.concrete, { frames, tileLen: 8, closed: true }, buffers);
  } else {
    carriagewaySweep(buffers, frames, 0, road.width, mats);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buffers.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uv, 2));
  geo.setIndex(buffers.idx);
  // 分组
  geo.clearGroups();
  let start = 0;
  let cur = buffers.mat[0];
  for (let i = 0; i < buffers.mat.length; i += 3) {
    if (buffers.mat[i] !== cur) { geo.addGroup(start, i - start, cur); start = i; cur = buffers.mat[i]; }
  }
  geo.addGroup(start, buffers.mat.length - start, cur);
  return geo;
}

function carriagewaySweep(buffers, framesAll, centerOff, cw, mats) {
  // 把 frames 平移到单幅中心（复制 frames 加偏移）
  const frames = framesAll.map(f => ({
    s: f.s, p: f.p.clone().addScaledVector(f.side, centerOff),
    tan: f.tan, side: f.side,
  }));
  const w2 = cw / 2;
  // 沥青顶面
  sweep([{ u: -w2, v: 0.02 }, { u: w2, v: 0.02 }], null, mats.index.asphalt,
    { frames, tileLen: 18, uScale: 1 / cw, closed: false }, buffers);
  // 腹板（外侧面）+ 底板
  sweep([{ u: w2, v: 0 }, { u: w2 + 0.10, v: -1.30 }], null, mats.index.concrete,
    { frames, tileLen: 7, closed: false }, buffers);
  sweep([{ u: w2 + 0.10, v: -1.30 }, { u: -w2 - 0.10, v: -1.30 }], null, mats.index.concrete,
    { frames, tileLen: 7, closed: false }, buffers);
  sweep([{ u: -w2 - 0.10, v: -1.30 }, { u: -w2, v: 0 }], null, mats.index.concrete,
    { frames, tileLen: 7, closed: false }, buffers);
  // 两侧混凝土护栏（封闭断面）+ 金属横栏
  for (const sgn of [1, -1]) {
    const x0 = sgn * (w2 - 0.30), x1 = sgn * (w2 + 0.20), xt = sgn * (w2 - 0.02);
    const prof = [
      { u: x0, v: 0 }, { u: x1, v: 0 }, { u: x1, v: 0.10 },
      { u: xt, v: 0.72 }, { u: sgn * (w2 + 0.02), v: 1.02 }, { u: x0, v: 1.02 },
    ];
    sweep(prof, null, mats.index.concrete, { frames, tileLen: 5, closed: true }, buffers);
    // 金属栏（两道薄管矩形）
    for (const h of [1.22, 0.86]) {
      sweep([
        { u: sgn * (w2 + 0.05), v: h }, { u: sgn * (w2 + 0.05), v: h + 0.09 },
        { u: sgn * (w2 - 0.06), v: h + 0.09 }, { u: sgn * (w2 - 0.06), v: h },
      ], null, mats.index.metal, { frames, tileLen: 5, closed: true }, buffers);
    }
  }
}

// ---- 桥墩 ----
export function buildPiers(roads, grid, grounds = []) {
  const items = [];
  const concreteColor = 0xb4b6b8;
  const placed = [];
  // 地面道路样本：桥墩不得立在地面道路的路面上
  const groundSamples = [];
  for (const g of grounds) {
    for (let s = 0; s <= g.length; s += 6) {
      const p = g.pts[g._seg(s)];
      groundSamples.push(p.x, p.z);
    }
  }
  const nearGround = (x, z, r) => {
    const rr = r * r;
    for (let i = 0; i < groundSamples.length; i += 2) {
      const dx = groundSamples[i] - x, dz = groundSamples[i + 1] - z;
      if (dx * dx + dz * dz < rr) return true;
    }
    return false;
  };
  for (const road of roads) {
    if (road.kind === 'ground') continue;
    const gap = road.kind === 'main' ? 30 : 25;
    for (let s = gap * 0.6; s < road.length - gap * 0.6; s += gap) {
      // 微扰错开相邻线路的墩位节奏
      const sTry = [0, 7, -7, 14, -14];
      let done = false;
      for (const off of sTry) {
        const ss = s + off;
        if (ss < 8 || ss > road.length - 8) continue;
        const f = road.frameAt(ss);
        const x = f.p.x, z = f.p.z, deckY = f.p.y;
        if (deckY < 2.2) continue; // 已贴地段不再立墩
        if (nearGround(x, z, 14)) continue; // 不立在地面上道路中
        if (blocked(grid, x, z, deckY, road)) continue;
        if (placed.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < 64)) continue;
        const groundY = 0;
        const capY = deckY - 1.55;
        const h = capY - groundY;
        const isMain = road.kind === 'main';
        const rTop = isMain ? 1.5 : 1.15, rBot = isMain ? 2.0 : 1.5;
        // 锥形方柱（4 段圆柱旋转 45°）
        const col = new THREE.CylinderGeometry(rTop, rBot, h, 4, 1);
        col.rotateY(Math.PI / 4);
        items.push({
          geo: col,
          matrix: new THREE.Matrix4().makeTranslation(x, groundY + h / 2, z),
          color: concreteColor,
        });
        // 盖梁
        const capW = road.width + 1.6;
        const cap = new THREE.BoxGeometry(capW, 1.7, isMain ? 3.0 : 2.4);
        items.push({
          geo: cap,
          matrix: new THREE.Matrix4()
            .makeRotationY(Math.atan2(f.tan.x, f.tan.z))
            .setPosition(x, capY - 0.85, z),
          color: concreteColor,
        });
        // 基座
        const base = new THREE.BoxGeometry(rBot * 2 + 1.4, 1.2, rBot * 2 + 1.4);
        items.push({ geo: base, matrix: new THREE.Matrix4().makeTranslation(x, 0.6, z), color: 0xa6a8aa });
        placed.push({ x, z, road: road.name, s: ss, capY, h });
        done = true;
        break;
      }
    }
  }
  const merged = mergeGeoms(items);
  return { geo: merged, placed };
}

// 桥墩与任何其它桥面（无论上下）都必须错开：
// 其它桥面中心低于本桥面 -0.25m 时，其桥板会撞上本墩的盖梁/柱身
function blocked(grid, x, z, deckY, selfRoad) {
  const near = grid.circle(x, z, 20);
  for (const q of near) {
    if (q.road === selfRoad) continue;
    const lat = Math.hypot(q.x - x, q.z - z);
    if (lat > q.half + 3.2) continue;
    if (q.y < deckY - 0.25) return true;
  }
  return false;
}
