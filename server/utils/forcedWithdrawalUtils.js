export const FORCED_WITHDRAWAL_REASONS = Object.freeze([
  '音信不通',
  '生徒様希望で途中退会',
  'コンプライアンス違反',
]);

export function normalizeStudentId(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^OLST/, 'OLTS');
}

export function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * レッスン開始月を1か月目とし、強制退会月が何か月目かを返す。
 * 強制退会日がレッスン開始日より前の場合は null。
 */
export function calculateForcedWithdrawalMonth(lessonStartDate, forcedWithdrawalDate) {
  const lessonDate = String(lessonStartDate ?? '').slice(0, 10);
  const withdrawalDate = String(forcedWithdrawalDate ?? '').slice(0, 10);

  if (!isValidIsoDate(lessonDate) || !isValidIsoDate(withdrawalDate)) {
    return null;
  }

  if (withdrawalDate < lessonDate) {
    return null;
  }

  const [startYear, startMonth] = lessonDate.split('-').map(Number);
  const [withdrawalYear, withdrawalMonth] = withdrawalDate.split('-').map(Number);

  return ((withdrawalYear - startYear) * 12) + withdrawalMonth - startMonth + 1;
}
