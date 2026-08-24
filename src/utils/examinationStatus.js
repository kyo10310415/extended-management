function parseLessonDateKey(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (month < 1 || month > 12 || day < 1 || day > lastDayOfMonth) return null;
  return year * 10000 + month * 100 + day;
}

function getTokyoDateKey(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return year * 10000 + month * 100 + day;
}

/**
 * 最初のレッスン日の翌日以降で、審査結果が未入力かを判定する。
 */
export function isExaminationOverdue({
  lessonDates,
  examinationResult,
  now = new Date(),
}) {
  if (String(examinationResult ?? '').trim()) return false;

  const lessonDateKeys = (lessonDates || [])
    .map(parseLessonDateKey)
    .filter(dateKey => dateKey !== null);
  if (lessonDateKeys.length === 0) return false;

  const firstLessonDateKey = Math.min(...lessonDateKeys);
  return getTokyoDateKey(now) > firstLessonDateKey;
}
