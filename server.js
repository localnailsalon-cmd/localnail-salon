// LocalNail Salon — static site + small admin API. No dependencies.
//
//   GET  /api/content        public: the content the website renders
//   POST /api/login          { password }        -> session cookie
//   POST /api/logout
//   GET  /api/session        is this visitor signed in?
//   PUT  /api/content        save content        (staff only)
//   POST /api/upload         { name, dataUrl }   (staff only) -> { src }
//
// Content and uploads go through storage.js: DigitalOcean Spaces when the
// SPACES_* variables are set, otherwise the local data/ and images/uploads/
// folders. Set ADMIN_PASSWORD (and SESSION_SECRET) in production.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Local development can keep its settings in data/.env (never committed).
// In production App Platform supplies the same names as real env variables.
(function loadLocalEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, 'data', '.env'), 'utf8');
    text.split(/\r?\n/).forEach(function (line) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  } catch (e) { /* no local env file — fine */ }
})();

const storage = require('./storage');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const SECRET_FILE = path.join(DATA_DIR, '.session-secret');
const UPLOAD_DIR = path.join(ROOT, 'images', 'uploads');

const SESSION_HOURS = 12;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) { /* read-only container: Spaces holds everything that matters */ }

// The password comes from the environment. Without it we generate a random one
// and keep it in data/ — never a fixed default, because this source is public.
const DEV_PASSWORD_FILE = path.join(DATA_DIR, '.dev-password');
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  try {
    ADMIN_PASSWORD = fs.readFileSync(DEV_PASSWORD_FILE, 'utf8').trim();
  } catch (e) {
    ADMIN_PASSWORD = crypto.randomBytes(6).toString('base64url');
    fs.writeFileSync(DEV_PASSWORD_FILE, ADMIN_PASSWORD, { mode: 0o600 });
  }
  console.warn('! ADMIN_PASSWORD is not set. Temporary password for this machine: ' + ADMIN_PASSWORD);
  console.warn('  Set ADMIN_PASSWORD before putting the site online.');
}

// A secret that survives restarts, so staff stay signed in across deploys.
// On App Platform the disk is wiped each deploy, so set SESSION_SECRET there.
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  try {
    SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch (e) {
    SECRET = crypto.randomBytes(32).toString('hex');
    try { fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); } catch (err) {}
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};
const UPLOAD_TYPES = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' };

/* ---------------- sessions ---------------- */

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}
function makeToken() {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  return expires + '.' + sign(String(expires));
}
function validToken(token) {
  if (!token) return false;
  const [expires, mac] = String(token).split('.');
  if (!expires || !mac) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = Buffer.from(sign(expires));
  const given = Buffer.from(mac);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
function isStaff(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)ln_session=([^;]+)/);
  return match ? validToken(decodeURIComponent(match[1])) : false;
}

// Slow down password guessing without locking the owner out for long.
const attempts = new Map();
function tooManyAttempts(ip) {
  const rec = attempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60 * 1000) { attempts.delete(ip); return false; }
  return rec.count >= 8;
}
function noteAttempt(ip, ok) {
  if (ok) { attempts.delete(ip); return; }
  const rec = attempts.get(ip) || { count: 0, first: Date.now() };
  rec.count++;
  attempts.set(ip, rec);
}

/* ---------------- helpers ---------------- */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > limit) { req.destroy(); cb(new Error('too large')); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
    catch (err) { cb(err); }
  });
  req.on('error', (err) => cb(err));
}


/* ---------------- api ---------------- */

