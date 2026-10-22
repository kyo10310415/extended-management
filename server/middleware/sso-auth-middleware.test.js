import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createSsoAuthMiddleware, readSsoConfiguration } from './sso-auth-middleware.js';

const secret = randomBytes(48).toString('hex');
const appOrigin = 'https://extension.example.test';
const dashboardUrl = 'https://dashboard.example.test/';
const config = readSsoConfiguration({ JWT_SECRET: secret, APP_ORIGIN: appOrigin, DASHBOARD_URL: dashboardUrl, NODE_ENV: 'production' });
let server;
let baseUrl;
let protectedCalls = 0;

function token(claims = {}, options = {}) {
  return jwt.sign({ userId: 101, username: 'fixture-user', role: 'leader', targetUrl: appOrigin, type: 'sso', ...claims }, secret, { expiresIn: '1h', ...options });
}
function cookie(value = token()) { return { Cookie: `wannav_sso=${value}` }; }
function request(path, options = {}) { return fetch(baseUrl + path, { ...options, redirect: 'manual' }); }

before(async () => {
  const app = express();
  app.use(cookieParser());
  app.use(createSsoAuthMiddleware(config));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/assets/app.js', (_req, res) => res.send('fixture asset'));
  app.use((req, res) => {
    protectedCalls += 1;
    res.json({ user: req.user, fixture: true });
  });
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test('configuration fails closed without an explicit strong key and application origin', () => {
  assert.throws(() => readSsoConfiguration({}), /JWT_SECRET/);
  assert.throws(() => readSsoConfiguration({ JWT_SECRET: secret }), /APP_ORIGIN/);
  assert.throws(() => readSsoConfiguration({ JWT_SECRET: secret, APP_ORIGIN: appOrigin + '/path' }), /only the scheme/);
  assert.throws(() => readSsoConfiguration({ JWT_SECRET: secret, APP_ORIGIN: 'http://example.test', NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => readSsoConfiguration({ JWT_SECRET: secret, APP_ORIGIN: 'https://user:password@example.test' }), /credentials/);
});

test('anonymous health and bundled assets remain available, not business APIs', async () => {
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/assets/app.js')).status, 200);
  const calls = protectedCalls;
  for (const path of ['/api/students', '/API/students', '/api/forced-withdrawals', '/api/students/fixture.js', '/api/health?auth_token=invalid']) {
    const result = await request(path);
    assert.equal(result.status, path.startsWith('/api/health?') ? 200 : 401);
  }
  assert.equal(protectedCalls, calls);
  assert.equal((await request('/api/health', { method: 'POST' })).status, 401);
});

test('API authentication errors are JSON with no-store, not dashboard HTML redirects', async () => {
  const response = await request('/api/students');
  assert.equal(response.status, 401);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('location'), null);
  assert.deepEqual(Object.keys(await response.json()).sort(), ['error', 'loginUrl']);
});

test('valid leader and administrator cookies authenticate', async () => {
  for (const role of ['leader', 'admin']) {
    const response = await request('/api/students', { headers: cookie(token({ role })) });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user, { id: 101, username: 'fixture-user', role });
  }
});

test('crew and unknown roles cannot access all-student administration', async () => {
  for (const role of ['crew', 'unknown']) {
    assert.equal((await request('/api/students', { headers: cookie(token({ role })) })).status, 403);
  }
});

test('wrong key, expiry, algorithm, token type, audience target and missing identity are rejected', async () => {
  const invalid = [
    token({}, { expiresIn: -1 }),
    token({}, { algorithm: 'HS384' }),
    token({ type: 'login' }),
    token({ targetUrl: 'https://other.example.test/' }),
    token({ targetUrl: 'invalid' }),
    token({ userId: null }),
    token({ username: '' }),
    jwt.sign({ userId: 101, username: 'fixture-user', role: 'leader', targetUrl: appOrigin, type: 'sso' }, secret),
    jwt.sign({ userId: 101, username: 'fixture-user', role: 'leader', targetUrl: appOrigin, type: 'sso' }, randomBytes(48).toString('hex'), { expiresIn: '1h' })
  ];
  for (const value of invalid) assert.equal((await request('/api/students', { headers: cookie(value) })).status, 401);
});

test('API query tokens do not replace cookie authentication', async () => {
  assert.equal((await request(`/api/students?auth_token=${token()}`)).status, 401);
});

test('SSO landing validates the token, sets a limited secure cookie, and removes only auth_token', async () => {
  const response = await request(`/?tab=hearing&auth_token=${token()}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/?tab=hearing');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const setCookie = response.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(setCookie.includes(attribute));
  assert.equal((await request('/')).headers.get('location'), dashboardUrl);
});

test('mutating APIs require both trusted Origin and the browser custom request header', async () => {
  const beforeCalls = protectedCalls;
  const invalidHeaders = [
    cookie(),
    { ...cookie(), Origin: appOrigin },
    { ...cookie(), 'X-WannaV-Request': '1' },
    { ...cookie(), Origin: 'https://attacker.example.test', 'X-WannaV-Request': '1' },
    { ...cookie(), Origin: 'null', 'X-WannaV-Request': '1' }
  ];
  for (const headers of invalidHeaders) assert.equal((await request('/api/students/fixture', { method: 'POST', headers })).status, 403);
  assert.equal(protectedCalls, beforeCalls);
  const response = await request('/api/students/fixture', { method: 'POST', headers: { ...cookie(), Origin: appOrigin, 'X-WannaV-Request': '1' } });
  assert.equal(response.status, 200);
});
