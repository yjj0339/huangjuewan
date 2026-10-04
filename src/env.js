// 环境：渐变天空穹顶、太阳直射光+半球光、雾、云朵与移动云影
import * as THREE from '../vendor/three.module.js';

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
  sun.shadow.mapSize.set(4096, 4096);
  const S = 560;
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
    opacity: 0.42, depthWrite: false, fog: false,
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
  const g = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = -0.02;
  g.receiveShadow = true;
  return g;
}
