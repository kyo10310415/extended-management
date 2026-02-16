import cron from 'node-cron';
import { fetchStudentsFromNotion } from './notionService.js';
import { fetchFormUpdates, fetchSuspensionData } from './sheetsService.js';
import { sendSuspensionEndNotification } from './slackService.js';
import { sendMonthlyStudentListToTutors, sendIncompleteStudentListToTutors } from './discordService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth } from '../utils/dateUtils.js';
import cacheService from './cacheService.js';
import { appendMonthlyKPI, formatKPIData } from './kpiExportService.js';
import { pool } from '../index.js';
import { fetchStudents } from './notionService.js';
import { calculateMonthsElapsed } from '../utils/dateUtils.js';

/**
 * バックグラウンドでデータを取得してキャッシュに保存
 */
async function preloadData() {
  console.log('🔄 Starting background data preload...');
  
  try {
    const startTime = Date.now();

    // Notionから生徒データを取得してデータベースに保存
    console.log('📊 Fetching students from Notion and saving to database...');
    const students = await fetchStudentsFromNotion();
    console.log(`✅ Fetched ${students.length} students and saved to database`);

    // Google Sheetsからフォーム更新日を取得
    console.log('📊 Fetching form updates from Google Sheets...');
    const formUpdates = await fetchFormUpdates();
    console.log(`✅ Fetched form updates for ${Object.keys(formUpdates).length} students`);

    // Google Sheetsから休会情報を取得
    console.log('📊 Fetching suspension data from Google Sheets...');
    const suspensionData = await fetchSuspensionData();
    console.log(`✅ Fetched suspension data for ${Object.keys(suspensionData).length} students`);

    // キャッシュに保存
    cacheService.set('sheets_form_updates', formUpdates);
    cacheService.set('sheets_suspension_data', suspensionData);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`✅ Background data preload completed in ${duration}s`);
    console.log(`💾 Cache status: ${JSON.stringify(cacheService.stats())}`);

    return {
      success: true,
      studentsCount: students.length,
      formUpdatesCount: Object.keys(formUpdates).length,
      suspensionDataCount: Object.keys(suspensionData).length,
      duration: `${duration}s`,
    };
  } catch (error) {
    console.error('❌ Background data preload failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * サーバー起動時にデータをプリロード
 * キャッシュがある場合は即座に返し、バックグラウンドで更新
 */
export async function initializeDataPreload() {
  console.log('🚀 Initializing data preload on server startup...');
  
  try {
    // まずキャッシュの状態を確認
    const lastUpdate = await databaseCacheService.getCacheLastUpdate();
    
    if (lastUpdate) {
      const cacheAge = Date.now() - new Date(lastUpdate).getTime();
      const fortyEightHours = 48 * 60 * 60 * 1000; // 48時間
      const ageHours = Math.floor(cacheAge / 1000 / 60 / 60);
      
      if (cacheAge < fortyEightHours) {
        // キャッシュが新しい場合、バックグラウンドで更新（非ブロッキング）
        console.log(`✅ Recent cache found (${ageHours}時間前), server ready immediately`);
        console.log(`🔄 Scheduling background data refresh...`);
        
        // バックグラウンドで更新（awaitしない）
        preloadData().catch(error => {
          console.error('❌ Background preload error:', error);
        });
        
        return; // 即座に返す
      } else {
        // キャッシュが古い場合、同期的に更新
        console.log(`⏰ Cache expired (${ageHours}時間前), fetching fresh data...`);
        await preloadData();
      }
    } else {
      // キャッシュがない場合、同期的に初回ロード
      console.log(`📭 No cache found, performing initial data load...`);
      await preloadData();
    }
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    // エラーでもサーバーは起動する
  }
}

/**
 * 定期的なデータ更新スケジュールを設定
 * デフォルト: 毎日 AM 2:00 (JST)
 */
export function scheduleDailyUpdate() {
  // Renderはデフォルトでタイムゾーンが UTC なので、
  // JST AM 2:00 = UTC 17:00 (前日)
  // Cron形式: 分 時 日 月 曜日
  const cronExpression = '0 17 * * *'; // UTC 17:00 = JST AM 2:00

  console.log('⏰ Scheduling daily data update at 2:00 AM JST (17:00 UTC)');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Scheduled update triggered at 2:00 AM JST');
    await preloadData();
  }, {
    timezone: 'UTC'
  });

  // タスク開始
  task.start();

  console.log('✅ Daily update scheduler started');

  return task;
}

