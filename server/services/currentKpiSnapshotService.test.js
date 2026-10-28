import test from 'node:test';
import assert from 'node:assert/strict';
import { getTokyoYearMonth, refreshCurrentKpiSnapshot } from './currentKpiSnapshotService.js';

test('Tokyo month is used around the UTC month boundary', () => {
  assert.equal(getTokyoYearMonth(new Date('2026-10-31T15:30:00.000Z')), '2026-11');
});

test('current KPI snapshot separates tutor data and upserts provisional data', async () => {
  const calls = [];
  const result = await refreshCurrentKpiSnapshot({
    queryable: { query: async (...args) => { calls.push(args); } },
    calculateKPIData: async () => ({ overallExtensionRate: 75, exam4thTargetCount: 2, tutorKpi: [{ tutor: 'A' }] }),
    now: new Date('2026-10-28T06:30:00.000Z'),
  });

  assert.equal(result.yearMonth, '2026-10');
  assert.equal(result.snapshotData.overallExtensionRate, 75);
  assert.deepEqual(result.tutorKpi, [{ tutor: 'A' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1][0], '2026-10');
  assert.doesNotMatch(calls[0][1][2], /tutorKpi/);
});
