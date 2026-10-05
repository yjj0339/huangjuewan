// 程序化 PBR 纹理：沥青（含车道线/磨损/水渍）、混凝土（模板缝/污渍）、
// 草地、建筑立面、交通标志、云与云影噪声。全部 Canvas 生成，零外部依赖。
import * as THREE from '../vendor/three.module.js?v=31';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) { // 可复现伪随机
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- 沥青路面 ----------
// lanes: 单幅车道数; twoWay: 是否对向（画中缝黄线或双白线由几何保证，不画中线）
export function makeAsphalt(lanes, { tileMeters = 18, roadW = 11.5 } = {}) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const rnd = rand(9137 + lanes * 77);
  g.fillStyle = '#2b2e32';
  g.fillRect(0, 0, W, H);
  // 沥青集料颗粒
  for (let i = 0; i < 26000; i++) {
    const v = 30 + rnd() * 40;
    g.fillStyle = `rgba(${v},${v + 2},${v + 4},${0.5 + rnd() * 0.5})`;
    const s = 0.6 + rnd() * 2.2;
    g.fillRect(rnd() * W, rnd() * H, s, s);
  }
  // 低频色斑（修补/老化）
  for (let i = 0; i < 26; i++) {
    const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 30 + rnd() * 22;
    gr.addColorStop(0, `rgba(${v},${v},${v + 3},${0.18 + rnd() * 0.2})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const px = W / roadW; // 每米像素
  const laneW = 3.75 * px;
  const x0 = W / 2 - lanes * laneW / 2;
  // 车辙（每条车道两条暗带）
  for (let l = 0; l < lanes; l++) {
    const cx = x0 + laneW * (l + 0.5);
    for (const off of [-laneW * 0.22, laneW * 0.22]) {
      const gr = g.createLinearGradient(cx + off - 14, 0, cx + off + 14, 0);
      gr.addColorStop(0, 'rgba(18,19,21,0)');
      gr.addColorStop(0.5, 'rgba(18,19,21,0.28)');
      gr.addColorStop(1, 'rgba(18,19,21,0)');
      g.fillStyle = gr;
      g.fillRect(cx + off - 14, 0, 28, H);
    }
  }
  // 横向裂缝 + 纵向细裂
  g.strokeStyle = 'rgba(12,12,14,0.5)';
  for (let i = 0; i < 14; i++) {
    g.lineWidth = 0.8 + rnd() * 1.4;
    g.beginPath();
    let x = rnd() * W, y = rnd() * H;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  // 水渍（大块低透明度深色湿痕，边缘更脏）
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W, y = rnd() * H, rx = 40 + rnd() * 110, ry = 25 + rnd() * 70;
    g.save();
    g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, rx * 0.1, 0, 0, rx);
    gr.addColorStop(0, 'rgba(14,15,17,0.24)');
    gr.addColorStop(0.75, 'rgba(16,17,19,0.12)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }
  // 边缘白实线
  g.fillStyle = 'rgba(225,228,230,0.85)';
  g.fillRect(x0 - 2.5, 0, 3.4, H);
  g.fillRect(x0 + lanes * laneW - 1, 0, 3.4, H);
  // 车道白虚线
  g.fillStyle = 'rgba(228,230,232,0.8)';
  for (let l = 1; l < lanes; l++) {
    const x = x0 + laneW * l - 1.4;
    for (let y = 0; y < H; y += H / 3) g.fillRect(x, y, 2.8, H / 6);
  }
  // 白线磨损：随机咬掉
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.5})`;
    g.fillRect(rnd() * W, rnd() * H, rnd() * 4, rnd() * 8);
  }
  g.globalCompositeOperation = 'source-over';
  const t = toTex(c);
  t.repeat.set(1, 1);
  return { tex: t, metersY: tileMeters };
}

// ---------- 混凝土 ----------
export function makeConcrete({ base = '#a9acad', stains = true } = {}) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = rand(4451);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 30000; i++) {
    const v = 168 + (rnd() - 0.5) * 40;
    g.fillStyle = `rgba(${v},${v},${v - 2},${0.25 + rnd() * 0.4})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
  }
  // 模板分区缝
  g.strokeStyle = 'rgba(90,92,95,0.5)'; g.lineWidth = 2;
  g.strokeRect(6, 6, S - 12, S - 12);
  g.strokeStyle = 'rgba(120,122,125,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(S / 2, 6); g.lineTo(S / 2, S - 6); g.stroke();
  // 螺栓孔
  g.fillStyle = 'rgba(70,72,75,0.55)';
  for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26], [S / 2, 26], [S / 2, S - 26]]) {
    g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
  }
  if (stains) {
    // 雨水黑渍（自上而下拖尾）
    for (let i = 0; i < 22; i++) {
      const x = rnd() * S, w = 6 + rnd() * 26, len = S * (0.3 + rnd() * 0.7), y0 = rnd() * S * 0.4;
      const gr = g.createLinearGradient(0, y0, 0, y0 + len);
      gr.addColorStop(0, `rgba(55,56,58,${0.14 + rnd() * 0.2})`);
      gr.addColorStop(0.8, 'rgba(60,62,64,0.05)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x, y0, w, len);
    }
    // 锈渍
    for (let i = 0; i < 8; i++) {
      const x = rnd() * S, y = rnd() * S, r = 5 + rnd() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(122,84,48,0.30)');
      gr.addColorStop(1, 'rgba(122,84,48,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  return toTex(c);
}

// ---------- 草地 ----------
export function makeGrass() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = rand(771);
  g.fillStyle = '#64814a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 42000; i++) {
    const t = rnd();
    const col = t < 0.4 ? `rgba(${84 + rnd() * 34},${112 + rnd() * 38},${54 + rnd() * 26},0.7)`
      : t < 0.8 ? `rgba(${64 + rnd() * 26},${92 + rnd() * 30},${46 + rnd() * 22},0.7)`
        : `rgba(${112 + rnd() * 34},${124 + rnd() * 30},${62 + rnd() * 22},0.5)`;
    g.fillStyle = col;
    g.fillRect(rnd() * S, rnd() * S, 1.5 + rnd() * 3, 1.5 + rnd() * 3);
  }
  // 大块色斑
  for (let i = 0; i < 30; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 80;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${86 + rnd() * 40},${116 + rnd() * 40},${58 + rnd() * 26},0.20)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return toTex(c);
}

// ---------- 建筑立面 ----------
// 住宅楼：窗 + 阳台板 + 空调外机 + 底部基座层
export function makeResiFacade() {
  const W = 256, H = 256, cols = 6, rows = 8;
  const [c, g] = canvas(W, H);
  const rnd = rand(300);
  g.fillStyle = '#cdc6ba';
  g.fillRect(0, 0, W, H);
  // 墙面细颗粒
  for (let i = 0; i < 4000; i++) {
    const v = 190 + (rnd() - 0.5) * 26;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.3)`;
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    // 层间腰线 + 阳台板
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, r * ch + ch - 5, W, 3);
    g.fillStyle = 'rgba(120,112,100,0.35)';
    g.fillRect(0, r * ch + ch - 2, W, 2);
    for (let col = 0; col < cols; col++) {
      const x = col * cw, y = r * ch;
      const wx = x + cw * 0.18, wy = y + ch * 0.16, ww = cw * 0.5, wh = ch * 0.42;
      // 窗
      const lit = rnd();
      g.fillStyle = lit < 0.12 ? '#c8d6de' : lit < 0.55 ? '#5d7688' : '#3e5468';
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(wx, wy, ww, wh * 0.3);
      // 阳台栏板（窗下浅色板 + 阴影线）
      g.fillStyle = '#ddd6c9';
      g.fillRect(wx - cw * 0.06, wy + wh + 2, ww + cw * 0.12, ch * 0.16);
      g.fillStyle = 'rgba(90,84,74,0.4)';
      g.fillRect(wx - cw * 0.06, wy + wh + 2 + ch * 0.16, ww + cw * 0.12, 2);
      // 空调外机
      if (rnd() < 0.4) {
        g.fillStyle = '#b6bcc2';
        g.fillRect(wx + ww * 0.15, wy + wh * 0.55, ww * 0.32, wh * 0.34);
      }
    }
  }
  // 底部基座层（商铺/入口）
  g.fillStyle = '#8f8a80';
  g.fillRect(0, H - ch * 0.9, W, ch * 0.9);
  g.fillStyle = '#5c6a74';
  for (let col = 0; col < cols; col++) g.fillRect(col * cw + cw * 0.12, H - ch * 0.72, cw * 0.76, ch * 0.5);
  return toTex(c);
}