function handleApi(req, res, urlPath) {
  const ip = req.socket.remoteAddress || 'unknown';

  if (urlPath === '/api/content' && req.method === 'GET') {
    storage.readContent()
      .then(function (content) { sendJson(res, 200, content); })
      .catch(function (err) {
        console.error('content read failed:', err.message);
        sendJson(res, 500, { error: 'content unavailable' });
      });
    return true;
  }

  if (urlPath === '/api/session' && req.method === 'GET') {
    sendJson(res, 200, { signedIn: isStaff(req) });
    return true;
  }

  if (urlPath === '/api/login' && req.method === 'POST') {
    if (tooManyAttempts(ip)) { sendJson(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' }); return true; }
    readBody(req, 4096, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'bad request' });
      const given = Buffer.from(String((body && body.password) || ''));
      const real = Buffer.from(ADMIN_PASSWORD);
      const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
      noteAttempt(ip, ok);
      if (!ok) return sendJson(res, 401, { error: 'Wrong password' });
      // behind nginx/HTTPS the cookie must never travel over plain http
      const https = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': 'ln_session=' + makeToken() + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' +
          SESSION_HOURS * 3600 + (https ? '; Secure' : ''),
        'Cache-Control': 'no-store'
      });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  if (urlPath === '/api/logout' && req.method === 'POST') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': 'ln_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (urlPath === '/api/content' && req.method === 'PUT') {
    if (!isStaff(req)) { sendJson(res, 401, { error: 'Please sign in again' }); return true; }
    readBody(req, MAX_BODY_BYTES, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Could not read the changes' });
      if (!body || !body.site || !Array.isArray(body.services)) {
        return sendJson(res, 400, { error: 'Unexpected content shape' });
      }
      storage.writeContent(body)
        .then(function () { sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() }); })
        .catch(function (e) {
          console.error('content save failed:', e.message);
          sendJson(res, 500, { error: 'Could not save' });
        });
    });
    return true;
  }

  if (urlPath === '/api/upload' && req.method === 'POST') {
    if (!isStaff(req)) { sendJson(res, 401, { error: 'Please sign in again' }); return true; }
    readBody(req, MAX_BODY_BYTES, (err, body) => {
      if (err) return sendJson(res, 400, { error: 'Image too large (max 8 MB)' });
      const match = /^data:([\w/+.-]+);base64,(.+)$/.exec((body && body.dataUrl) || '');
      if (!match) return sendJson(res, 400, { error: 'Unsupported image' });
      const ext = UPLOAD_TYPES[match[1]];
      if (!ext) return sendJson(res, 400, { error: 'Use a JPG, PNG or WebP image' });
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > MAX_UPLOAD_BYTES) return sendJson(res, 400, { error: 'Image too large (max 8 MB)' });
      // the filename is ours, never the client's, so it can't escape the folder
      const base = String((body && body.name) || 'photo').toLowerCase()
        .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
      const file = base + '-' + crypto.randomBytes(4).toString('hex') + ext;
      storage.putImage(file, buffer, match[1])
        .then(function (src) { sendJson(res, 200, { src: src }); })
        .catch(function (e) {
          console.error('upload failed:', e.message);
          sendJson(res, 500, { error: 'Could not store the image' });
        });
    });
    return true;
  }

  sendJson(res, 404, { error: 'not found' });
  return true;
}

/* ---------------- static files ---------------- */

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); res.end('Bad request'); return; }

  if (urlPath.startsWith('/api/')) { handleApi(req, res, urlPath); return; }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/admin') urlPath = '/admin.html';

  // Serve only what the website itself needs. Everything else — the server
  // source, package files, data/ and .git — stays private.
  const rel = urlPath.replace(/^\/+/, '');
  const PUBLIC_FILES = ['index.html', 'admin.html', 'salon-data.js', 'favicon.ico', 'robots.txt'];
  const isPublic = PUBLIC_FILES.includes(rel) || /^images\/[\w./-]+$/.test(rel);
  const safePath = path.normalize(path.join(ROOT, rel));
  if (!isPublic || !safePath.startsWith(ROOT) || safePath.startsWith(DATA_DIR) || rel.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - Page Not Found</h1>');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - Page Not Found</h1>');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    // Pages and scripts re-check every time so edits show up at once.
    const cache = ['.html', '.js', '.css', '.json'].includes(ext) ? 'no-cache' : 'public, max-age=604800';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('LocalNail Salon running on port ' + PORT + '  (admin at /admin)');
  console.log('Content store: ' + (storage.useSpaces ? 'DigitalOcean Spaces' : 'local disk (data/)'));
});
