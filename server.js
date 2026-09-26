// LocalNail Salon — static site + small admin API. No dependencies.
//
//   GET  /api/content        public: the content the website renders
//   POST /api/login          { password }        -> session cookie
//   POST /api/logout
//   GET  /api/session        is this visitor signed in?
//   PUT  /api/content        save content        (staff only)
//   POST /api/upload         { name, dataUrl }   (staff only) -> { src }
//   POST /api/members        public: a membership sign-up (+ optional payment slip)
//   GET  /api/members        list sign-ups                   (staff only)
//   PATCH /api/members/:id   { status, note }                (staff only)
//   DELETE /api/members/:id                                  (staff only)
//   GET  /api/members/:id/receipt   the payment slip image   (staff only)
//
// New sign-ups are also sent to the salon's Telegram when TELEGRAM_BOT_TOKEN
// and TELEGRAM_CHAT_ID are set (see README).
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
const MAX_SIGNUP_BYTES = 6 * 1024 * 1024;       // form + a shrunk payment slip
const MEMBER_STATUSES = ['new', 'contacted', 'paid', 'active', 'cancelled'];
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
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
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


/* ---------------- membership sign-ups ---------------- */

// A few sign-ups per visitor per hour is plenty; more is a script.
const signupHits = new Map();
function tooManySignups(ip) {
  const now = Date.now();
  const list = (signupHits.get(ip) || []).filter(function (t) { return now - t < 3600 * 1000; });
  signupHits.set(ip, list);
  if (list.length >= 5) return true;
  list.push(now);
  return false;
}

// Every change to the list goes through one queue, so two sign-ups arriving
// together can never overwrite each other.
let membersQueue = Promise.resolve();
function withMembers(change) {
  const run = membersQueue.then(function () {
    return storage.readMembers().then(function (list) {
      const result = change(list);
      return storage.writeMembers(list).then(function () { return result; });
    });
  });
  membersQueue = run.catch(function () {});
  return run;
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

/* Telegram: one message per sign-up, with the payment slip when there is one.
   A failure here never loses the sign-up; it is already saved. */
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID || '';
function telegram(method, body, contentType) {
  return new Promise(function (resolve, reject) {
    const req = require('https').request({
      method: 'POST', host: 'api.telegram.org', path: '/bot' + TELEGRAM_TOKEN + '/' + method,
      headers: { 'Content-Type': contentType, 'Content-Length': body.length }
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        if (res.statusCode === 200) resolve();
        else reject(new Error('Telegram ' + res.statusCode + ' ' + Buffer.concat(chunks).toString().slice(0, 200)));
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, function () { req.destroy(new Error('Telegram timeout')); });
    req.end(body);
  });
}
function notifyTelegram(member, receipt) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return Promise.resolve();
  const text = [
    '💅 New membership sign-up',
    'Name: ' + member.name,
    'Phone: ' + member.phone,
    'Plan: ' + member.planName + (member.planPrice ? ' (' + member.planPrice + ')' : ''),
    'Start: ' + member.startDate,
    'Payment: ' + (member.payment === 'khqr' ? 'KHQR' + (receipt ? ' — slip attached' : ' — no slip yet') : 'Pay at the salon'),
    member.note ? 'Note: ' + member.note : ''
  ].filter(Boolean).join('\n');
  if (!receipt) {
    return telegram('sendMessage', Buffer.from(JSON.stringify({ chat_id: TELEGRAM_CHAT, text: text })), 'application/json');
  }
  const boundary = '----ln' + crypto.randomBytes(8).toString('hex');
  const part = function (name, value) {
    return Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + name + '"\r\n\r\n' + value + '\r\n');
  };
  const body = Buffer.concat([
    part('chat_id', TELEGRAM_CHAT),
    part('caption', text),
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="photo"; filename="slip' + receipt.ext +
      '"\r\nContent-Type: ' + receipt.type + '\r\n\r\n'),
    receipt.buffer,
    Buffer.from('\r\n--' + boundary + '--\r\n')
  ]);
  return telegram('sendPhoto', body, 'multipart/form-data; boundary=' + boundary);
}

