import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWeeklyKpiSnapshot } from './weeklyKpi.js';

test('weekly KPI follows the reference sheet target formula', () => {
  const result = calculateWeeklyKpiSnapshot({
    exam1stTargetCount: 50,
    exam1stExtensionCount: 20,
    exam2ndTargetCount: 50,
    exam2ndExtensionCount: 10,
  }, new Date('2026-10-11T14:55:00.000Z'), 82, 20);

  assert.equal(result.weekEndDate, '2026-10-11');
  assert.equal(result.weeklyTargetRate, 45.1);
  assert.equal(result.actualRate, 30);
  assert.equal(result.remainingCount, 52);
});
