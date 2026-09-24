// Where the salon's content and uploaded photos live.
//
// Two backends, chosen automatically:
//   • Spaces  — when SPACES_BUCKET/KEY/SECRET/REGION are set (App Platform).
//   • Disk    — otherwise, for local development.
//
// App Platform wipes a container's filesystem on every deploy, so anything the
// staff area saves has to go to object storage instead of the local disk.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const UPLOAD_DIR = path.join(ROOT, 'images', 'uploads');

const SPACES = {
  bucket: process.env.SPACES_BUCKET,
  region: process.env.SPACES_REGION || 'sgp1',
  key: process.env.SPACES_KEY,
  secret: process.env.SPACES_SECRET,
  cdn: process.env.SPACES_CDN || ''          // optional custom/CDN hostname
};
const useSpaces = !!(SPACES.bucket && SPACES.key && SPACES.secret);
const CONTENT_KEY = 'content.json';
const CACHE_MS = 30 * 1000;

let cache = { body: null, at: 0 };

/* ---------------- Spaces (S3-compatible, signed with SigV4) ---------------- */

function host() { return SPACES.bucket + '.' + SPACES.region + '.digitaloceanspaces.com'; }
// Default to the Space's own hostname, which always works. SPACES_CDN can
// point at the CDN (or a custom domain) once that name resolves.
function publicUrl(key) {
  const base = SPACES.cdn
    ? SPACES.cdn.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : SPACES.bucket + '.' + SPACES.region + '.digitaloceanspaces.com';
  return 'https://' + base + '/' + key;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(key, value) { return crypto.createHmac('sha256', key).update(value).digest(); }

// AWS Signature V4 — Spaces speaks the same protocol as S3.
function signedRequest(method, key, body, contentType, extraHeaders) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body || '');
  const headers = Object.assign({
    'host': host(),
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  }, extraHeaders || {});
  if (contentType) headers['content-type'] = contentType;

  const signedHeaders = Object.keys(headers).map(function (h) { return h.toLowerCase(); }).sort();
  const canonicalHeaders = signedHeaders.map(function (h) { return h + ':' + String(headers[h]).trim() + '\n'; }).join('');
  const canonicalRequest = [
    method,
    '/' + key.split('/').map(encodeURIComponent).join('/'),
    '',
    canonicalHeaders,
    signedHeaders.join(';'),
    payloadHash
  ].join('\n');

  const scope = [dateStamp, SPACES.region, 's3', 'aws4_request'].join('/');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const signingKey = ['AWS4' + SPACES.secret, dateStamp, SPACES.region, 's3', 'aws4_request']
    .reduce(function (prev, part, i) { return i === 0 ? prev : hmac(prev, part); });
  const signature = crypto.createHmac('sha256', signingKey).update(toSign).digest('hex');

  headers['Authorization'] = 'AWS4-HMAC-SHA256 Credential=' + SPACES.key + '/' + scope +
    ', SignedHeaders=' + signedHeaders.join(';') + ', Signature=' + signature;
  return headers;
}

function spacesRequest(method, key, body, contentType, extraHeaders) {
  return new Promise(function (resolve, reject) {
    const headers = signedRequest(method, key, body, contentType, extraHeaders);
    if (body) headers['content-length'] = Buffer.byteLength(body);
    const req = https.request({
      method: method,
      host: host(),
      path: '/' + key.split('/').map(encodeURIComponent).join('/'),
      headers: headers
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        const buf = Buffer.concat(chunks);
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(buf);
        reject(new Error('Spaces ' + method + ' ' + key + ' failed: ' + res.statusCode + ' ' + buf.toString().slice(0, 200)));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ---------------- public interface ---------------- */

async function readContent() {
  if (!useSpaces) return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  if (cache.body && Date.now() - cache.at < CACHE_MS) return cache.body;
  try {
    const buf = await spacesRequest('GET', CONTENT_KEY);
    cache = { body: JSON.parse(buf.toString('utf8')), at: Date.now() };
  } catch (err) {
    // First boot: the bucket has no content yet, so seed it from the repo copy.
    if (!/: 404/.test(err.message)) throw err;
    const seed = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
    await writeContent(seed);
  }
  return cache.body;
}

async function writeContent(content) {
  const text = JSON.stringify(content, null, 2);
  if (!useSpaces) {
    const tmp = CONTENT_FILE + '.tmp';
    try { fs.copyFileSync(CONTENT_FILE, CONTENT_FILE + '.bak'); } catch (e) {}
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, CONTENT_FILE);
    return;
  }
  // keep one previous version, then publish the new one
  try {
    const current = await spacesRequest('GET', CONTENT_KEY);
    await spacesRequest('PUT', 'content-previous.json', current, 'application/json');
  } catch (e) { /* nothing to back up yet */ }
  await spacesRequest('PUT', CONTENT_KEY, Buffer.from(text), 'application/json', { 'x-amz-acl': 'private' });
  cache = { body: content, at: Date.now() };
}

async function putImage(fileName, buffer, contentType) {
  if (!useSpaces) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buffer);
    return 'images/uploads/' + fileName;
  }
  const key = 'uploads/' + fileName;
  await spacesRequest('PUT', key, buffer, contentType, {
    'x-amz-acl': 'public-read',
    'cache-control': 'public, max-age=31536000'
  });
  return publicUrl(key);
}

module.exports = { readContent, writeContent, putImage, useSpaces, CONTENT_FILE, DATA_DIR, UPLOAD_DIR };