/**
 * 休会終了通知スケジュール（毎月15日）
 */
export function scheduleSuspensionEndNotifications() {
  // 毎月15日 AM 9:00 JST (UTC 0:00 on 15th)
  const cronExpression = '0 0 15 * *'; // 毎月15日 00:00 UTC = 15日 09:00 JST

  console.log('⏰ Scheduling suspension end notifications on 15th of each month at 9:00 AM JST');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Suspension end notification triggered on 15th of the month');
    await sendSuspensionEndNotificationsTask();
  }, {
    timezone: 'UTC'
  });

  task.start();
  console.log('✅ Suspension end notification scheduler started');

  return task;
}

/**
 * 月次生徒リスト通知スケジュール（毎月1日）
 */
export function scheduleMonthlyStudentListNotifications() {
  // 毎月1日 PM 5:00 JST (UTC 8:00 on 1st)
  const cronExpression = '0 8 1 * *'; // 毎月1日 08:00 UTC = 1日 17:00 JST

  console.log('⏰ Scheduling monthly student list notifications on 1st of each month at 5:00 PM JST');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Monthly student list notification triggered on 1st of the month at 5:00 PM JST');
    await sendMonthlyStudentListTask();
  }, {
    timezone: 'UTC'
  });

  task.start();
  console.log('✅ Monthly student list notification scheduler started');

  return task;
}

/**
 * 未完了リスト通知スケジュール（毎月20日）
 */
export function scheduleIncompleteListNotifications() {
  // 毎月20日 PM 5:00 JST (UTC 8:00 on 20th)
  const cronExpression = '0 8 20 * *'; // 毎月20日 08:00 UTC = 20日 17:00 JST

  console.log('⏰ Scheduling incomplete list notifications on 20th of each month at 5:00 PM JST');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Incomplete list notification triggered on 20th of the month at 5:00 PM JST');
    await sendIncompleteListTask();
  }, {
    timezone: 'UTC'
  });

  task.start();
  console.log('✅ Incomplete list notification scheduler started');

  return task;
}

/**
 * 休会終了通知タスク
 */
