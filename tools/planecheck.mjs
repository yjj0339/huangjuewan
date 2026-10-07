import * as THREE from '../vendor/three.module.js?v=44';
// 复现 props.makeGroundRoads 的东三环平面参数
const p0 = new THREE.Vector3(1500, 0.4, 2400), p1 = new THREE.Vector3(1500, 0.4, -2400);
const len = p0.distanceTo(p1);
const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
const side = new THREE.Vector3(dir.z, 0, -dir.x);
const rotZ = -Math.atan2(dir.z, dir.x);
const cw = 11.25, median = 2.4;
for (const sgn of [1, -1]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, len));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rotZ;
  m.position.set((p0.x + p1.x) / 2, 0.07 + 4 * 0.02 + (sgn > 0 ? 0.004 : 0), (p0.z + p1.z) / 2)
    .addScaledVector(side, sgn * (median / 2 + cw / 2));
  m.updateMatrixWorld(true);
  const half = [[-cw/2, -len/2], [cw/2, -len/2], [cw/2, len/2], [-cw/2, len/2]];
  const pts = half.map(([x, y]) => m.localToWorld(new THREE.Vector3(x, y, 0)));
  console.log(`sgn=${sgn} 平面四角:`, pts.map(p => `(${p.x.toFixed(0)},${p.z.toFixed(0)})`).join(' '));
}
