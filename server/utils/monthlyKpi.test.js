import test from 'node:test';
import assert from 'node:assert/strict';
import { getPreviousTokyoMonthContext } from './monthlyKpi.js';

function adjustedLocalYearMonth(now, offset) {
  const adjusted = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${adjusted.getFullYear()}-${String(adjusted.getMonth() + 1).padStart(2, '0')}`;
}

test('月次KPI対象月は東京時間の前月になる', () => {
  const now = new Date('2026-10-31T17:00:00.000Z'); // 2026-11-01 02:00 JST
  const context = getPreviousTokyoMonthContext(now);
  assert.equal(context.yearMonth, '2026-10');
  assert.equal(context.monthLabel, '2026年10月');
  assert.equal(adjustedLocalYearMonth(now, context.calculationMonthOffset), '2026-10');
});

test('1月の起動補完では前年12月を対象にする', () => {
  const now = new Date('2026-12-31T18:30:00.000Z'); // 2027-01-01 03:30 JST
  const context = getPreviousTokyoMonthContext(now);
  assert.equal(context.yearMonth, '2026-12');
  assert.equal(adjustedLocalYearMonth(now, context.calculationMonthOffset), '2026-12');
});
