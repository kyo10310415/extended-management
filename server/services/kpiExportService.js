import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Google Sheets認証を取得
 */
function getAuth() {
  try {
    // サービスアカウントキーがある場合
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    }
    
    // APIキーがある場合（読み取り専用）
    if (process.env.GOOGLE_SHEETS_API_KEY) {
      console.warn('⚠️ Using API Key (read-only). Service account key recommended for write operations.');
      return null;
    }

    throw new Error('Google Sheets credentials not configured');
  } catch (error) {
    console.error('❌ Error setting up Google Sheets auth:', error);
    throw error;
  }
}

/**
 * 新しいスプレッドシートを作成
 */
export async function createKPISpreadsheet() {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const currentDate = new Date();
    const title = `KPI推移_${currentDate.getFullYear()}年`;

    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
        },
        sheets: [{
          properties: {
            title: 'KPIデータ',
            gridProperties: {
              frozenRowCount: 1,
              frozenColumnCount: 1,
            }
          }
        }]
      }
    });

    const spreadsheetId = response.data.spreadsheetId;
    console.log(`✅ Created new KPI spreadsheet: ${title}`);
    console.log(`   ID: ${spreadsheetId}`);
    console.log(`   URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);

    // 初期データを書き込み
    await initializeKPISheet(spreadsheetId);

    return {
      success: true,
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      title,
    };
  } catch (error) {
    console.error('❌ Error creating KPI spreadsheet:', error);
    throw error;
  }
}

/**
 * KPIシートの初期化（項目名を設定）
 */
async function initializeKPISheet(spreadsheetId) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // A列に項目名を設定
    const values = [
      ['項目名'], // A1
      ['延長審査1回目_対象数'],
      ['延長審査1回目_延長数'],
      ['延長審査1回目_延長率(%)'],
      ['延長審査2回目_対象数'],
      ['延長審査2回目_延長数'],
      ['延長審査2回目_延長率(%)'],
      ['Proプラン成約率(%)'],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'KPIデータ!A1:A8',
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    console.log('✅ Initialized KPI sheet with item names');
  } catch (error) {
    console.error('❌ Error initializing KPI sheet:', error);
    throw error;
  }
}

/**
 * KPIデータを月次列として追加
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {object} kpiData - KPIデータオブジェクト
 */
export async function appendMonthlyKPI(spreadsheetId, kpiData) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // 現在の月を取得
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const monthLabel = `${year}年${month}月`;

    // 既存のデータ範囲を取得して、次の列を特定
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'KPIデータ!1:1', // 1行目のヘッダー行を取得
    });

    const existingHeaders = response.data.values?.[0] || ['項目名'];
    const nextColumn = String.fromCharCode(65 + existingHeaders.length); // A=65, B=66, ...

    console.log(`📊 Adding KPI data to column ${nextColumn} (${monthLabel})`);

    // データを整形
    const values = [
      [monthLabel], // ヘッダー
      [kpiData.exam1stTargetCount || 0],
      [kpiData.exam1stExtensionCount || 0],
      [kpiData.exam1stExtensionRate?.toFixed(2) || '0.00'],
      [kpiData.exam2ndTargetCount || 0],
      [kpiData.exam2ndExtensionCount || 0],
      [kpiData.exam2ndExtensionRate?.toFixed(2) || '0.00'],
      [kpiData.proPlanSuccessRate?.toFixed(2) || '0.00'],
    ];

    // データを書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `KPIデータ!${nextColumn}1:${nextColumn}8`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    console.log(`✅ Added KPI data for ${monthLabel} to column ${nextColumn}`);

    return {
      success: true,
      month: monthLabel,
      column: nextColumn,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    };
  } catch (error) {
    console.error('❌ Error appending monthly KPI:', error);
    throw error;
  }
}

/**
 * 現在のKPIデータを取得（テスト用）
 * @param {number} exam1stTargetCount - 1回目対象数
 * @param {number} exam1stExtensionCount - 1回目延長数
 * @param {number} exam1stExtensionRate - 1回目延長率
 * @param {number} exam2ndTargetCount - 2回目対象数
 * @param {number} exam2ndExtensionCount - 2回目延長数
 * @param {number} exam2ndExtensionRate - 2回目延長率
 * @param {number} proPlanSuccessRate - Proプラン成約率
 */
export function formatKPIData({
  exam1stTargetCount,
  exam1stExtensionCount,
  exam1stExtensionRate,
  exam2ndTargetCount,
  exam2ndExtensionCount,
  exam2ndExtensionRate,
  proPlanSuccessRate,
}) {
  return {
    exam1stTargetCount,
    exam1stExtensionCount,
    exam1stExtensionRate,
    exam2ndTargetCount,
    exam2ndExtensionCount,
    exam2ndExtensionRate,
    proPlanSuccessRate,
  };
}
