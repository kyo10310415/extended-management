import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultKpiTargetRate,
  parseKpiTargetRate,
  readKpiTargetRate,
  writeKpiTargetRate,
} from './kpiSettingsService.js';

test('KPI target rates are limited to percentages', () => {
  assert.equal(parseKpiTargetRate(82), 82);
  assert.equal(parseKpiTargetRate('82.5'), 82.5);
  assert.equal(parseKpiTargetRate(null), null);
  assert.equal(parseKpiTargetRate(''), null);
  assert.equal(parseKpiTargetRate(-1), null);
  assert.equal(parseKpiTargetRate(101), null);
  assert.equal(getDefaultKpiTargetRate({ KPI_TARGET_RATE: 'invalid' }), 80);
});

test('stored KPI target rate is read before the environment default', async () => {
  const stored = await readKpiTargetRate({
    query: async () => ({ rows: [{ targetRate: '82' }] }),
  }, { KPI_TARGET_RATE: '80' });
  assert.equal(stored, 82);

  const fallback = await readKpiTargetRate({
    query: async () => ({ rows: [] }),
  }, { KPI_TARGET_RATE: '81' });
  assert.equal(fallback, 81);
});

test('saving KPI target rate validates and upserts the singleton setting', async () => {
  let captured;
  const queryable = {
    query: async (sql, values) => {
      captured = { sql, values };
      return { rows: [{ targetRate: values[0] }] };
    },
  };
  assert.equal(await writeKpiTargetRate(queryable, 82), 82);
  assert.deepEqual(captured.values, [82]);
  assert.match(captured.sql, /ON CONFLICT \(singleton_id\)/);
  await assert.rejects(() => writeKpiTargetRate(queryable, 120), RangeError);
});