// 写字楼玻璃幕墙：竖向龙骨 + 随机反射玻璃板 + 层间横梁
export function makeGlassFacade() {
  const W = 256, H = 256, cols = 10, rows = 14;
  const [c, g] = canvas(W, H);
  const rnd = rand(301);
  g.fillStyle = '#9db4c4';
  g.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw, y = r * ch;
      const t = rnd();
      g.fillStyle = t < 0.3 ? '#7f9cb2' : t < 0.6 ? '#6487a1' : t < 0.85 ? '#8ba9be' : '#4e6d85';
      g.fillRect(x + 1, y + 1, cw - 2, ch - 3);
      // 天空反射渐变
      const gr = g.createLinearGradient(0, y, 0, y + ch);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(20,40,60,0.16)');
      g.fillStyle = gr;
      g.fillRect(x + 1, y + 1, cw - 2, ch - 3);
    }
    // 层间梁
    g.fillStyle = 'rgba(235,240,244,0.75)';
    g.fillRect(0, r * ch + ch - 2.5, W, 2.5);
  }
  // 竖向龙骨
  g.fillStyle = 'rgba(226,232,236,0.8)';
  for (let col = 0; col <= cols; col++) g.fillRect(col * cw - 1, 0, 2, H);
  return toTex(c);
}

