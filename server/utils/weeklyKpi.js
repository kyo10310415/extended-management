const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export function getTokyoDateParts(now = new Date()) {
  const tokyo = new Date(now.getTime() + TOKYO_OFFSET_MS);
  return {
    year: tokyo.getUTCFullYear(),
    month: tokyo.getUTCMonth() + 1,
    day: tokyo.getUTCDate(),
    weekday: tokyo.getUTCDay(),
  };
}

export function calculateWeeklyKpiSnapshot(kpiData, now = new Date(), targetRate = 80, completionDay = 20) {
  const { year, month, day } = getTokyoDateParts(now);
  const targetCount = [1, 2, 3, 4, 5, 6].reduce((sum, cycle) => {
    const suffix = cycle === 1 ? '1st' : cycle === 2 ? '2nd' : cycle === 3 ? '3rd' : `${cycle}th`;
    return sum + (kpiData[`exam${suffix}TargetCount`] || 0);
  }, 0);
  const extensionCount = [1, 2, 3, 4, 5, 6].reduce((sum, cycle) => {
    const suffix = cycle === 1 ? '1st' : cycle === 2 ? '2nd' : cycle === 3 ? '3rd' : `${cycle}th`;
    return sum + (kpiData[`exam${suffix}ExtensionCount`] || 0);
  }, 0);
  const weeklyTargetRate = Math.min(targetRate, targetRate * day / completionDay);
  const actualRate = targetCount > 0 ? extensionCount / targetCount * 100 : 0;
  const monthlyTargetCount = Math.ceil(targetCount * targetRate / 100);

  return {
    weekEndDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    yearMonth: `${year}-${String(month).padStart(2, '0')}`,
    targetRate,
    weeklyTargetRate,
    achievementRate: weeklyTargetRate > 0 ? actualRate / weeklyTargetRate * 100 : 0,
    remainingCount: Math.max(0, monthlyTargetCount - extensionCount),
    actualRate,
    targetCount,
    extensionCount,
  };
}
