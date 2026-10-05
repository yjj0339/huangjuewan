// 环境：渐变天空穹顶、太阳直射光+半球光、雾、云朵与移动云影、远山天际线
import * as THREE from '../vendor/three.module.js?v=40';
import { mergeGeoms } from './deck.js?v=40';

export function makeSky() {
  const geo = new THREE.SphereGeometry(5200, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6fa8dc) },
      mid: { value: new THREE.Color(0xbcd6ea) },
      bot: { value: new THREE.Color(0xc9d9e6) },
    },
    vertexShader: `
      varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 top, mid, bot;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.18 ? mix(mid, top, smoothstep(0.18, 0.75, h))
                           : mix(bot, mid, smoothstep(-0.08, 0.18, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

export function makeLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xcfe4f5, 0x7d8c6c, 0.62);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.15);
  sun.position.set(420, 560, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 470;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 1800;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);
  return { sun, hemi };
}

export function makeClouds(cloudTex, shadowNoise) {
  const group = new THREE.Group();
  // 云朵 billboard
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false });
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(cloudMat.clone());
    s.material.opacity = 0.5 + Math.random() * 0.4;
    const sc = 380 + Math.random() * 620;
    s.scale.set(sc, sc * (0.42 + Math.random() * 0.2), 1);
    s.position.set((Math.random() - 0.5) * 4200, 620 + Math.random() * 420, (Math.random() - 0.5) * 4200);
    s.userData.v = 3 + Math.random() * 5;
    clouds.push(s);
    group.add(s);
  }
  // 云影层（乘法混合，圆形+径向淡出：只覆盖立交核心区，远处不做平面以免条纹伪影）
  const shadowTex = shadowNoise;
  shadowTex.wrapS = shadowTex.wrapT = THREE.ClampToEdgeWrapping;
  shadowTex.repeat.set(1, 1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex, blending: THREE.MultiplyBlending, transparent: true,
    opacity: 0.34, depthWrite: false, fog: false,
  });
  const shadowPlane = new THREE.Mesh(new THREE.CircleGeometry(1500, 48), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 210;
  shadowPlane.renderOrder = 5;
  group.add(shadowPlane);
  group.userData.tick = (dt) => {
    for (const c of clouds) {
      c.position.x += c.userData.v * dt;
      if (c.position.x > 2400) c.position.x = -2400;
    }
  };
  return group;
}

export function makeOuterGround(grassTex) {
  const tex = grassTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(160, 160);
  // 环形（内圈让位给城区地坪，避免两块大平面重叠产生远景 z-fighting 条纹）
  const g = new THREE.Mesh(new THREE.RingGeometry(2280, 4500, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  return g;
}

// ---------- 远山 + 近丘天际线（山城重庆的背景层次） ----------
function ridgeRing(rMin, rMax, hMin, hMax, color, n, seedFn) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seedFn() * 0.4;
    const r = rMin + seedFn() * (rMax - rMin);
    const w = 320 + seedFn() * 560;
    const h = hMin + seedFn() * (hMax - hMin);
    const cone = new THREE.ConeGeometry(w, h, 5 + (seedFn() * 3 | 0), 1);
    cone.rotateY(seedFn() * Math.PI);
    // 山脊感：底部顶点水平扰动
    const pos = cone.getAttribute('position');
    for (let vi = 0; vi < pos.count; vi++) {
      if (pos.getY(vi) < h / 2 - 1) {
        pos.setX(vi, pos.getX(vi) + (seedFn() - 0.5) * w * 0.18);
        pos.setZ(vi, pos.getZ(vi) + (seedFn() - 0.5) * w * 0.18);
      }
    }
    cone.computeVertexNormals();
    cone.translate(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    geos.push({ geo: cone, color: 0xffffff });
  }
  const merged = mergeGeoms(geos);
  return new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
}

export function makeMountains() {
  const group = new THREE.Group();
  let s0 = 71;
  const rnd = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647; };
  // 远山（蓝灰，雾中剪影）+ 近丘（灰绿）
  group.add(ridgeRing(3450, 4150, 150, 380, 0x93a8b8, 26, rnd));
  group.add(ridgeRing(2700, 3200, 45, 125, 0x9cb184, 34, rnd));
  return group;
}

// ---------- 太阳光晕 ----------
export function makeSunGlow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,250,235,0.95)');
  gr.addColorStop(0.25, 'rgba(255,244,214,0.5)');
  gr.addColorStop(0.6, 'rgba(255,240,205,0.16)');
  gr.addColorStop(1, 'rgba(255,240,205,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  spr.position.set(420, 560, 300).normalize().multiplyScalar(4300);
  spr.scale.set(1150, 1150, 1);
  return spr;
}
