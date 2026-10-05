// 本地预览服务器：node tools/server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 8918;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  // 页面截图回传通道（静默实测：离屏窗口内页面自截并 POST 到这里）
  if (req.method === 'POST' && p === '/__shot') {
    const q = new URLSearchParams(req.url.split('?')[1] || '');
    const name = (q.get('name') || 'shot').replace(/[^\w.-]/g, '_');
    const perf = q.get('perf') || '';
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const dir = path.join(ROOT, 'shots');
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* exists */ }
      fs.writeFileSync(path.join(dir, name + '.png'), buf);
      fs.writeFileSync(path.join(dir, name + '.txt'), perf);
      res.writeHead(200); res.end('ok ' + buf.length);
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const file = path.resolve(ROOT, '.' + p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('403');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`预览: http://localhost:${PORT}/`);
  const os = require('os');
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name]) {
      if (it.family === 'IPv4' && !it.internal) console.log(`局域网: http://${it.address}:${PORT}/`);
    }
  }
});