function handleMembers(req, res, urlPath, ip) {
  if (urlPath === '/api/members' && req.method === 'POST') {
    if (tooManySignups(ip)) { sendJson(res, 429, { error: 'Too many sign-ups from this device. Please call the salon.' }); return true; }
    readBody(req, MAX_SIGNUP_BYTES, function (err, body) {
      if (err) return sendJson(res, 400, { error: 'The form could not be read. Try a smaller photo.' });
      if (body.website) return sendJson(res, 200, { ok: true });          // honeypot: a bot filled the hidden field
      const name = cleanText(body.name, 80);
      const phone = cleanText(body.phone, 30);
      const note = cleanText(body.note, 300);
      const startDate = cleanText(body.startDate, 10);
      const payment = body.payment === 'khqr' ? 'khqr' : 'salon';
      if (name.length < 2) return sendJson(res, 400, { error: 'name' });
      if (!/^\+?[\d\s-]{6,20}$/.test(phone) || phone.replace(/\D/g, '').length < 6) return sendJson(res, 400, { error: 'phone' });
      const start = /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? new Date(startDate + 'T00:00:00Z') : null;
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      if (!start || isNaN(start) || start < new Date(today - 864e5) || start > new Date(+today + 400 * 864e5)) {
        return sendJson(res, 400, { error: 'startDate' });
      }
      let receipt = null;
      if (payment === 'khqr' && body.receipt) {
        const m = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(String(body.receipt));
        if (!m) return sendJson(res, 400, { error: 'receipt' });
        const buffer = Buffer.from(m[2], 'base64');
        if (buffer.length > 4 * 1024 * 1024) return sendJson(res, 400, { error: 'receipt' });
        receipt = { buffer: buffer, type: m[1], ext: UPLOAD_TYPES[m[1]] };
      }
      storage.readContent().then(function (content) {
        const plans = ((content.membership || {}).plans || []);
        const plan = plans.filter(function (p) { return p.id === body.planId; })[0];
        if (!plan) return sendJson(res, 400, { error: 'plan' });
        const id = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
        const member = {
          id: id, createdAt: new Date().toISOString(), status: 'new',
          name: name, phone: phone, note: note, startDate: startDate,
          planId: plan.id, planName: cleanText(plan.name, 80), planPrice: cleanText(plan.price, 30),
          payment: payment, receipt: receipt ? id + receipt.ext : ''
        };
        return (receipt ? storage.putReceipt(member.receipt, receipt.buffer, receipt.type) : Promise.resolve())
          .then(function () { return withMembers(function (list) { list.unshift(member); }); })
          .then(function () {
            sendJson(res, 200, { ok: true });
            notifyTelegram(member, receipt).catch(function (e) { console.error('telegram:', e.message); });
          });
      }).catch(function (e) {
        console.error('sign-up failed:', e.message);
        sendJson(res, 500, { error: 'server' });
      });
    });
    return true;
  }

  const match = /^\/api\/members(?:\/([a-z0-9]+))?(\/receipt)?$/.exec(urlPath);
  if (!match) return false;
  if (!isStaff(req)) { sendJson(res, 401, { error: 'Please sign in again' }); return true; }
  const id = match[1];

  if (!id && req.method === 'GET') {
    storage.readMembers().then(function (list) { sendJson(res, 200, list); })
      .catch(function () { sendJson(res, 500, { error: 'Could not load sign-ups' }); });
    return true;
  }
  if (id && match[2] && req.method === 'GET') {
    storage.readMembers().then(function (list) {
      const m = list.filter(function (x) { return x.id === id; })[0];
      if (!m || !m.receipt) throw new Error('none');
      return storage.getReceipt(m.receipt).then(function (buf) {
        const ext = path.extname(m.receipt);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'private, no-store' });
        res.end(buf);
      });
    }).catch(function () { sendJson(res, 404, { error: 'No slip' }); });
    return true;
  }
  if (id && !match[2] && req.method === 'PATCH') {
    readBody(req, 4096, function (err, body) {
      if (err) return sendJson(res, 400, { error: 'bad request' });
      withMembers(function (list) {
        const m = list.filter(function (x) { return x.id === id; })[0];
        if (!m) return null;
        if (MEMBER_STATUSES.indexOf(body.status) >= 0) m.status = body.status;
        if (typeof body.staffNote === 'string') m.staffNote = cleanText(body.staffNote, 500);
        m.updatedAt = new Date().toISOString();
        return m;
      }).then(function (m) { m ? sendJson(res, 200, m) : sendJson(res, 404, { error: 'Not found' }); })
        .catch(function () { sendJson(res, 500, { error: 'Could not save' }); });
    });
    return true;
  }
  if (id && !match[2] && req.method === 'DELETE') {
    let removed = null;
    withMembers(function (list) {
      const i = list.findIndex(function (x) { return x.id === id; });
      if (i >= 0) removed = list.splice(i, 1)[0];
    }).then(function () {
      if (removed && removed.receipt) storage.deleteReceipt(removed.receipt);
      sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' });
    }).catch(function () { sendJson(res, 500, { error: 'Could not delete' }); });
    return true;
  }
  sendJson(res, 405, { error: 'method not allowed' });
  return true;
}

/* ---------------- api ---------------- */

function handleApi(req, res, urlPath) {
  const ip = req.socket.remoteAddress || 'unknown';
  // behind the platform's proxy every visitor shares one socket address, so the
  // sign-up limit keys on the forwarded client address instead (login keeps the socket)
  const clientIp = String(req.headers['x-forwarded-for'] || ip).split(',')[0].trim();
  if (urlPath.indexOf('/api/members') === 0 && handleMembers(req, res, urlPath, clientIp)) return true;

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
  if (urlPath === '/membership') urlPath = '/members.html';

  // Serve only what the website itself needs. Everything else — the server
  // source, package files, data/ and .git — stays private.
  const rel = urlPath.replace(/^\/+/, '');
  const PUBLIC_FILES = ['index.html', 'admin.html', 'members.html', 'salon-data.js', 'favicon.ico', 'robots.txt', 'sitemap.xml'];
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
