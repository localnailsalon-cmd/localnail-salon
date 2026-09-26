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
//   /api/bookings …          the same five routes for appointment requests
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

// A few sign-ups or bookings per visitor per hour is plenty; more is a script.
const signupHits = new Map();
function tooManySignups(ip) {
  const now = Date.now();
  const list = (signupHits.get(ip) || []).filter(function (t) { return now - t < 3600 * 1000; });
  signupHits.set(ip, list);
  if (list.length >= 8) return true;
  list.push(now);
  return false;
}

// Every change to a list goes through one queue per list, so two requests
// arriving together can never overwrite each other.
const queues = {};
function withRecords(kind, change) {
  const run = (queues[kind] || Promise.resolve()).then(function () {
    return storage.readRecords(kind).then(function (list) {
      const result = change(list);
      return storage.writeRecords(kind, list).then(function () { return result; });
    });
  });
  queues[kind] = run.catch(function () {});
  return run;
}

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function priceId(cat, item) {
  return 'price-' + cat.id + '-' + String(item.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function isoDay(offsetDays) {
  const d = new Date(Date.now() + 7 * 3600 * 1000);             // Cambodia time (UTC+7)
  d.setUTCHours(0, 0, 0, 0);
  return new Date(+d + (offsetDays || 0) * 864e5).toISOString().slice(0, 10);
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
function notifyTelegram(record, receipt) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT) return Promise.resolve();
  const pay = record.payment === 'khqr' ? 'Payment: KHQR' + (receipt ? ' — slip attached' : ' — no slip yet') : '';
  const text = (record.kind === 'booking' ? [
    '📅 New booking request',
    'Name: ' + record.name,
    'Phone: ' + record.phone,
    'When: ' + record.date + ' at ' + record.time,
    'Services: ' + record.services.map(function (x) { return x.name + ' (' + x.price + ')'; }).join(', '),
    record.total ? 'Total: ' + record.total : '',
    pay,
    record.note ? 'Note: ' + record.note : ''
  ] : [
    '💅 New membership sign-up',
    'Name: ' + record.name,
    'Phone: ' + record.phone,
    'Plan: ' + record.planName + (record.planPrice ? ' (' + record.planPrice + ')' : ''),
    'Start: ' + record.startDate,
    pay,
    record.note ? 'Note: ' + record.note : ''
  ]).filter(Boolean).join('\n');
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

const STATUSES = {
  members: ['new', 'contacted', 'paid', 'active', 'cancelled'],
  bookings: ['new', 'confirmed', 'done', 'cancelled', 'no-show']
};

// The fields both forms share; returns an error code or the cleaned values.
function commonFields(body) {
  const name = cleanText(body.name, 80);
  const phone = cleanText(body.phone, 30);
  if (name.length < 2) return { error: 'name' };
  if (!/^\+?[\d\s-]{6,20}$/.test(phone) || phone.replace(/\D/g, '').length < 6) return { error: 'phone' };
  const payment = body.payment === 'khqr' ? 'khqr' : 'salon';
  let receipt = null;
  if (payment === 'khqr' && body.receipt) {
    const m = /^data:(image\/(?:webp|jpeg|png));base64,(.+)$/.exec(String(body.receipt));
    if (!m) return { error: 'receipt' };
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length > 4 * 1024 * 1024) return { error: 'receipt' };
    receipt = { buffer: buffer, type: m[1], ext: UPLOAD_TYPES[m[1]] };
  }
  return { name: name, phone: phone, note: cleanText(body.note, 300), payment: payment, receipt: receipt };
}

function validDay(value, maxDays) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + 'T00:00:00Z')) &&
    value >= isoDay(-1) && value <= isoDay(maxDays);
}

// Build the stored record from the form and the salon's current content.
const BUILDERS = {
  members: function (body, content, base) {
    const startDate = cleanText(body.startDate, 10);
    if (!validDay(startDate, 400)) return { error: 'startDate' };
    const plan = (((content.membership || {}).plans) || []).filter(function (p) { return p.id === body.planId; })[0];
    if (!plan) return { error: 'plan' };
    return Object.assign(base, {
      kind: 'membership', startDate: startDate,
      planId: plan.id, planName: cleanText(plan.name, 80), planPrice: cleanText(plan.price, 30)
    });
  },
  bookings: function (body, content, base) {
    const date = cleanText(body.date, 10);
    const time = cleanText(body.time, 5);
    if (!validDay(date, 90)) return { error: 'date' };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'time' };
    const wanted = Array.isArray(body.services) ? body.services.slice(0, 12).map(String) : [];
    const chosen = [];
    (content.services || []).forEach(function (cat) {
      cat.items.forEach(function (item) {
        if (wanted.indexOf(priceId(cat, item)) >= 0) chosen.push({ id: priceId(cat, item), name: cleanText(item.name, 80), price: cleanText(item.price, 30) });
      });
    });
    if (!chosen.length) return { error: 'services' };
    // a total only when every price is a plain amount; "$35+" or "$1 / nail" need the salon
    let total = 0, exact = true;
    chosen.forEach(function (x) { if (/^\$\d+(\.\d+)?$/.test(x.price)) total += parseFloat(x.price.slice(1)); else exact = false; });
    return Object.assign(base, {
      kind: 'booking', date: date, time: time, services: chosen,
      total: exact ? '$' + (Math.round(total * 100) / 100) : ''
    });
  }
};

