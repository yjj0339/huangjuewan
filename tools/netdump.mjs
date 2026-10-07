import { buildNetwork } from '../src/roads.js';
const net = buildNetwork();
let bad = 0;
for (const r of net.ramps) {
  if (!r.merge) continue;
  const end = r.pts[r.pts.length - 1];
  const m = r.merge;
  const f = m.road.frameAt(m.s);
  const rf = r.frameAt(r.length);
  const lat = end.clone().sub(rf.p).dot(rf.side);
  const lon = end.clone().sub(f.p).dot(f.tan);
  const mf = m.road.frameAt(r.merge.sEnd);
  const latEnd = end.clone().sub(mf.p).dot(mf.side);
  const inTarget = Math.abs(latEnd) + r.width / 2 <= m.road.width / 2 - 0.5;
  const ok = lon > 40 && inTarget && Math.abs(lat) < 1.5;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${r.name}  延伸=${lon.toFixed(0)}m 末端lat=${latEnd.toFixed(1)} 折角=${lat.toFixed(2)}`);
}
for (const m of net.mains) {
  if (!m.merge) continue;
  const end = m.pts[m.pts.length - 1];
  const f = m.merge.road.frameAt(m.merge.s);
  console.log(`${m.name} 末端 y=${end.y.toFixed(2)} 目标面y=${f.p.y.toFixed(2)}`);
}
console.log(bad === 0 ? 'ALL MERGES OK' : `${bad} merges BAD`);
