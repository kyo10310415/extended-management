/**
 * proPlanExternalService.js
 *
 * wannav-student-management DB（外部 PostgreSQL）から
 * students.pro_plan_start_date を取得するサービス。
 *
 * 外部 DB 接続文字列は環境変数 EXTERNAL_DB_URL に設定する。
 * （Render ダッシュボード → Environment → EXTERNAL_DB_URL）
 *
 * 外部 DB スキーマ（wannav-student-management）:
 *   students テーブル
 *     student_id       VARCHAR(50) UNIQUE NOT NULL   ← 学籍番号
 *     pro_plan_start_date  DATE                      ← PROプラン開始日（月初1日）
 */

import pkg from 'pg';
const { Pool } = pkg;

// 外部 DB 用 Pool（接続が必要な場合のみ作成）
let externalPool = null;

function getExternalPool() {
  if (!externalPool) {
    const connStr = process.env.EXTERNAL_DB_URL;
    if (!connStr) {
      throw new Error(
        'EXTERNAL_DB_URL environment variable is not set. ' +
        'Set it to: postgresql://wannav_student_management_user:...@.../wannav_student_management'
      );
    }
    externalPool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false }, // Render の外部 DB は SSL 必須
      max: 5,           // 外部 DB なので接続数を絞る
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    externalPool.on('error', (err) => {
      console.error('[ExternalDB] Unexpected pool error:', err.message);
    });
  }
  return externalPool;
}

// ─────────────────────────────────────────────
// 月数計算ユーティリティ
// ─────────────────────────────────────────────

/**
 * PROプラン継続月数を計算（1か月目起算）
 * @param {Date|string} proStartDate - PROプラン開始日（DATE 型）
 * @param {number} monthOffset - 月オフセット（-1:前月 / 0:今月 / 1:翌月）
 * @returns {number|null} 継続月数（null = 未設定）
 */
export function calculateProPlanMonths(proStartDate, monthOffset = 0) {
  if (!proStartDate) return null;

  const start = new Date(proStartDate);
  const now = new Date();

  // オフセット適用
  const ref = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const startNorm = new Date(start.getFullYear(), start.getMonth(), 1);

  const yearDiff = ref.getFullYear() - startNorm.getFullYear();
  const monthDiff = ref.getMonth() - startNorm.getMonth();
  const total = yearDiff * 12 + monthDiff + 1; // 1か月目起算

  return total > 0 ? total : null;
}

/**
 * N 回目のヒアリングが何か月目か
 * 4回目: 4か月目, 5回目: 10か月目, 6回目: 16か月目 ...
 * hearingMonth(N) = 4 + (N-4)*6
 */
export function hearingMonth(round) {
  return 4 + (round - 4) * 6;
}

/**
 * N 回目の審査が何か月目か
 * 4回目: 5か月目, 5回目: 11か月目, 6回目: 17か月目 ...
 * examMonth(N) = 5 + (N-4)*6
 */
export function examMonth(round) {
  return 5 + (round - 4) * 6;
}

/**
 * 継続月数から何回目のヒアリング/審査対象かを返す
 * @param {number} months - PROプラン継続月数
 * @returns {{ type: 'hearing'|'examination', round: number }|null}
 */
export function getRoundInfo(months) {
  if (!months || months < 4) return null;
  for (let r = 4; r <= 100; r++) {
    if (months === hearingMonth(r))  return { type: 'hearing',     round: r };
    if (months === examMonth(r))     return { type: 'examination', round: r };
  }
  return null;
}

// ─────────────────────────────────────────────
// 外部 DB アクセス関数
// ─────────────────────────────────────────────

/**
 * 学籍番号リストから pro_plan_start_date を一括取得
 * @param {string[]} studentIds - 学籍番号配列
 * @returns {Object} { [studentId]: { proStartDate: Date|null } }
 */
