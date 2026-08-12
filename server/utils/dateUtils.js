import { differenceInMonths, parseISO, addMonths, startOfMonth } from 'date-fns';

/**
 * 基準月時点で有効な休会月数を計算する
 * 休会開始日が基準月より未来のレコードは計算対象外とする
 *
 * @param {Object|null} suspension - fetchSuspensionData() が返すオブジェクト
 *   { suspensionMonths, suspensionStartDate, hasSuspensionHistory, records: [{suspensionStartDate, suspensionMonths}] }
 * @param {number} monthOffset - 月オフセット (-6〜+1)
 * @returns {number} - 有効な休会月数の合計
 */
export function calculateEffectiveSuspensionMonths(suspension, monthOffset = 0) {
  if (!suspension) return 0;

  // 基準月の月初日（その月の1日）を取得
  const referenceMonthStart = startOfMonth(addMonths(new Date(), monthOffset));

  // records 配列がある場合はレコード単位で判定
  if (Array.isArray(suspension.records) && suspension.records.length > 0) {
    return suspension.records.reduce((total, record) => {
      if (!record.suspensionStartDate) {
        // 開始日不明のレコードは加算する（安全側に倒す）
        return total + (record.suspensionMonths || 0);
      }
      try {
        // "YYYY/MM/DD" または "YYYY-MM-DD" 両方に対応
        const formattedDate = record.suspensionStartDate.replace(/\//g, '-');
        const startDate = parseISO(formattedDate);
        // 休会開始日の月初 ≤ 基準月月初 であれば計算に含める
        if (startOfMonth(startDate) <= referenceMonthStart) {
          return total + (record.suspensionMonths || 0);
        }
        // 未来開始はスキップ
        return total;
      } catch {
        // パースエラーは加算する（安全側）
        return total + (record.suspensionMonths || 0);
      }
    }, 0);
  }

  // records がない古い形式のデータはそのまま返す
  return suspension.suspensionMonths || 0;
}


 * レッスン開始月を1ヶ月目としてカウント
 * 【例】レッスン開始月：2025/9/1、現在：2026/1/1 → 5ヶ月目
 * @param {string} lessonStartDate - レッスン開始月 (例: "2024/04/01")
 * @param {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 * @returns {number} - 経過月数（開始月を1ヶ月目としてカウント）
 */
export function calculateMonthsElapsed(lessonStartDate, monthOffset = 0) {
  if (!lessonStartDate) return 0;

  try {
    // "2024/04/01" 形式を "2024-04-01" に変換
    const formattedDate = lessonStartDate.replace(/\//g, '-');
    const startDate = parseISO(formattedDate);
    
    // 基準日を設定（今月 + オフセット）
    const referenceDate = addMonths(new Date(), monthOffset);

    // differenceInMonths は完全に経過した月数を返すため、+1 する
    // （開始月を1ヶ月目としてカウント）
    const months = differenceInMonths(referenceDate, startDate) + 1;
    return months;
  } catch (error) {
    console.error('Date parsing error:', error);
    return 0;
  }
}

/**
 * 生徒を月数でフィルタリング
 * @param {Array} students - 生徒リスト
 * @param {number} targetMonth - 対象月数 (例: 4)
 * @param {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 * @returns {Array} - フィルタリングされた生徒リスト
 */
export function filterStudentsByMonth(students, targetMonth, monthOffset = 0) {
  return students.filter(student => {
    const elapsed = calculateMonthsElapsed(student.lessonStartDate, monthOffset);
    return elapsed === targetMonth;
  });
}

/**
 * 生徒に経過月数を追加
 * @param {Array} students - 生徒リスト
 * @param {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 * @returns {Array} - 経過月数付き生徒リスト
 */
export function enrichStudentsWithMonths(students, monthOffset = 0) {
  return students.map(student => ({
    ...student,
    monthsElapsed: calculateMonthsElapsed(student.lessonStartDate, monthOffset),
  }));
}
