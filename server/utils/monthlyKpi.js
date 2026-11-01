const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
});

export function getPreviousTokyoMonthContext(now = new Date()) {
  const parts = Object.fromEntries(
    TOKYO_DATE_FORMATTER.formatToParts(now)
      .filter(part => part.type === 'year' || part.type === 'month')
      .map(part => [part.type, Number(part.value)])
  );
  const targetDate = new Date(Date.UTC(parts.year, parts.month - 2, 1));
  const targetYear = targetDate.getUTCFullYear();
  const targetMonthIndex = targetDate.getUTCMonth();
  const targetMonth = String(targetMonthIndex + 1).padStart(2, '0');
  const localMonthIndex = now.getFullYear() * 12 + now.getMonth();
  const targetAbsoluteMonth = targetYear * 12 + targetMonthIndex;

  return {
    yearMonth: `${targetYear}-${targetMonth}`,
    monthLabel: `${targetYear}年${targetMonth}月`,
    calculationMonthOffset: targetAbsoluteMonth - localMonthIndex,
  };
}