export async function fetchProStartDates(studentIds) {
  if (!studentIds || studentIds.length === 0) return {};

  try {
    const pool = getExternalPool();
    const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(', ');
    const result = await pool.query(
      `SELECT student_id, pro_plan_start_date
         FROM students
        WHERE student_id IN (${placeholders})`,
      studentIds
    );

    const map = {};
    result.rows.forEach(row => {
      map[row.student_id] = {
        proStartDate: row.pro_plan_start_date || null,
      };
    });

    console.log(`[ExternalDB] Fetched pro_plan_start_date for ${result.rows.length}/${studentIds.length} students`);
    return map;
  } catch (err) {
    console.error('[ExternalDB] fetchProStartDates error:', err.message);
    return {}; // エラー時は空オブジェクトで続行（graceful degradation）
  }
}

/**
 * 単一生徒の pro_plan_start_date を取得
 * @param {string} studentId - 学籍番号
 * @returns {{ proStartDate: Date|null }|null}
 */
export async function fetchProStartDate(studentId) {
  const map = await fetchProStartDates([studentId]);
  return map[studentId] || { proStartDate: null };
}

/**
 * PROプラン4回目以降のヒアリング対象生徒を Notion 生徒リストからフィルタして返す
 *
 * @param {Array} notionStudents - Notion から取得した全生徒配列
 *   各要素: { studentId, name, tutor, plan, status, lessonStartDate, notionUrl, ... }
 * @param {number} round - 対象回数（4以上）
 * @param {number} monthOffset - 月オフセット
 * @returns {Array} 対象生徒リスト（proStartDate, proPlanMonths 付き）
 */
export async function fetchAdvancedHearingStudents(notionStudents, round, monthOffset = 0) {
  const targetMonths = hearingMonth(round);

  // 全生徒の student_id で外部 DB から pro_plan_start_date を取得
  const allIds = notionStudents.map(s => s.studentId);
  const proStartMap = await fetchProStartDates(allIds);

  // 継続月数が targetMonths に一致する生徒をフィルタ
  const result = [];
  for (const student of notionStudents) {
    const { proStartDate } = proStartMap[student.studentId] || {};
    const proMonths = calculateProPlanMonths(proStartDate, monthOffset);
    if (proMonths === targetMonths) {
      result.push({
        ...student,
        proStartDate: proStartDate || null,
        proPlanMonths: proMonths,
        round,
      });
    }
  }

  console.log(`[ProPlan] Advanced Hearing round=${round} (${targetMonths}ヶ月目) monthOffset=${monthOffset}: ${result.length} students`);
  return result;
}

/**
 * PROプラン4回目以降の延長審査対象生徒を Notion 生徒リストからフィルタして返す
 *
 * @param {Array} notionStudents - Notion から取得した全生徒配列
 * @param {number} round - 対象回数（4以上）
 * @param {number} monthOffset - 月オフセット
 * @returns {Array} 対象生徒リスト（proStartDate, proPlanMonths 付き）
 */
export async function fetchAdvancedExaminationStudents(notionStudents, round, monthOffset = 0) {
  const targetMonths = examMonth(round);

  const allIds = notionStudents.map(s => s.studentId);
  const proStartMap = await fetchProStartDates(allIds);

  const result = [];
  for (const student of notionStudents) {
    const { proStartDate } = proStartMap[student.studentId] || {};
    const proMonths = calculateProPlanMonths(proStartDate, monthOffset);
    if (proMonths === targetMonths) {
      result.push({
        ...student,
        proStartDate: proStartDate || null,
        proPlanMonths: proMonths,
        round,
      });
    }
  }

  console.log(`[ProPlan] Advanced Examination round=${round} (${targetMonths}ヶ月目) monthOffset=${monthOffset}: ${result.length} students`);
  return result;
}

/**
 * 全生徒に proPlanMonths を付与して返す（生徒情報マスタ用）
 * @param {Array} notionStudents
 * @returns {Array} 各生徒に proStartDate と proPlanMonths を追加
 */
export async function enrichStudentsWithProPlanMonths(notionStudents) {
  const allIds = notionStudents.map(s => s.studentId);
  const proStartMap = await fetchProStartDates(allIds);

  return notionStudents.map(student => {
    const { proStartDate } = proStartMap[student.studentId] || {};
    return {
      ...student,
      proStartDate: proStartDate || null,
      proPlanMonths: calculateProPlanMonths(proStartDate, 0),
    };
  });
}
