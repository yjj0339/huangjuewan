import * as THREE from '../vendor/three.module.js?v=44';
function corners(name, p0, p1, cw, median, idx) {
  const len = p0.distanceTo(p1);
  const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  const roadYaw = Math.atan2(dir.x, dir.z);
  const geo = new THREE.PlaneGeometry(cw, len);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo);
  m.rotation.y = roadYaw;
  m.position.set((p0.x+p1.x)/2, 0.07+idx*0.02, (p0.z+p1.z)/2).addScaledVector(side, median/2+cw/2);
  m.updateMatrixWorld(true);
  const pts = [[-cw/2,0,-len/2],[cw/2,0,len/2]].map(([x,y,z]) => m.localToWorld(new THREE.Vector3(x,y,z)));
  console.log(`${name}: (${pts[0].x.toFixed(0)},${pts[0].z.toFixed(0)}) → (${pts[1].x.toFixed(0)},${pts[1].z.toFixed(0)})`);
}
corners('滨江路(E-W)', new THREE.Vector3(-2300,0,90), new THREE.Vector3(2300,0,90), 11.25, 2.4, 0);
corners('东三环(N-S)', new THREE.Vector3(1500,0,2400), new THREE.Vector3(1500,0,-2400), 11.25, 2.4, 4);
corners('北横路(E-W)', new THREE.Vector3(-2300,0,-280), new THREE.Vector3(2300,0,-280), 5.75, 2, 2);
