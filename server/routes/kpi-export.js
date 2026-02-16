import express from 'express';
import { pool } from '../index.js';
import { fetchStudents } from '../services/notionService.js';
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
 * Body: { spreadsheetId: string }
 */
router.post('/append-monthly', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        error: 'spreadsheetId is required',
      });
    }

    console.log('📊 Fetching KPI data...');
    
    // KPIデータを計算
    const kpiData = await calculateKPIData();
    
    console.log('📊 KPI Data calculated:', kpiData);
    
    // スプレッドシートに追加
    const result = await appendMonthlyKPI(spreadsheetId, kpiData);
    
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
 */
router.get('/current-kpi', async (req, res) => {
  try {
    console.log('📊 Fetching current KPI data...');
    
    const kpiData = await calculateKPIData();
    
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
 * KPIデータを計算する内部関数
 */
async function calculateKPIData() {
  // Notionから生徒データを取得
  const students = await fetchStudents();
  console.log(`✅ Fetched ${students.length} students from Notion`);

  // アクティブな生徒のみをフィルタ
  const activeStudents = students.filter(s => s.status === 'アクティブ');
  console.log(`✅ Active students: ${activeStudents.length}`);

  // ========================================
  // 延長審査対象の抽出（休会を考慮した経過月数）
  // ========================================
  
  // 休会データを取得
  const suspensionQuery = `
    SELECT 
      student_id,
      suspension_months
    FROM student_extensions
    WHERE suspension_months IS NOT NULL AND suspension_months > 0
  `;
  const suspensionResult = await pool.query(suspensionQuery);
  const suspensionMap = new Map(
    suspensionResult.rows.map(row => [row.student_id, row.suspension_months])
  );

  // 各生徒の調整後経過月数を計算
  const studentsWithAdjustedMonths = activeStudents.map(student => {
    const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
    const suspensionMonths = suspensionMap.get(student.studentId) || 0;
    const adjustedMonths = Math.max(0, monthsElapsed - suspensionMonths);
    
    return {
      ...student,
      monthsElapsed: adjustedMonths,
    };
  });

  // 延長審査対象を抽出
  const exam1stTargets = studentsWithAdjustedMonths.filter(s => s.monthsElapsed === 5);
  const exam2ndTargets = studentsWithAdjustedMonths.filter(s => s.monthsElapsed === 11);

  console.log(`📊 延長審査1回目対象: ${exam1stTargets.length}人`);
  console.log(`📊 延長審査2回目対象: ${exam2ndTargets.length}人`);

  // ========================================
  // 延長審査結果を取得
  // ========================================
  
  // 1回目の延長結果
  const exam1stExtensions = await getExtensionResults(exam1stTargets.map(s => s.studentId), 1);
  const exam1stExtensionCount = exam1stExtensions.length;
  const exam1stExtensionRate = exam1stTargets.length > 0 
    ? (exam1stExtensionCount / exam1stTargets.length) * 100 
    : 0;

  console.log(`📊 延長審査1回目: ${exam1stExtensionCount}/${exam1stTargets.length} = ${exam1stExtensionRate.toFixed(2)}%`);

  // 2回目の延長結果
  const exam2ndExtensions = await getExtensionResults(exam2ndTargets.map(s => s.studentId), 2);
  const exam2ndExtensionCount = exam2ndExtensions.length;
  const exam2ndExtensionRate = exam2ndTargets.length > 0 
    ? (exam2ndExtensionCount / exam2ndTargets.length) * 100 
    : 0;

  console.log(`📊 延長審査2回目: ${exam2ndExtensionCount}/${exam2ndTargets.length} = ${exam2ndExtensionRate.toFixed(2)}%`);

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

  // KPIデータを返す
  return formatKPIData({
    exam1stTargetCount: exam1stTargets.length,
    exam1stExtensionCount,
    exam1stExtensionRate,
    exam2ndTargetCount: exam2ndTargets.length,
    exam2ndExtensionCount,
    exam2ndExtensionRate,
    proPlanSuccessRate,
  });
}

/**
 * 延長結果を取得する内部関数
 * @param {string[]} studentIds - 学籍番号の配列
 * @param {number} cycle - サイクル番号（1 or 2）
 * @returns {Promise<string[]>} 延長した学籍番号の配列
 */
async function getExtensionResults(studentIds, cycle) {
  if (studentIds.length === 0) {
    return [];
  }

  const columnSuffix = cycle === 1 ? '_1' : '_2';
  
  const query = `
    SELECT student_id
    FROM student_extensions
    WHERE student_id = ANY($1)
      AND examination_result${columnSuffix} = '延長'
  `;
  
  const result = await pool.query(query, [studentIds]);
  
  return result.rows.map(row => row.student_id);
}

export default router;
