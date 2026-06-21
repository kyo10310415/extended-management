import express from 'express';
import { pool } from '../index.js';
import { fetchStudents } from '../services/notionService.js';
import { fetchSuspensionData } from '../services/sheetsService.js';
import { calculateMonthsElapsed } from '../utils/dateUtils.js';
import { 
  setupKPISpreadsheet, 
  appendMonthlyKPI, 
  formatKPIData 
} from '../services/kpiExportService.js';

const router = express.Router();

/**
 * POST /api/kpi-export/setup-sheet
 * 既存のスプレッドシートにKPI項目を初期化
 * Body: { spreadsheetId: string }
 */
router.post('/setup-sheet', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'spreadsheetId is required',
      });
    }
    
    console.log('📊 Setting up KPI spreadsheet...');
    
    const result = await setupKPISpreadsheet(spreadsheetId);
    
    res.json(result);
  } catch (error) {
    console.error('Error setting up KPI spreadsheet:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/kpi-export/append-monthly
 * 月次KPIデータをスプレッドシートに追加
 * Body: { spreadsheetId: string, monthOffset?: number }
 *   monthOffset: 0 = 今月（デフォルト）, -1 = 先月
 */
router.post('/append-monthly', async (req, res) => {
  try {
    const { spreadsheetId, monthOffset = 0 } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'spreadsheetId is required',
      });
    }

    console.log(`📊 Fetching KPI data (monthOffset: ${monthOffset})...`);
    
    // KPIデータを計算
    const kpiData = await calculateKPIData(monthOffset);
    
    console.log('📊 KPI Data calculated:', kpiData);
    
    // スプレッドシートに追加
    const result = await appendMonthlyKPI(spreadsheetId, kpiData, monthOffset);
    
    res.json({
      ...result,
      kpiData,
    });
  } catch (error) {
    console.error('Error appending monthly KPI:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/kpi-export/current-kpi
 * 現在のKPIデータを取得（確認用）
 * @query {number} monthOffset - 0: 今月（デフォルト）, -1: 先月
 */
router.get('/current-kpi', async (req, res) => {
  try {
    const monthOffset = parseInt(req.query.monthOffset) || 0;
    console.log(`📊 Fetching current KPI data (monthOffset: ${monthOffset})...`);
    
    const kpiData = await calculateKPIData(monthOffset);
    
    res.json({
      success: true,
      data: kpiData,
    });
  } catch (error) {
    console.error('Error fetching current KPI:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * KPIデータを計算する内部関数（外部からも利用可能）
 * @param {number} monthOffset - 0: 今月（デフォルト）, -1: 先月
 */
export async function calculateKPIData(monthOffset = 0) {
  // Notionから生徒データを取得
  const students = await fetchStudents();
  console.log(`✅ Fetched ${students.length} students from Notion`);

  // アクティブな生徒のみをフィルタ
  const activeStudents = students.filter(s => s.status === 'アクティブ');
  console.log(`✅ Active students: ${activeStudents.length}`);

  // ========================================
  // 延長審査対象の抽出（経過月数ベース）
  // ========================================
  
  // 休会データを取得
  const suspensionData = await fetchSuspensionData();

  // 各生徒の経過月数を計算（monthOffset適用・休会は考慮しない: 1・2回目用）
  const studentsWithMonths = activeStudents.map(student => {
    const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate, monthOffset);
    return {
      ...student,
      monthsElapsed,
    };
  });

  // 調整後月数付きの生徒リスト（3回目用: 休会期間を差し引く・monthOffset適用）
  const studentsWithAdjustedMonths = activeStudents.map(student => {
    const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate, monthOffset);
    const suspension = suspensionData[student.studentId];
    const suspensionMonths = suspension?.suspensionMonths || 0;
    const adjustedMonths = Math.max(0, monthsElapsed - suspensionMonths);
    return {
      ...student,
      monthsElapsed,
      adjustedMonths,
    };
  });

  // 延長審査対象を抽出
  const exam1stTargets = studentsWithMonths.filter(s => s.monthsElapsed === 5);
  const exam2ndTargets = studentsWithMonths.filter(s => s.monthsElapsed === 11);
  // 3回目: 調整後月数が17ヶ月
  const exam3rdTargets = studentsWithAdjustedMonths.filter(s => s.adjustedMonths === 17);

  console.log(`📊 延長審査1回目対象: ${exam1stTargets.length}人`);
  console.log(`📊 延長審査2回目対象: ${exam2ndTargets.length}人`);
  console.log(`📊 延長審査3回目対象: ${exam3rdTargets.length}人`);

  // ========================================
  // 延長審査結果を取得
  // ========================================

  // 1回目の延長結果・退会数
  const exam1stExtensions = await getExtensionResults(exam1stTargets.map(s => s.studentId), 1);
  const exam1stExtensionCount = exam1stExtensions.length;
  const exam1stWithdrawalCount = await getWithdrawalCount(exam1stTargets.map(s => s.studentId), 1);
  const exam1stExtensionRate = exam1stTargets.length > 0 
    ? (exam1stExtensionCount / exam1stTargets.length) * 100 
    : 0;

  console.log(`📊 延長審査1回目: 延長${exam1stExtensionCount} / 退会${exam1stWithdrawalCount} / 対象${exam1stTargets.length} = ${exam1stExtensionRate.toFixed(2)}%`);

  // 2回目の延長結果・退会数
  const exam2ndExtensions = await getExtensionResults(exam2ndTargets.map(s => s.studentId), 2);
  const exam2ndExtensionCount = exam2ndExtensions.length;
  const exam2ndWithdrawalCount = await getWithdrawalCount(exam2ndTargets.map(s => s.studentId), 2);
  const exam2ndExtensionRate = exam2ndTargets.length > 0 
    ? (exam2ndExtensionCount / exam2ndTargets.length) * 100 
    : 0;

  console.log(`📊 延長審査2回目: 延長${exam2ndExtensionCount} / 退会${exam2ndWithdrawalCount} / 対象${exam2ndTargets.length} = ${exam2ndExtensionRate.toFixed(2)}%`);

  // 3回目の延長結果（延長・永久会員数）
  const exam3rdExtensions = await getExtensionResults(exam3rdTargets.map(s => s.studentId), 3);
  const exam3rdExtensionCount = exam3rdExtensions.length;
  // 3回目の「退会」= 永久会員
  const exam3rdLifetimeCount = await getLifetimeMemberCount(exam3rdTargets.map(s => s.studentId));
  const exam3rdExtensionRate = exam3rdTargets.length > 0
    ? (exam3rdExtensionCount / exam3rdTargets.length) * 100
    : 0;

  console.log(`📊 延長審査3回目: 延長${exam3rdExtensionCount} / 永久会員${exam3rdLifetimeCount} / 対象${exam3rdTargets.length} = ${exam3rdExtensionRate.toFixed(2)}%`);

  // ========================================
  // Proプラン成約率を計算
  // ========================================
  
  // 永久会員の数を取得
  const lifetimeMembers = students.filter(s => s.plan === '永久会員');
  const lifetimeMemberCount = lifetimeMembers.length;
  
  console.log(`📊 永久会員: ${lifetimeMemberCount}人`);

  // Proプランステータスが「確定」の数を取得
  const proPlanQuery = `
    SELECT COUNT(*) as count
    FROM pro_plan_data
    WHERE pro_plan_status = '確定'
  `;
  const proPlanResult = await pool.query(proPlanQuery);
  const proPlanConfirmedCount = parseInt(proPlanResult.rows[0]?.count || 0);

  const proPlanSuccessRate = lifetimeMemberCount > 0 
    ? (proPlanConfirmedCount / lifetimeMemberCount) * 100 
    : 0;

  console.log(`📊 Proプラン成約率: ${proPlanConfirmedCount}/${lifetimeMemberCount} = ${proPlanSuccessRate.toFixed(2)}%`);

  // ========================================
  // 延長率（対 審査対象）を計算
  // ========================================
  
  // 全延長審査対象数と延長数（1・2・3回目の合計）
  const totalExamTargetCount = exam1stTargets.length + exam2ndTargets.length + exam3rdTargets.length;
  const totalExtensionCount = exam1stExtensionCount + exam2ndExtensionCount + exam3rdExtensionCount;
  
  const overallExtensionRate = totalExamTargetCount > 0 
    ? (totalExtensionCount / totalExamTargetCount) * 100 
    : 0;
  
  console.log(`📊 延長率（対 審査対象）: ${totalExtensionCount}/${totalExamTargetCount} = ${overallExtensionRate.toFixed(2)}%`);

  // ========================================
  // Tutor別集計
  // ========================================
  const tutorKpi = await calculateTutorKPI(
    exam1stTargets, exam2ndTargets, exam3rdTargets, monthOffset
  );

  // KPIデータを返す
  return {
    ...formatKPIData({
      exam1stTargetCount: exam1stTargets.length,
      exam1stExtensionCount,
      exam1stWithdrawalCount,
      exam1stExtensionRate,
      exam2ndTargetCount: exam2ndTargets.length,
      exam2ndExtensionCount,
      exam2ndWithdrawalCount,
      exam2ndExtensionRate,
      exam3rdTargetCount: exam3rdTargets.length,
      exam3rdExtensionCount,
      exam3rdLifetimeCount,
      exam3rdExtensionRate,
      proPlanSuccessRate,
      overallExtensionRate,
    }),
    tutorKpi,
  };
}

/**
 * Tutor別KPIを集計する内部関数
 */
async function calculateTutorKPI(exam1stTargets, exam2ndTargets, exam3rdTargets, monthOffset = 0) {
  // 全審査対象生徒を tutor でグループ化
  const allTargets = [
    ...exam1stTargets.map(s => ({ ...s, cycle: 1 })),
    ...exam2ndTargets.map(s => ({ ...s, cycle: 2 })),
    ...exam3rdTargets.map(s => ({ ...s, cycle: 3 })),
  ];

  // tutorごとに生徒IDを集める
  const tutorMap = {};
  for (const s of allTargets) {
    const tutor = s.tutor || '未設定';
    if (!tutorMap[tutor]) tutorMap[tutor] = { c1: [], c2: [], c3: [] };
    if (s.cycle === 1) tutorMap[tutor].c1.push(s.studentId);
    if (s.cycle === 2) tutorMap[tutor].c2.push(s.studentId);
    if (s.cycle === 3) tutorMap[tutor].c3.push(s.studentId);
  }

  const result = [];
  for (const [tutor, ids] of Object.entries(tutorMap)) {
    // 1回目
    const ext1 = (await getExtensionResults(ids.c1, 1)).length;
    const wd1  = await getWithdrawalCount(ids.c1, 1);
    const rate1 = ids.c1.length > 0 ? (ext1 / ids.c1.length * 100) : 0;
    // 2回目
    const ext2 = (await getExtensionResults(ids.c2, 2)).length;
    const wd2  = await getWithdrawalCount(ids.c2, 2);
    const rate2 = ids.c2.length > 0 ? (ext2 / ids.c2.length * 100) : 0;
    // 3回目
    const ext3 = (await getExtensionResults(ids.c3, 3)).length;
    const life3 = await getLifetimeMemberCount(ids.c3);
    const rate3 = ids.c3.length > 0 ? (ext3 / ids.c3.length * 100) : 0;
    // 全体
    const totalTarget = ids.c1.length + ids.c2.length + ids.c3.length;
    const totalExt    = ext1 + ext2 + ext3;
    const totalRate   = totalTarget > 0 ? (totalExt / totalTarget * 100) : 0;

    result.push({
      tutor,
      exam1stTargetCount: ids.c1.length,
      exam1stExtensionCount: ext1,
      exam1stWithdrawalCount: wd1,
      exam1stExtensionRate: Math.round(rate1 * 100) / 100,
      exam2ndTargetCount: ids.c2.length,
      exam2ndExtensionCount: ext2,
      exam2ndWithdrawalCount: wd2,
      exam2ndExtensionRate: Math.round(rate2 * 100) / 100,
      exam3rdTargetCount: ids.c3.length,
      exam3rdExtensionCount: ext3,
      exam3rdLifetimeCount: life3,
      exam3rdExtensionRate: Math.round(rate3 * 100) / 100,
      totalTargetCount: totalTarget,
      totalExtensionCount: totalExt,
      overallExtensionRate: Math.round(totalRate * 100) / 100,
    });
  }

  // 全体延長率の降順でソート
  result.sort((a, b) => b.overallExtensionRate - a.overallExtensionRate);
  return result;
}

/**
 * 延長結果を取得する内部関数
 * @param {string[]} studentIds - 学籍番号の配列
 * @param {number} cycle - サイクル番号（1, 2, or 3）
 * @returns {Promise<string[]>} 延長した学籍番号の配列
 */
async function getExtensionResults(studentIds, cycle) {
  if (studentIds.length === 0) {
    return [];
  }

  const query = `
    SELECT student_id
    FROM student_extensions
    WHERE student_id = ANY($1)
      AND examination_result_${cycle} = '延長'
  `;
  
  const result = await pool.query(query, [studentIds]);
  
  return result.rows.map(row => row.student_id);
}

/**
 * 退会数を取得する内部関数（1・2回目用: examination_result = '退会'）
 * @param {string[]} studentIds - 学籍番号の配列
 * @param {number} cycle - サイクル番号（1 or 2）
 * @returns {Promise<number>} 退会件数
 */
async function getWithdrawalCount(studentIds, cycle) {
  if (studentIds.length === 0) {
    return 0;
  }

  const query = `
    SELECT COUNT(*) as count
    FROM student_extensions
    WHERE student_id = ANY($1)
      AND examination_result_${cycle} = '退会'
  `;
  
  const result = await pool.query(query, [studentIds]);
  return parseInt(result.rows[0]?.count || 0);
}

/**
 * 3回目用: 永久会員数を取得する内部関数（examination_result_3 = '永久会員'）
 * @param {string[]} studentIds - 学籍番号の配列
 * @returns {Promise<number>} 永久会員件数
 */
async function getLifetimeMemberCount(studentIds) {
  if (studentIds.length === 0) {
    return 0;
  }

  const query = `
    SELECT COUNT(*) as count
    FROM student_extensions
    WHERE student_id = ANY($1)
      AND examination_result_3 = '永久会員'
  `;
  
  const result = await pool.query(query, [studentIds]);
  return parseInt(result.rows[0]?.count || 0);
}

export default router;
