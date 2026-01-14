import { differenceInMonths, parseISO } from 'date-fns';

/**
 * レッスン開始月から現在までの経過月数を計算
 * @param {string} lessonStartDate - レッスン開始月 (例: "2024/04/01")
 * @returns {number} - 経過月数
 */
export function calculateMonthsElapsed(lessonStartDate) {
  if (!lessonStartDate) return 0;

  try {
    // "2024/04/01" 形式を "2024-04-01" に変換
    const formattedDate = lessonStartDate.replace(/\//g, '-');
    const startDate = parseISO(formattedDate);
    const currentDate = new Date();

    const months = differenceInMonths(currentDate, startDate);
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
 * @returns {Array} - フィルタリングされた生徒リスト
 */
export function filterStudentsByMonth(students, targetMonth) {
  return students.filter(student => {
    const elapsed = calculateMonthsElapsed(student.lessonStartDate);
    return elapsed === targetMonth;
  });
}

/**
 * 生徒に経過月数を追加
 * @param {Array} students - 生徒リスト
 * @returns {Array} - 経過月数付き生徒リスト
 */
export function enrichStudentsWithMonths(students) {
  return students.map(student => ({
    ...student,
    monthsElapsed: calculateMonthsElapsed(student.lessonStartDate),
  }));
}
