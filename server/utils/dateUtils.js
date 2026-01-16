import { differenceInMonths, parseISO, addMonths } from 'date-fns';

/**
 * レッスン開始月から基準日までの経過月数を計算
 * @param {string} lessonStartDate - レッスン開始月 (例: "2024/04/01")
 * @param {number} monthOffset - 月オフセット (-1: 前月, 0: 今月, 1: 翌月)
 * @returns {number} - 経過月数
 */
export function calculateMonthsElapsed(lessonStartDate, monthOffset = 0) {
  if (!lessonStartDate) return 0;

  try {
    // "2024/04/01" 形式を "2024-04-01" に変換
    const formattedDate = lessonStartDate.replace(/\//g, '-');
    const startDate = parseISO(formattedDate);
    
    // 基準日を設定（今月 + オフセット）
    const referenceDate = addMonths(new Date(), monthOffset);

    const months = differenceInMonths(referenceDate, startDate);
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
