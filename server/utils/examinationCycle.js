export const ENTRY_PLAN_NAME = 'エントリープラン';
export const MAX_EXTENSION_CYCLE = 10;

/**
 * エントリープランの延長審査回数を返す。
 * 5ヶ月目を1回目とし、以降6ヶ月ごと（11, 17, ... 59ヶ月目）を対象にする。
 */
export function getEntryPlanExaminationCycle(adjustedMonths) {
  const months = Number(adjustedMonths);
  if (!Number.isInteger(months) || months < 5 || (months - 5) % 6 !== 0) {
    return null;
  }

  const cycle = ((months - 5) / 6) + 1;
  return cycle <= MAX_EXTENSION_CYCLE ? cycle : null;
}
