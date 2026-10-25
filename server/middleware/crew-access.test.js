import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { createSsoAuthMiddleware } from './sso-auth-middleware.js';
import { createCrewAccessMiddleware, createAssignedStudentsHandler } from './crew-access.js';

const secret = randomBytes(48).toString('hex');
const origin = 'https://extension.example.test';
const issuer = 'https://dashboard.example.test';
const body = { cycle: 1, extension_certainty: '高', hearing_status: true, notes: 'fixture', examination_result: '延長' };

async function fixture(t, { tutorName = 'Tutor A', role = 'crew', fail = false } = {}) {
  const calls = [];
  let legacyCalls = 0;
  let assigned = true;
  let snapshotValid = true;
  let submitted;
  const db = { async query(sql, params) {
    calls.push({ sql, params });
    if (fail) throw new Error('PRIVATE_FIXTURE');
    if (sql.startsWith('SELECT 1')) return { rows: snapshotValid ? [{}] : [] };
    if (sql.startsWith('SELECT s.student_id FROM')) {
      assert.match(sql, /a\.student_ids @> jsonb_build_array\(s\.student_id\)/);
      assert.match(sql, /INTERVAL '48 hours'/);
      return { rows: snapshotValid && assigned && params[0] === 'own-1' && params[1] === 'Tutor A' ? [{ student_id: 'own-1' }] : [] };
    }
    if (sql.startsWith('SELECT examination_result')) return { rows: [{ result: '在籍' }] };
    assert.match(sql, /AND s\.tutor = \$1/);
    return { rows: params[0] === 'Tutor A' ? [{ studentId: 'own-1', tutor: 'Tutor A', name: 'Fixture' }] : [] };
  } };
  const app = express();
  app.use(express.json(), cookieParser(), createSsoAuthMiddleware({ secret, appOrigin: origin, dashboardUrl: issuer, secure: true }));
  app.use(createCrewAccessMiddleware({ queryable: db }));
  app.get('/api/auth/me', (req, res) => res.json({ role: req.user.role, tutorConfigured: !!req.user.tutorName }));
  app.get('/api/crew/students', createAssignedStudentsHandler({ queryable: db }));
  app.use((req, res) => { legacyCalls++; submitted = req.body; res.json({ success: true, data: { student_id: 'own-1', notes: 'fixture', executive_check: 'PRIVATE_FIXTURE' } }); });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const token = jwt.sign({ userId: 1, username: 'Different username', role, tutorName, targetUrl: origin, type: 'sso' }, secret,
    { algorithm: 'HS256', issuer, audience: origin, expiresIn: '1h' });
  return { calls, expire: () => { snapshotValid = false; }, revoke: () => { assigned = false; }, submitted: () => submitted, count: () => legacyCalls, request: (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    redirect: 'manual', ...options, headers: { Cookie: `wannav_sso=${token}`, Origin: origin, 'X-WannaV-Request': '1', 'Content-Type': 'application/json', ...options.headers },
  }) };
}

test('crew list uses only signed mapping and a parameterized assigned-only query', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/crew/students?cycle=2&tutorName=Tutor%20B');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.map(s => s.studentId), ['own-1']);
  assert.deepEqual(f.calls[1].params, ['Tutor A']);
  assert.equal(f.count(), 0);
});

test('unmapped crew can see setup status but cannot reach student handlers', async t => {
  const f = await fixture(t, { tutorName: null });
  assert.equal((await f.request('/api/auth/me')).status, 200);
  assert.equal((await f.request('/api/crew/students')).status, 403);
  assert.equal((await f.request('/api/students/own-1')).status, 403);
  assert.equal(f.calls.length, 0);
});

test('other students, legacy lists, bulk requests and every administrative route fail before handlers', async t => {
  const f = await fixture(t);
  for (const [method, path] of [
    ['GET', '/api/students/other-2'], ['POST', '/api/students/other-2'],
    ['GET', '/api/notion/students'], ['POST', '/api/students/bulk'], ['POST', '/api/notion/update'],
    ['GET', '/api/notifications/debug-tutor-webhooks'], ['POST', '/api/kpi-snapshots/save'],
    ['GET', '/api/pro-plan/students'], ['POST', '/api/forced-withdrawals'], ['GET', '/API/crew/students'],
  ]) assert.equal((await f.request(path, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })).status, 403);
  assert.equal(f.count(), 0);
});

test('assigned responses omit executive and financial fields and ownership changes take effect next request', async t => {
  const f = await fixture(t);
  let response = await f.request('/api/students/own-1');
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(await response.json()).includes('PRIVATE_FIXTURE'), false);
  f.revoke();
  response = await f.request('/api/students/own-1');
  assert.equal(response.status, 403);
});

test('assigned update rejects privileged fields and injects a stored-result transition flag', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify({ ...body, executive_check: '確認済' }) })).status, 400);
  assert.equal((await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify({ ...body, examination_result_manually_changed: false }) })).status, 400);
  const response = await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.equal(f.count(), 1);
  assert.equal(f.submitted().examination_result_manually_changed, true);
  assert.ok(f.calls.some(call => call.sql.startsWith('SELECT examination_result_1')));
});

test('invalid cycles and input reject without interpolating SQL, lookup failures disclose no data', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/crew/students?cycle=1%20OR%201=1')).status, 400);
  assert.equal(f.calls.length, 0);
  const failed = await fixture(t, { fail: true });
  const response = await failed.request('/api/students/own-1');
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('PRIVATE_FIXTURE'), false);
});

test('leader retains existing routes and does not use a crew scope', async t => {
  const f = await fixture(t, { role: 'leader', tutorName: null });
  assert.equal((await f.request('/api/notion/update', { method: 'POST', body: '{}' })).status, 200);
  assert.equal(f.calls.length, 0);
});

test('expired snapshots block both assigned list and writes even if the cached tutor row remains', async t => {
  const f = await fixture(t);
  f.expire();
  assert.equal((await f.request('/api/crew/students')).status, 503);
  assert.equal((await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify(body) })).status, 403);
  assert.equal(f.count(), 0);
});
