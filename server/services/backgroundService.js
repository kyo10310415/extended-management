import cron from 'node-cron';
import { fetchStudentsFromNotion } from './notionService.js';
import { fetchFormUpdates, fetchSuspensionData } from './sheetsService.js';
import { sendSuspensionEndNotification } from './slackService.js';
import { sendMonthlyStudentListToTutors, sendIncompleteStudentListToTutors } from './discordService.js';
import { enrichStudentsWithMonths, filterStudentsByMonth } from '../utils/dateUtils.js';
import cacheService from './cacheService.js';

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
 */
export async function initializeDataPreload() {
  console.log('🚀 Initializing data preload on server startup...');
  
  // 起動時に即座にプリロード
  await preloadData();
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
  // 毎月1日 AM 9:00 JST (UTC 0:00 on 1st)
  const cronExpression = '0 0 1 * *'; // 毎月1日 00:00 UTC = 1日 09:00 JST

  console.log('⏰ Scheduling monthly student list notifications on 1st of each month at 9:00 AM JST');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Monthly student list notification triggered on 1st of the month');
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
  // 毎月20日 AM 9:00 JST (UTC 0:00 on 20th)
  const cronExpression = '0 0 20 * *'; // 毎月20日 00:00 UTC = 20日 09:00 JST

  console.log('⏰ Scheduling incomplete list notifications on 20th of each month at 9:00 AM JST');

  const task = cron.schedule(cronExpression, async () => {
    console.log('⏰ Incomplete list notification triggered on 20th of the month');
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
      if (!suspension || !student.lessonStartDate) continue;
      
      // 休会終了日を計算
      const startDate = new Date(student.lessonStartDate);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + suspension.suspensionMonths);
      endDate.setDate(0); // 月末日に設定
      
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth() + 1;
      
      // 今月終了する場合
      if (endYear === currentYear && endMonth === currentMonth) {
        suspensionEndingStudents.push({
          ...student,
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
    
    // 今月のヒアリング対象でヒアリング未完了
    const incompleteHearingStudents = [
      ...filterStudentsByMonth(enrichedStudents, 4, 0),
      ...filterStudentsByMonth(enrichedStudents, 10, 0),
    ].filter(s => s.status === 'アクティブ' && !s.extensionData?.hearing_status);
    
    // 今月の延長審査対象で審査結果未入力
    const incompleteExaminationStudents = [
      ...filterStudentsByMonth(enrichedStudents, 5, 0),
      ...filterStudentsByMonth(enrichedStudents, 11, 0),
    ].filter(s => s.status === 'アクティブ' && !s.extensionData?.examination_result);
    
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

export default {
  initializeDataPreload,
  scheduleDailyUpdate,
  scheduleSuspensionEndNotifications,
  scheduleMonthlyStudentListNotifications,
  scheduleIncompleteListNotifications,
  manualUpdate,
  manualSendSuspensionEndNotifications,
  manualSendMonthlyStudentList,
  manualSendIncompleteList,
  preloadData,
};
