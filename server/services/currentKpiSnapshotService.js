export function getTokyoYearMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export async function refreshCurrentKpiSnapshot({ queryable, calculateKPIData, now = new Date() }) {
  const yearMonth = getTokyoYearMonth(now);
  const [year, month] = yearMonth.split('-');
  const kpiData = await calculateKPIData(0);
  const { tutorKpi, ...snapshotData } = kpiData;

  await queryable.query(
    `INSERT INTO kpi_current_snapshot (
       singleton_id, year_month, month_label, snapshot_data, tutor_data, calculated_at
     ) VALUES (TRUE, $1, $2, $3, $4, $5)
     ON CONFLICT (singleton_id) DO UPDATE SET
       year_month = EXCLUDED.year_month,
       month_label = EXCLUDED.month_label,
       snapshot_data = EXCLUDED.snapshot_data,
       tutor_data = EXCLUDED.tutor_data,
       calculated_at = EXCLUDED.calculated_at`,
    [yearMonth, `${year}年${month}月`, JSON.stringify(snapshotData), JSON.stringify(tutorKpi || []), now]
  );

  return { yearMonth, snapshotData, tutorKpi: tutorKpi || [], calculatedAt: now };
}
