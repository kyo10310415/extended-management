import cron from 'node-cron';
import { fetchStudentsFromNotion } from './notionService.js';
import { fetchFormUpdates, fetchSuspensionData } from './sheetsService.js';
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
 * 手動でデータを更新（API経由で呼び出し可能）
 */
export async function manualUpdate() {
  // キャッシュをクリアしてから再取得
  cacheService.clear();
  return await preloadData();
}

export default {
  initializeDataPreload,
  scheduleDailyUpdate,
  manualUpdate,
  preloadData,
};
