import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createStudentWriteIntegrity } from './student-write-integrity.js';

async function fixture({ exists = true, failure = false } = {}) {
  const calls = [], writes = [];
  const app = express();
  app.use(express.json());
  const router = express.Router();
  router.param('studentId', createStudentWriteIntegrity({ queryable: { query: async (sql, params) => {
    calls.push({ sql, params });
    if (failure) throw new Error('synthetic private database failure');
    return { rows: exists ? [{ student_id: params[0] }] : [] };
  } } }));
  router.post('/bulk', (req, res) => res.json({ data: {} }));
  router.get('/:studentId', (req, res) => res.json({ data: null }));
  router.post('/:studentId', (req, res) => { writes.push(req.params.studentId); res.json({ success: true }); });
  router.post('/:studentId/hearing', (req, res) => { writes.push(req.params.studentId); res.json({ success: true }); });
  app.use('/api/students', router);
  const server = app.listen(0, '127.0.0.1');
  const address = await new Promise(resolve => server.on('listening', () => resolve(server.address())));
  return { calls, writes, request: (path, method = 'POST') => fetch(`http://127.0.0.1:${address.port}/api/students${path}`, { method }),
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

test('malformed IDs and reserved path words cannot reach a save handler', async () => {
  const f = await fixture();
  try {
    for (const path of ['/undefined', '/null', '/OLTS123-WRONG', '/olts260001-aa/hearing']) {
      assert.equal((await f.request(path)).status, 400);
    }
    assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});

test('well-formed unregistered IDs cannot create empty extension records', async () => {
  const f = await fixture({ exists: false });
  try {
    for (const path of ['/OLTS260001-AA', '/OLTS260001-AA/hearing']) assert.equal((await f.request(path)).status, 404);
    assert.equal(f.writes.length, 0);
    assert.ok(f.calls.every(c => c.params[0] === 'OLTS260001-AA'));
  } finally { await f.close(); }
});

test('registered student saves and bulk reads retain their routes', async () => {
  const f = await fixture();
  try {
    for (const path of ['/OLST240001-AA', '/OLST240001-AA/hearing']) assert.equal((await f.request(path)).status, 200);
    assert.equal((await f.request('/bulk')).status, 200);
    assert.equal((await f.request('/legacy-id', 'GET')).status, 200);
    assert.deepEqual(f.writes, ['OLST240001-AA', 'OLST240001-AA']);
    assert.equal(f.calls.length, 2);
  } finally { await f.close(); }
});

test('a missing registry fails closed without exposing the provider error', async () => {
  const f = await fixture({ failure: true });
  try {
    const response = await f.request('/OLTS260001-AA');
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes('synthetic private'), false);
    assert.equal(f.writes.length, 0);
  } finally { await f.close(); }
});
