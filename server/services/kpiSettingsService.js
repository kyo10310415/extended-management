const FALLBACK_TARGET_RATE = 80;

export function parseKpiTargetRate(value, fallback = null) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return fallback;
  }
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : fallback;
}

export function getDefaultKpiTargetRate(env = process.env) {
  return parseKpiTargetRate(env.KPI_TARGET_RATE, FALLBACK_TARGET_RATE);
}

export async function readKpiTargetRate(queryable, env = process.env) {
  const result = await queryable.query(
    'SELECT target_rate::float AS "targetRate" FROM kpi_settings WHERE singleton_id = TRUE'
  );
  return parseKpiTargetRate(result.rows[0]?.targetRate, getDefaultKpiTargetRate(env));
}

export async function writeKpiTargetRate(queryable, value) {
  const targetRate = parseKpiTargetRate(value);
  if (targetRate === null) throw new RangeError('targetRate must be between 0 and 100');

  const result = await queryable.query(
    `INSERT INTO kpi_settings (singleton_id, target_rate)
     VALUES (TRUE, $1)
     ON CONFLICT (singleton_id) DO UPDATE SET
       target_rate = EXCLUDED.target_rate,
       updated_at = CURRENT_TIMESTAMP
     RETURNING target_rate::float AS "targetRate"`,
    [targetRate]
  );
  return result.rows[0].targetRate;
}