// 商业裙楼：底商大玻璃 + 招牌带 + 上部小窗
export function makeShopFacade() {
  const W = 256, H = 128, cols = 6, rows = 3;
  const [c, g] = canvas(W, H);
  const rnd = rand(302);
  g.fillStyle = '#c4beb4';
  g.fillRect(0, 0, W, H);
  const cw = W / cols;
  // 底商大玻璃 + 遮阳篷
  for (let col = 0; col < cols; col++) {
    const x = col * cw;
    g.fillStyle = rnd() < 0.5 ? '#4e6a7e' : '#5d7a8e';
    g.fillRect(x + 3, H * 0.42, cw - 6, H * 0.5);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x + 3, H * 0.42, cw - 6, H * 0.14);
    // 遮阳篷
    g.fillStyle = ['#a8552f', '#3f6f52', '#7a4f8f', '#b0782f'][col % 4];
    g.fillRect(x + 1, H * 0.34, cw - 2, H * 0.08);
  }
  // 上部楼层小窗
  for (let r = 0; r < rows - 1; r++) {
    const y = H * 0.06 + r * H * 0.12;
    for (let col = 0; col < cols; col++) {
      const x = col * cw;
      g.fillStyle = rnd() < 0.3 ? '#cdd8de' : '#54687a';
      g.fillRect(x + cw * 0.22, y, cw * 0.5, H * 0.08);
    }
  }
  return toTex(c);
}

