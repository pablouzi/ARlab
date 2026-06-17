/**
 * AR WebApp Builder — Dev Server
 * Endpoints:
 *   POST /save        → guarda texto (HTML)
 *   POST /save-binary → guarda archivos binarios (GLB, .mind)
 *   GET  /*           → servidor estático
 */
const http  = require('http');
const fs    = require('fs');
const path  = require('path');
const { exec } = require('child_process');

const PORT = 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mind': 'application/octet-stream',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
};

// Recibir body completo como Buffer (para binarios)
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── POST /save — guarda texto (HTML) ────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/save') {
    try {
      const buf  = await readBody(req);
      const { filename, content } = JSON.parse(buf.toString('utf8'));
      const safeName = path.basename(filename || 'ar-experience.html');
      const filePath = path.join(ROOT, safeName);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ HTML guardado: ${filePath} (${(content.length/1024).toFixed(1)} KB)`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: `http://localhost:${PORT}/${safeName}` }));
    } catch(e) {
      console.error('❌ /save error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ── POST /save-binary — guarda archivo binario (GLB, .mind, imagen) ─────────
  // Body: JSON { filename: 'assets/model.glb', data: '<base64>' }
  if (req.method === 'POST' && req.url === '/save-binary') {
    try {
      const buf  = await readBody(req);
      const { filename, data } = JSON.parse(buf.toString('utf8'));

      // Permitir subdirectorios dentro de ROOT (ej: assets/)
      const safeName = filename.replace(/\.\./g, '').replace(/^\//, '');
      const filePath = path.join(ROOT, safeName);

      // Crear directorio si no existe
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      // Decodificar base64 → binario
      const binBuffer = Buffer.from(data, 'base64');
      fs.writeFileSync(filePath, binBuffer);

      const sizeKB = (binBuffer.length / 1024).toFixed(1);
      const sizeMB = (binBuffer.length / 1024 / 1024).toFixed(2);
      console.log(`✅ Binario guardado: ${filePath} (${sizeMB} MB)`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok:   true,
        path: safeName,
        url:  `http://localhost:${PORT}/${safeName}`,
        size: binBuffer.length,
      }));
    } catch(e) {
      console.error('❌ /save-binary error:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ── GET — servidor estático ──────────────────────────────────────────────────
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, decodeURIComponent(urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${urlPath}`);
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 
      'Content-Type': mime,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │   AR WebApp Builder — Dev Server             │');
  console.log(`  │   http://localhost:${PORT}                    │`);
  console.log('  │   POST /save        → HTML                   │');
  console.log('  │   POST /save-binary → GLB / .mind (binarios) │');
  console.log('  │   Ctrl+C para detener                        │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');

  const open = process.platform === 'win32'
    ? `start ${url}/index.html`
    : process.platform === 'darwin'
      ? `open ${url}/index.html`
      : `xdg-open ${url}/index.html`;

  exec(open, err => { if (err) console.log(`  Abre manualmente: ${url}/index.html`); });
});
