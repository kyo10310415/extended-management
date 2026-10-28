import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthorizedKpiSnapshotRead } from './kpi-snapshot-read-auth.js';

const env = { KPI_SNAPSHOT_READ_TOKEN: 'read-token' };

test('read-only Bearer token authorizes monthly KPI snapshot reads', () => {
  assert.equal(isAuthorizedKpiSnapshotRead({ authorization: 'Bearer read-token' }, env), true);
  assert.equal(isAuthorizedKpiSnapshotRead({ authorization: 'Bearer wrong-token' }, env), false);
});

test('SSO-authenticated app user keeps the monthly detail available', () => {
  assert.equal(isAuthorizedKpiSnapshotRead({
    authenticatedUser: { id: 1, role: 'admin' },
  }, env), true);
});