// ---------- 交通标志（绿底高速牌 / 蓝底指路牌） ----------
export function makeSign(kind, lines) {
  // lines: [{text, arrow:'left'|'right'|'up'|'none'}]
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = kind === 'green' ? '#0a7d43' : '#1c6bb5';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff'; g.lineWidth = 6;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = '#ffffff';
  g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((ln, i) => {
    const y = (H / (n + 1)) * (i + 1);
    g.font = `bold ${Math.min(52, 120 / n)}px "Microsoft YaHei", sans-serif`;
    g.textAlign = ln.arrow && ln.arrow !== 'none' ? 'left' : 'center';
    const tx = ln.arrow && ln.arrow !== 'none' ? 70 : W / 2;
    g.fillText(ln.text, tx, y);
    if (ln.arrow && ln.arrow !== 'none') drawArrow(g, ln.arrow, W - 84, y, 44);
  });
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function drawArrow(g, dir, x, y, s) {
  g.save();
  g.translate(x, y);
  if (dir === 'left') g.scale(-1, 1);
  g.fillStyle = '#fff';
  g.beginPath();
  if (dir === 'up' || dir === 'left') {
    g.moveTo(0, -s / 2); g.lineTo(s * 0.42, 0); g.lineTo(s * 0.16, 0);
    g.lineTo(s * 0.16, s / 2); g.lineTo(-s * 0.16, s / 2); g.lineTo(-s * 0.16, 0);
    g.lineTo(-s * 0.42, 0);
  } else { // right 曲线箭头
    g.moveTo(-s * 0.45, s * 0.5);
    g.lineTo(-s * 0.05, s * 0.5);
    g.lineTo(-s * 0.05, -s * 0.05);
    g.lineTo(s * 0.18, -s * 0.05);
    g.lineTo(s * 0.18, -s * 0.3);
    g.lineTo(s * 0.52, s * 0.02);
    g.lineTo(s * 0.18, s * 0.34);
    g.lineTo(s * 0.18, s * 0.1);
    g.lineTo(-s * 0.22, s * 0.1);
  }
  g.closePath(); g.fill();
  g.restore();
}

// ---------- 云（柔和大团块） ----------
export function makeCloudSprite(seed = 1) {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = rand(seed * 997 + 13);
  for (let i = 0; i < 16; i++) {
    const x = S * (0.3 + rnd() * 0.4), y = S * (0.38 + rnd() * 0.24), r = S * (0.10 + rnd() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(250,251,253,0.28)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 云影噪声（灰度，乘法混合用） ----------
export function makeCloudShadowNoise(seed = 5) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = rand(seed * 131 + 7);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 42; i++) {
    const x = rnd() * S, y = rnd() * S, r = 40 + rnd() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const v = 168 + rnd() * 66;
    gr.addColorStop(0, `rgba(${v},${v},${v + 4},0.85)`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
  }
  // 径向淡出：中心有云影，边缘回到白色（乘法混合下即无效果），避免远处平面上出现摩尔纹
  const fade = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5);
  fade.addColorStop(0, 'rgba(255,255,255,0)');
  fade.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = fade;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------- 池塘水面 ----------
export function makeWater() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = rand(88);
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, '#5b86a5'); gr.addColorStop(1, '#7ba6c4');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 240; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.1})`;
    g.lineWidth = 1 + rnd() * 1.6;
    const x = rnd() * S, y = rnd() * S, l = 10 + rnd() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd() - 0.5) * 4); g.stroke();
  }
  return toTex(c);
}

// ---------- 城市街区地坪（街道网格） ----------
export function makeCityGround() {
  const S = 2048;
  const [c, g] = canvas(S, S);
  const rnd = rand(606);
  g.fillStyle = '#7c9c63';
  g.fillRect(0, 0, S, S);
  // 街区草地噪声
  for (let i = 0; i < 26000; i++) {
    const v = 100 + rnd() * 50;
    g.fillStyle = `rgba(${v - 20},${v + 8},${v - 34},0.25)`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 4, 2 + rnd() * 4);
  }
  // 部分街区内部做硬化场地
  const cell = 24.5; // 4600m / 55m ≈ 84 格 → 每格约 24.5px
  for (let gy = 0; gy < S / cell; gy++) {
    for (let gx = 0; gx < S / cell; gx++) {
      if (rnd() < 0.22) {
        g.fillStyle = `rgba(168,172,168,${0.25 + rnd() * 0.3})`;
        g.fillRect(gx * cell + 7, gy * cell + 7, cell - 14, cell - 14);
      }
    }
  }
  // 街道网格
  g.fillStyle = '#999fa5';
  for (let i = 0; i <= S / cell; i++) {
    g.fillRect(i * cell - 2.9, 0, 5.8, S);
    g.fillRect(0, i * cell - 2.9, S, 5.8);
  }
  // 街道中线
  g.strokeStyle = 'rgba(230,232,234,0.75)';
  g.lineWidth = 0.8;
  g.setLineDash([5, 5]);
  for (let i = 0; i <= S / cell; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * cell); g.lineTo(S, i * cell); g.stroke();
  }
  return toTex(c);
}