function handleRecords(req, res, urlPath, ip) {
  const match = /^\/api\/(members|bookings)(?:\/([a-z0-9]+))?(\/receipt)?$/.exec(urlPath);
  if (!match) return false;
  const kind = match[1], id = match[2];

  if (!id && req.method === 'POST') {
    if (tooManySignups(ip)) { sendJson(res, 429, { error: 'many' }); return true; }
    readBody(req, MAX_SIGNUP_BYTES, function (err, body) {
      if (err) return sendJson(res, 400, { error: 'receipt' });
      if (body.website) return sendJson(res, 200, { ok: true });          // honeypot: a bot filled the hidden field
      const common = commonFields(body);
      if (common.error) return sendJson(res, 400, { error: common.error });
      storage.readContent().then(function (content) {
        const newId = Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
        const receipt = common.receipt;
        const record = BUILDERS[kind](body, content, {
          id: newId, createdAt: new Date().toISOString(), status: 'new',
          name: common.name, phone: common.phone, note: common.note,
          payment: common.payment, receipt: receipt ? newId + receipt.ext : ''
        });
        if (record.error) return sendJson(res, 400, { error: record.error });
        return (receipt ? storage.putReceipt(record.receipt, receipt.buffer, receipt.type) : Promise.resolve())
          .then(function () { return withRecords(kind, function (list) { list.unshift(record); }); })
          .then(function () {
            sendJson(res, 200, { ok: true, total: record.total || '' });
            notifyTelegram(record, receipt).catch(function (e) { console.error('telegram:', e.message); });
          });
      }).catch(function (e) {
        console.error(kind + ' save failed:', e.message);
        sendJson(res, 500, { error: 'server' });
      });
    });
    return true;
  }

  if (!isStaff(req)) { sendJson(res, 401, { error: 'Please sign in again' }); return true; }

  if (!id && req.method === 'GET') {
    storage.readRecords(kind).then(function (list) { sendJson(res, 200, list); })
      .catch(function () { sendJson(res, 500, { error: 'Could not load the list' }); });
    return true;
  }
  if (id && match[3] && req.method === 'GET') {
    storage.readRecords(kind).then(function (list) {
      const r = list.filter(function (x) { return x.id === id; })[0];
      if (!r || !r.receipt) throw new Error('none');
      return storage.getReceipt(r.receipt).then(function (buf) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(r.receipt)] || 'application/octet-stream', 'Cache-Control': 'private, no-store' });
        res.end(buf);
      });
    }).catch(function () { sendJson(res, 404, { error: 'No slip' }); });
    return true;
  }
  if (id && !match[3] && req.method === 'PATCH') {
    readBody(req, 4096, function (err, body) {
      if (err) return sendJson(res, 400, { error: 'bad request' });
      withRecords(kind, function (list) {
        const r = list.filter(function (x) { return x.id === id; })[0];
        if (!r) return null;
        if (STATUSES[kind].indexOf(body.status) >= 0) r.status = body.status;
        if (typeof body.staffNote === 'string') r.staffNote = cleanText(body.staffNote, 500);
        r.updatedAt = new Date().toISOString();
        return r;
      }).then(function (r) { r ? sendJson(res, 200, r) : sendJson(res, 404, { error: 'Not found' }); })
        .catch(function () { sendJson(res, 500, { error: 'Could not save' }); });
    });
    return true;
  }
  if (id && !match[3] && req.method === 'DELETE') {
    let removed = null;
    withRecords(kind, function (list) {
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
  if (/^\/api\/(members|bookings)/.test(urlPath) && handleRecords(req, res, urlPath, clientIp)) return true;

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
  if (urlPath === '/book') urlPath = '/book.html';

  // Serve only what the website itself needs. Everything else — the server
  // source, package files, data/ and .git — stays private.
  const rel = urlPath.replace(/^\/+/, '');
  const PUBLIC_FILES = ['index.html', 'admin.html', 'members.html', 'book.html', 'salon-data.js', 'favicon.ico', 'robots.txt', 'sitemap.xml'];
  const isPublic = PUBLIC_FILES.includes(rel) || /^images\/[\w./-]+$/.test(rel);
  const safePath = path.normalize(path.join(ROOT, rel));
  if (!isPublic || !safePath.startsWith(ROOT) || safePath.startsWith(DATA_DIR) || rel.includes('..')) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('<h1>404 - Page Not Found</h1>');
    return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
