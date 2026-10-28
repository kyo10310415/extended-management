import '../test-database-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseCacheService } from './databaseCacheService.js';

function fixture(failOn = null) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (failOn && sql.includes(failOn)) throw new Error('fixture failure');
      return { rows: [] };
    },
    release() { released = true; },
  };
  return { service: new DatabaseCacheService({ connect: async () => client }), calls, released: () => released };
}

test('successful cache and complete assignment snapshot commit in one transaction', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.cacheNotionStudents([{ studentId: 'fixture-1' }, { studentId: 'fixture-2' }, { studentId: 'fixture-1' }]), { success: true, count: 3 });
  assert.equal(f.calls[0].sql, 'BEGIN');
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
  const rows = f.calls.filter(call => call.sql.includes('INSERT INTO notion_students_cache'));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(call => call.params[0]), ['fixture-1', 'fixture-2', 'fixture-1']);
  const snapshot = f.calls.find(call => call.sql.includes('INSERT INTO notion_student_access_snapshot'));
  assert.deepEqual(JSON.parse(snapshot.params[0]), ['fixture-1', 'fixture-2']);
  assert.ok(f.calls.some(call => call.sql.includes('CREATE TABLE IF NOT EXISTS notion_student_access_snapshot')));
  assert.equal(f.released(), true);
});

test('zero students replaces snapshot with empty ids instead of retaining old authorization', async () => {
  const f = fixture();
  assert.deepEqual(await f.service.cacheNotionStudents([]), { success: true, count: 0 });
  assert.equal(f.calls.some(call => call.sql.includes('INSERT INTO notion_students_cache')), false);
  const snapshot = f.calls.find(call => call.sql.includes('INSERT INTO notion_student_access_snapshot'));
  assert.deepEqual(snapshot.params, ['[]']);
  assert.equal(f.calls.at(-1).sql, 'COMMIT');
});

for (const failurePoint of ['INSERT INTO notion_students_cache', 'CREATE TABLE IF NOT EXISTS notion_student_access_snapshot', 'INSERT INTO notion_student_access_snapshot']) {
  test(`failure at ${failurePoint} rolls back cache and snapshot together`, async () => {
    const f = fixture(failurePoint);
    await assert.rejects(f.service.cacheNotionStudents([{ studentId: 'fixture-1' }]), /fixture failure/);
    assert.equal(f.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(f.calls.some(call => call.sql === 'COMMIT'), false);
    assert.equal(f.released(), true);
  });
}
