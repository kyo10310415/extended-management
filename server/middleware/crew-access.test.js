import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { createSsoAuthMiddleware } from './sso-auth-middleware.js';
import { createCrewAccessMiddleware, createCrewStudentsHandler } from './crew-access.js';

const secret = randomBytes(48).toString('hex');
const origin = 'https://extension.example.test';
const issuer = 'https://dashboard.example.test';
const body = { cycle: 1, extension_certainty: '高', hearing_status: true, notes: 'fixture' };

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
      return { rows: snapshotValid && assigned && ['own-1', 'other-2'].includes(params[0]) ? [{ student_id: 'own-1' }] : [] };
    }
    if (sql.startsWith('SELECT examination_result')) return { rows: [{ result: '在籍' }] };
    assert.doesNotMatch(sql, /s\.tutor =/);
    return { rows: [{ studentId: 'own-1', name: 'Fixture' }, { studentId: 'other-2', name: 'Other Fixture' }] };
  } };
  const app = express();
  app.use(express.json(), cookieParser(), createSsoAuthMiddleware({ secret, appOrigin: origin, dashboardUrl: issuer, secure: true }));
  app.use(createCrewAccessMiddleware({ queryable: db }));
  app.get('/api/auth/me', (req, res) => res.json({ role: req.user.role, tutorConfigured: !!req.user.tutorName }));
  app.get('/api/crew/students', createCrewStudentsHandler({ queryable: db }));
  app.use((req, res) => { legacyCalls++; submitted = req.body; res.json({ success: true, data: { student_id: 'own-1', notes: 'fixture', executive_check: 'PRIVATE_FIXTURE' } }); });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const token = jwt.sign({ userId: 1, username: 'Different username', role, tutorName, targetUrl: origin, type: 'sso' }, secret,
    { algorithm: 'HS256', issuer, audience: origin, expiresIn: '1h' });
  return { calls, expire: () => { snapshotValid = false; }, revoke: () => { assigned = false; }, submitted: () => submitted, count: () => legacyCalls, request: (path, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    redirect: 'manual', ...options, headers: { Cookie: `wannav_sso=${token}`, Origin: origin, 'X-WannaV-Request': '1', 'Content-Type': 'application/json', ...options.headers },
  }) };
}

test('crew list includes all current students without tutor configuration', async t => {
  const f = await fixture(t);
  const response = await f.request('/api/crew/students?cycle=2&tutorName=Tutor%20B');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.map(s => s.studentId), ['own-1', 'other-2']);
  assert.equal(f.calls[1].params, undefined);
  assert.equal(f.count(), 0);
});

test('unmapped crew can read all students and update hearing fields', async t => {
  const f = await fixture(t, { tutorName: null });
  assert.equal((await f.request('/api/auth/me')).status, 200);
  assert.equal((await f.request('/api/crew/students')).status, 200);
  assert.equal((await f.request('/api/students/own-1')).status, 200);
  assert.equal((await f.request('/api/students/other-2/hearing', { method: 'POST', body: JSON.stringify(body) })).status, 200);
});

test('unknown students, legacy lists, bulk requests and administrative routes fail before handlers', async t => {
  const f = await fixture(t);
  for (const [method, path] of [
    ['GET', '/api/students/unknown'], ['POST', '/api/students/other-2'],
    ['POST', '/api/notion/update'],
    ['GET', '/api/notifications/debug-tutor-webhooks'], ['POST', '/api/kpi-snapshots/save'],
    ['POST', '/api/forced-withdrawals'], ['GET', '/API/crew/students'],
  ]) assert.equal((await f.request(path, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })).status, 403);
  assert.equal(f.count(), 0);
});

test('shared UI can read examination state but removed students are denied', async t => {
  const f = await fixture(t);
  let response = await f.request('/api/students/own-1');
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(await response.json()).includes('PRIVATE_FIXTURE'), true);
  f.revoke();
  response = await f.request('/api/students/own-1');
  assert.equal(response.status, 403);
});

test('crew can update exactly three hearing fields but never examination or privileged state', async t => {
  const f = await fixture(t);
  for (const key of ['examination_result', 'examination_result_manually_changed', 'executive_check', 'send_discord_notification', 'student_id', 'revenue_extension_pending']) {
    assert.equal((await f.request('/api/students/own-1/hearing', { method: 'POST', body: JSON.stringify({ ...body, [key]: 'forged' }) })).status, 400);
  }
  assert.equal((await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify(body) })).status, 403);
  assert.equal(f.count(), 0);
  const response = await f.request('/api/students/other-2/hearing', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.deepEqual(f.submitted(), body);
  assert.equal(f.count(), 1);
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

test('shared UI read endpoints work for crew while debug, exports and all administrative writes remain closed', async t => {
  const f = await fixture(t, { tutorName: null });
  for (const path of ['/api/notion/students', '/api/notion/hearing', '/api/notion/examination',
    '/api/notion/entry-plan-examination', '/api/notion/pro-hearing', '/api/notion/pro-examination',
    '/api/notion/suspension-history', '/api/pro-plan/students', '/api/pro-plan/advanced-examination',
    '/api/kpi-export/current-kpi', '/api/kpi-snapshots', '/api/kpi-snapshots/list', '/api/kpi-snapshots/2026-10',
    '/api/kpi-snapshots/weekly/2026-10',
    '/api/kpi-settings', '/api/forced-withdrawals']) {
    assert.equal((await f.request(path)).status, 200, path);
  }
  for (const path of ['/api/notion/debug/tutors', '/api/notion/export-spreadsheet', '/api/pro-plan/external-db/test', '/api/pro-plan/debug-months']) {
    assert.equal((await f.request(path)).status, 403, path);
  }
  for (const path of ['/api/kpi-snapshots/weekly/not-a-month', '/api/kpi-snapshots/weekly/2026-1']) {
    assert.equal((await f.request(path)).status, 403, path);
  }
  for (const path of ['/api/notion/cache/clear', '/api/kpi-export/setup-sheet', '/api/kpi-export/append-monthly', '/api/kpi-snapshots/save', '/api/kpi-snapshots/import-csv', '/api/pro-plan/own-1']) {
    assert.equal((await f.request(path, { method: 'POST', body: '{}' })).status, 403, path);
  }
  assert.equal((await f.request('/api/kpi-settings', { method: 'PUT', body: '{"targetRate":82}' })).status, 403);
});

test('bulk POST reads validate IDs, fields and cycles without granting write routes', async t => {
  const f = await fixture(t);
  for (const path of ['/api/students/bulk', '/api/pro-plan/bulk']) {
    const data = { studentIds: ['own-1', 'other-2'], ...(path.includes('/students/') ? { cycle: 2 } : {}) };
    assert.equal((await f.request(path, { method: 'POST', body: JSON.stringify(data) })).status, 200);
    for (const value of [{ ...data, examination_result: '延長' }, { ...data, studentIds: ['bad/id'] }, { ...data, studentIds: [] }]) {
      assert.equal((await f.request(path, { method: 'POST', body: JSON.stringify(value) })).status, 400);
    }
  }
});

test('expired snapshots block both assigned list and writes even if the cached tutor row remains', async t => {
  const f = await fixture(t);
  f.expire();
  assert.equal((await f.request('/api/crew/students')).status, 503);
  assert.equal((await f.request('/api/students/own-1', { method: 'POST', body: JSON.stringify(body) })).status, 403);
  assert.equal(f.count(), 0);
});
