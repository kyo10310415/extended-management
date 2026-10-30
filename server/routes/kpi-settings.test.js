import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createKpiSettingsRouter } from './kpi-settings.js';

async function fixture(t, role = 'leader') {
  let targetRate = 80;
  const queryable = {
    query: async (sql, values) => {
      if (sql.startsWith('SELECT')) return { rows: [{ targetRate }] };
      targetRate = values[0];
      return { rows: [{ targetRate }] };
    },
  };
  const app = express();
  app.use(express.json(), (req, _res, next) => { req.user = { role }; next(); });
  app.use('/api/kpi-settings', createKpiSettingsRouter({ queryable }));
  const server = app.listen(0);
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/kpi-settings`;
  return (options) => fetch(baseUrl, options);
}

test('leader can read and persist a KPI target rate', async t => {
  const request = await fixture(t);
  assert.deepEqual(await (await request()).json(), { success: true, targetRate: 80 });
  const saved = await request({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRate: 82 }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { success: true, targetRate: 82 });
  assert.deepEqual(await (await request()).json(), { success: true, targetRate: 82 });
});

test('KPI setting rejects invalid values and crew writes', async t => {
  const leader = await fixture(t);
  const invalid = await leader({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRate: 101 }),
  });
  assert.equal(invalid.status, 400);

  const crew = await fixture(t, 'crew');
  const forbidden = await crew({
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRate: 82 }),
  });
  assert.equal(forbidden.status, 403);
});
