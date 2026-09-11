export const ENTRY_PLAN_NAME = 'エントリープラン';
export const MAX_EXTENSION_CYCLE = 10;
export const UPSELL_EXAMINATION_RESULT = 'アップセル';

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

/**
 * 審査結果に応じて売上予測シートへ追記する月額を返す。
 * エントリープラン以外の既存処理は「延長 = 22,000円」のまま維持する。
 */
export function getExaminationRevenueAmount(plan, examinationResult) {
  if (plan === ENTRY_PLAN_NAME) {
    if (examinationResult === '延長') return 5980;
    if (examinationResult === UPSELL_EXAMINATION_RESULT) return 22000;
    return null;
  }

  return examinationResult === '延長' ? 22000 : null;
}