async function sendSuspensionEndNotificationsTask() {
  try {
    const suspensionData = await fetchSuspensionData();
    const students = await fetchStudentsFromNotion();
    
    // 今月終了する休会生徒を抽出
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const suspensionEndingStudents = [];
    
    for (const student of students) {
      const suspension = suspensionData[student.studentId];
      if (!suspension || !suspension.suspensionStartDate) continue;
      
      // 休会終了日を計算: (休会開始日 + 休会期間) の前日
      // 例: 2025/11/01 + 3ヶ月 = 2026/02/01 → 前日 = 2026/01/31
      const startDate = new Date(suspension.suspensionStartDate);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + suspension.suspensionMonths);
      // 1日前にする
      endDate.setDate(endDate.getDate() - 1);
      
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth() + 1;
      
      // 今月終了する場合
      if (endYear === currentYear && endMonth === currentMonth) {
        suspensionEndingStudents.push({
          ...student,
          suspensionStartDate: suspension.suspensionStartDate,
          suspensionMonths: suspension.suspensionMonths,
          suspensionEndDate: endDate.toISOString().split('T')[0], // YYYY-MM-DD
        });
      }
    }
    
    console.log(`📊 Found ${suspensionEndingStudents.length} students with suspension ending this month`);
    
    if (suspensionEndingStudents.length > 0) {
      await sendSuspensionEndNotification(suspensionEndingStudents);
    }
    
    return { success: true, count: suspensionEndingStudents.length };
  } catch (error) {
    console.error('❌ Error in suspension end notification task:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 月次生徒リスト通知タスク
 */
async function sendMonthlyStudentListTask() {
  try {
    const students = await fetchStudentsFromNotion();
    const enrichedStudents = enrichStudentsWithMonths(students);
    
    // 今月のヒアリング対象（4ヶ月目・10ヶ月目）
    const hearingStudents = [
      ...filterStudentsByMonth(enrichedStudents, 4, 0),
      ...filterStudentsByMonth(enrichedStudents, 10, 0),
    ].filter(s => s.status === 'アクティブ');
    
    // 今月の延長審査対象（5ヶ月目・11ヶ月目）
    const examinationStudents = [
      ...filterStudentsByMonth(enrichedStudents, 5, 0),
      ...filterStudentsByMonth(enrichedStudents, 11, 0),
    ].filter(s => s.status === 'アクティブ');
    
    console.log(`📊 Sending monthly list: ${hearingStudents.length} hearing, ${examinationStudents.length} examination`);
    
    await sendMonthlyStudentListToTutors(hearingStudents, examinationStudents);
    
    return {
      success: true,
      hearingCount: hearingStudents.length,
      examinationCount: examinationStudents.length,
    };
  } catch (error) {
    console.error('❌ Error in monthly student list task:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 未完了リスト通知タスク
 */
async function sendIncompleteListTask() {
  try {
    const students = await fetchStudentsFromNotion();
    const enrichedStudents = enrichStudentsWithMonths(students);
    
    // 今月のヒアリング対象（4ヶ月目・10ヶ月目）を取得
    const month4Students = filterStudentsByMonth(enrichedStudents, 4, 0)
      .filter(s => s.status === 'アクティブ');
    const month10Students = filterStudentsByMonth(enrichedStudents, 10, 0)
      .filter(s => s.status === 'アクティブ');
    
    // 今月の延長審査対象（5ヶ月目・11ヶ月目）を取得
    const month5Students = filterStudentsByMonth(enrichedStudents, 5, 0)
      .filter(s => s.status === 'アクティブ');
    const month11Students = filterStudentsByMonth(enrichedStudents, 11, 0)
      .filter(s => s.status === 'アクティブ');
    
    // データベースから延長管理データを取得
    const { pool } = await import('../index.js');
    
    // すべての対象生徒の学籍番号を集める
    const allStudentIds = [
      ...month4Students.map(s => s.studentId),
      ...month10Students.map(s => s.studentId),
      ...month5Students.map(s => s.studentId),
      ...month11Students.map(s => s.studentId),
    ];
    
    console.log(`📊 Fetching extension data for ${allStudentIds.length} students`);
    
    let extensionDataMap = {};
    if (allStudentIds.length > 0) {
      const placeholders = allStudentIds.map((_, i) => `$${i + 1}`).join(',');
      const result = await pool.query(
        `SELECT * FROM student_extensions WHERE student_id IN (${placeholders})`,
        allStudentIds
      );
      
      result.rows.forEach(row => {
        extensionDataMap[row.student_id] = row;
      });
      
      console.log(`📊 Found extension data for ${result.rows.length} students`);
    }
    
    // ヒアリング未完了の生徒を抽出
    // 4ヶ月目（サイクル1）: hearing_status_1 が null or '×'
    // 10ヶ月目（サイクル2）: hearing_status_2 が null or '×'
    const incompleteHearingStudents = [];
    
    month4Students.forEach(student => {
      const extensionData = extensionDataMap[student.studentId];
      const hearingStatus = extensionData?.hearing_status_1;
      
      // ヒアリング状況が未入力（null）または ×
      if (!hearingStatus || hearingStatus === '×' || hearingStatus === 'x') {
        incompleteHearingStudents.push({
          ...student,
          cycle: 1,
          extensionData,
        });
      }
    });
    
    month10Students.forEach(student => {
      const extensionData = extensionDataMap[student.studentId];
      const hearingStatus = extensionData?.hearing_status_2;
      
      // ヒアリング状況が未入力（null）または ×
      if (!hearingStatus || hearingStatus === '×' || hearingStatus === 'x') {
        incompleteHearingStudents.push({
          ...student,
          cycle: 2,
          extensionData,
        });
      }
    });
    
    // 審査結果未入力の生徒を抽出
    // 5ヶ月目（サイクル1）: examination_result_1 が null or 空
    // 11ヶ月目（サイクル2）: examination_result_2 が null or 空
    const incompleteExaminationStudents = [];
    
    month5Students.forEach(student => {
      const extensionData = extensionDataMap[student.studentId];
      const examinationResult = extensionData?.examination_result_1;
      
      // 審査結果が未入力（null or 空文字）
      if (!examinationResult || examinationResult.trim() === '') {
        incompleteExaminationStudents.push({
          ...student,
          cycle: 1,
          extensionData,
        });
      }
    });
    
    month11Students.forEach(student => {
      const extensionData = extensionDataMap[student.studentId];
      const examinationResult = extensionData?.examination_result_2;
      
      // 審査結果が未入力（null or 空文字）
      if (!examinationResult || examinationResult.trim() === '') {
        incompleteExaminationStudents.push({
          ...student,
          cycle: 2,
          extensionData,
        });
      }
    });
    
    console.log(`📊 Sending incomplete list: ${incompleteHearingStudents.length} hearing, ${incompleteExaminationStudents.length} examination`);
    
    await sendIncompleteStudentListToTutors(incompleteHearingStudents, incompleteExaminationStudents);
    
    return {
      success: true,
      incompleteHearingCount: incompleteHearingStudents.length,
      incompleteExaminationCount: incompleteExaminationStudents.length,
    };
  } catch (error) {
    console.error('❌ Error in incomplete list task:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 手動でデータを更新（API経由で呼び出し可能）
 */
export async function manualUpdate() {
  // キャッシュをクリアしてから再取得
  cacheService.clear();
  return await preloadData();
}

/**
 * 手動で休会終了通知を送信（テスト用）
 */
export async function manualSendSuspensionEndNotifications() {
  return await sendSuspensionEndNotificationsTask();
}

/**
 * 手動で月次生徒リストを送信（テスト用）
 */
export async function manualSendMonthlyStudentList() {
  return await sendMonthlyStudentListTask();
}

/**
 * 手動で未完了リストを送信（テスト用）
 */
export async function manualSendIncompleteList() {
  return await sendIncompleteListTask();
}

/**
 * 休会終了予定生徒を取得（プレビュー用・Slack送信なし）
 */
export async function getSuspensionEndingStudents() {
  try {
    const suspensionData = await fetchSuspensionData();
    const students = await fetchStudentsFromNotion();
    
    // 今月終了する休会生徒を抽出
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    const suspensionEndingStudents = [];
    
    for (const student of students) {
      const suspension = suspensionData[student.studentId];
      if (!suspension || !suspension.suspensionStartDate) continue;
      
      // 休会終了日を計算: (休会開始日 + 休会期間) の前日
      // 例: 2025/11/01 + 3ヶ月 = 2026/02/01 → 前日 = 2026/01/31
      const startDate = new Date(suspension.suspensionStartDate);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + suspension.suspensionMonths);
      // 1日前にする
      endDate.setDate(endDate.getDate() - 1);
      
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth() + 1;
      
      // 今月終了する場合
      if (endYear === currentYear && endMonth === currentMonth) {
        suspensionEndingStudents.push({
          ...student,
          suspensionStartDate: suspension.suspensionStartDate,
          suspensionMonths: suspension.suspensionMonths,
          suspensionEndDate: endDate.toISOString().split('T')[0], // YYYY-MM-DD
        });
      }
    }
    
    return suspensionEndingStudents;
  } catch (error) {
    console.error('❌ Error getting suspension ending students:', error);
    throw error;
  }
}

/**
 * 月末KPIエクスポートスケジュール（毎月末日）
 */
export function scheduleMonthlyKPIExport() {
  // 毎月末日 PM 11:00 JST (UTC 14:00)
  // Cron形式で月末日を指定: L は last day of month（node-cronでは使えないため別実装）
  // 毎日チェックして月末日なら実行
  const cronExpression = '0 14 * * *'; // 毎日 14:00 UTC = 23:00 JST

  console.log('⏰ Scheduling monthly KPI export check at 11:00 PM JST every day');

  const task = cron.schedule(cronExpression, async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 明日が翌月の1日かチェック（つまり今日が月末日）
    if (tomorrow.getDate() === 1) {
      console.log('⏰ Monthly KPI export triggered on last day of the month at 11:00 PM JST');
      await exportMonthlyKPITask();
    }
  }, {
    timezone: 'UTC'
  });

  task.start();
  console.log('✅ Monthly KPI export scheduler started');

  return task;
}

/**
 * 月末KPIエクスポートタスク
 */
async function exportMonthlyKPITask() {
  try {
    console.log('📊 Starting monthly KPI export task...');
    
    // 環境変数からスプレッドシートIDを取得
    const spreadsheetId = process.env.KPI_SPREADSHEET_ID;
    
    if (!spreadsheetId) {
      console.warn('⚠️ KPI_SPREADSHEET_ID not configured, skipping monthly export');
      console.warn('   Set KPI_SPREADSHEET_ID environment variable to enable automatic monthly export');
      return;
    }
    
    // KPIデータを計算
    const kpiData = await calculateKPIDataForExport();
    
    // スプレッドシートに追加
    const result = await appendMonthlyKPI(spreadsheetId, kpiData);
    
    console.log(`✅ Monthly KPI export completed: ${result.month} added to column ${result.column}`);
    console.log(`   URL: ${result.url}`);
    
    return result;
  } catch (error) {
    console.error('❌ Monthly KPI export task failed:', error);
    throw error;
  }
}

/**
 * KPIデータを計算する内部関数（エクスポート用）
 */
async function calculateKPIDataForExport() {
  // Notionから生徒データを取得
  const students = await fetchStudents();
  console.log(`✅ Fetched ${students.length} students from Notion`);

  // アクティブな生徒のみをフィルタ
  const activeStudents = students.filter(s => s.status === 'アクティブ');
  console.log(`✅ Active students: ${activeStudents.length}`);

  // 各生徒の経過月数を計算（休会は考慮しない）
  const studentsWithMonths = activeStudents.map(student => {
    const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
    
    return {
      ...student,
      monthsElapsed,
    };
  });

  // 延長審査対象を抽出
  const exam1stTargets = studentsWithMonths.filter(s => s.monthsElapsed === 5);
  const exam2ndTargets = studentsWithMonths.filter(s => s.monthsElapsed === 11);

  console.log(`📊 延長審査1回目対象: ${exam1stTargets.length}人`);
  console.log(`📊 延長審査2回目対象: ${exam2ndTargets.length}人`);

  // 延長審査結果を取得
  const exam1stExtensions = await getExtensionResultsForExport(exam1stTargets.map(s => s.studentId), 1);
  const exam1stExtensionCount = exam1stExtensions.length;
  const exam1stExtensionRate = exam1stTargets.length > 0 
    ? (exam1stExtensionCount / exam1stTargets.length) * 100 
    : 0;

  const exam2ndExtensions = await getExtensionResultsForExport(exam2ndTargets.map(s => s.studentId), 2);
  const exam2ndExtensionCount = exam2ndExtensions.length;
  const exam2ndExtensionRate = exam2ndTargets.length > 0 
    ? (exam2ndExtensionCount / exam2ndTargets.length) * 100 
    : 0;

  // 永久会員の数を取得
  const lifetimeMembers = students.filter(s => s.plan === '永久会員');
  const lifetimeMemberCount = lifetimeMembers.length;
  
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
 */
async function getExtensionResultsForExport(studentIds, cycle) {
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

export default {
  initializeDataPreload,
  scheduleDailyUpdate,
  scheduleSuspensionEndNotifications,
  scheduleMonthlyStudentListNotifications,
  scheduleIncompleteListNotifications,
  scheduleMonthlyKPIExport,
  manualUpdate,
  manualSendSuspensionEndNotifications,
  manualSendMonthlyStudentList,
  manualSendIncompleteList,
  preloadData,
};
