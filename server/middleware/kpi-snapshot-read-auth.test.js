import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { isAuthorizedKpiSnapshotRead } from './kpi-snapshot-read-auth.js';

const env = { KPI_SNAPSHOT_READ_TOKEN: 'read-token', JWT_SECRET: 'jwt-secret' };

test('read-only Bearer token authorizes monthly KPI snapshot reads', () => {
  assert.equal(isAuthorizedKpiSnapshotRead({ authorization: 'Bearer read-token' }, env), true);
  assert.equal(isAuthorizedKpiSnapshotRead({ authorization: 'Bearer wrong-token' }, env), false);
});

test('valid SSO cookie keeps the in-app monthly detail available', () => {
  const ssoCookie = jwt.sign({ type: 'sso', username: 'tester' }, env.JWT_SECRET);
  assert.equal(isAuthorizedKpiSnapshotRead({ ssoCookie }, env), true);
});
