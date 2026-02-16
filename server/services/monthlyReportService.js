import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

// 月次レポート専用のスプレッドシートID
const MONTHLY_REPORT_SPREADSHEET_ID = process.env.MONTHLY_REPORT_SPREADSHEET_ID || '';

/**
 * Google Sheets 認証の取得（読み書き権限）
 */
function getAuthWithWriteAccess() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
    } catch (error) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', error.message);
      return null;
    }
  }
  
  console.warn('⚠️  No Google Sheets authentication configured');
  return null;
}

/**
 * 月次レポートをスプレッドシートに書き出し
 */
export async function writeMonthlyReport(reportData) {
  console.log('📝 Writing monthly report to Google Sheets...');
  
  const auth = getAuthWithWriteAccess();
  if (!auth) {
    throw new Error('Google Sheets authentication not configured');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = MONTHLY_REPORT_SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error('MONTHLY_REPORT_SPREADSHEET_ID not configured');
  }

  // 現在の年月をヘッダーとして取得（例: "2026年02月"）
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const headerLabel = `${year}年${month}月`;

  console.log(`  月次レポート: ${headerLabel}`);

  try {
    // 既存のデータを取得
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:ZZ', // すべての列を取得
    });

    const rows = existingData.data.values || [];
    
    // ヘッダー行が存在するか確認
    let headers = rows[0] || [];
    
    // 新しい列のインデックスを計算
    const newColumnIndex = headers.length;
    const columnLetter = getColumnLetter(newColumnIndex);

    console.log(`  新しいデータを列 ${columnLetter} に追加`);

    // ヘッダー行が空の場合、項目名を追加
    if (headers.length === 0) {
      const itemNames = [
        '項目名',
        '延長審査1回目 対象数',
        '延長審査1回目 延長数',
        '延長審査1回目 延長率(%)',
        '延長審査2回目 対象数',
        '延長審査2回目 延長数',
        '延長審査2回目 延長率(%)',
        'Proプラン成約率(%)',
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'A1:A8',
        valueInputOption: 'RAW',
        resource: {
          values: itemNames.map(name => [name]),
        },
      });

      console.log('  ✅ 項目名を追加しました');
    }

    // 新しい列のヘッダーとデータを追加
    const newColumnData = [
      [headerLabel], // ヘッダー（年月）
      [reportData.exam1stTargetCount],
      [reportData.exam1stExtensionCount],
      [reportData.exam1stExtensionRate.toFixed(2)],
      [reportData.exam2ndTargetCount],
      [reportData.exam2ndExtensionCount],
      [reportData.exam2ndExtensionRate.toFixed(2)],
      [reportData.proPlanRate.toFixed(2)],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${columnLetter}1:${columnLetter}8`,
      valueInputOption: 'RAW',
      resource: {
        values: newColumnData,
      },
    });

    console.log('  ✅ 月次レポートを書き込みました');

    return {
      success: true,
      spreadsheetId,
      month: headerLabel,
      column: columnLetter,
    };
  } catch (error) {
    console.error('  ❌ Error writing monthly report:', error);
    throw error;
  }
}

/**
 * 列番号をアルファベットに変換（0 → A, 1 → B, 26 → AA, など）
 */
function getColumnLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

/**
 * 月次レポート用スプレッドシートを新規作成
 */
export async function createMonthlyReportSpreadsheet() {
  console.log('📄 Creating new monthly report spreadsheet...');
  
  const auth = getAuthWithWriteAccess();
  if (!auth) {
    throw new Error('Google Sheets authentication not configured');
  }

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const spreadsheet = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: 'WannaV 延長管理システム - 月次レポート',
        },
        sheets: [
          {
            properties: {
              title: '月次データ',
              gridProperties: {
                frozenRowCount: 1, // ヘッダー行を固定
                frozenColumnCount: 1, // 項目名列を固定
              },
            },
          },
        ],
      },
    });

    const newSpreadsheetId = spreadsheet.data.spreadsheetId;
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}`;

    console.log('  ✅ 新しいスプレッドシートを作成しました');
    console.log(`  📊 URL: ${spreadsheetUrl}`);
    console.log(`  🔑 ID: ${newSpreadsheetId}`);

    // 項目名を初期化
    const itemNames = [
      ['項目名'],
      ['延長審査1回目 対象数'],
      ['延長審査1回目 延長数'],
      ['延長審査1回目 延長率(%)'],
      ['延長審査2回目 対象数'],
      ['延長審査2回目 延長数'],
      ['延長審査2回目 延長率(%)'],
      ['Proプラン成約率(%)'],
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: newSpreadsheetId,
      range: 'A1:A8',
      valueInputOption: 'RAW',
      resource: {
        values: itemNames,
      },
    });

    console.log('  ✅ 項目名を初期化しました');

    return {
      success: true,
      spreadsheetId: newSpreadsheetId,
      url: spreadsheetUrl,
    };
  } catch (error) {
    console.error('  ❌ Error creating spreadsheet:', error);
    throw error;
  }
}

export default {
  writeMonthlyReport,
  createMonthlyReportSpreadsheet,
};
