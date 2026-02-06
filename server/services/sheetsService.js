import { google } from 'googleapis';
import dotenv from 'dotenv';
import cacheService from './cacheService.js';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SUSPENSION_SPREADSHEET_ID = '17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA';
const EXAMINATION_FORM_SPREADSHEET_ID = '1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ';

/**
 * Google Sheets 認証の取得
 */
function getAuth() {
  // サービスアカウントキーが設定されている場合
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    } catch (error) {
      console.error('❌ Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:', error.message);
      return null;
    }
  }
  
  // API Keyが設定されている場合（フォールバック）
  if (process.env.GOOGLE_API_KEY) {
    return { key: process.env.GOOGLE_API_KEY };
  }
  
  console.warn('⚠️  No Google Sheets authentication configured');
  return null;
}

/**
 * Google Sheets から延長フォームの最終更新月を取得（キャッシュ対応）
 */
export async function fetchFormUpdates() {
  const cacheKey = 'sheets_form_updates';
  
  // キャッシュをチェック
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`📦 Returning form updates from cache (${Object.keys(cached).length} records)`);
    return cached;
  }

  try {
    console.log('🔄 Fetching form updates from Google Sheets...');
    
    const auth = getAuth();
    if (!auth) {
      console.warn('⚠️  Google Sheets authentication not configured, returning empty data');
      return {};
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    // 複数のシート名を試す
    const possibleSheetNames = [
      'フォームの回答 1',
      'Form Responses 1',
      'Form Responses',
      'Form_Responses',
      'フォーム回答 1',
      'フォーム回答',
      'シート1',
    ];
    
    let response = null;
    let successSheetName = null;
    
    // 各シート名を順番に試す
    for (const sheetName of possibleSheetNames) {
      try {
        console.log(`📋 Trying sheet name: "${sheetName}"`);
        response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${sheetName}!A:E`,
        });
        successSheetName = sheetName;
        console.log(`✅ Successfully accessed sheet: "${sheetName}"`);
        break; // 成功したらループを抜ける
      } catch (err) {
        console.log(`❌ Failed to access sheet: "${sheetName}" - ${err.message}`);
        continue; // 次のシート名を試す
      }
    }
    
    // すべて失敗した場合
    if (!response) {
      throw new Error('Unable to find valid sheet name. Tried: ' + possibleSheetNames.join(', '));
    }

    const rows = response.data.values || [];
    
    // ヘッダー行をスキップ
    const dataRows = rows.slice(1);
    
    // 学籍番号をキーとして最終更新月を格納
    const formUpdates = {};
    
    dataRows.forEach(row => {
      const lastUpdate = row[0]; // A列: 最終更新月
      const studentId = row[4]; // E列: 学籍番号
      
      if (studentId && lastUpdate) {
        formUpdates[studentId] = lastUpdate;
      }
    });

    console.log(`✅ Fetched form updates for ${Object.keys(formUpdates).length} students from "${successSheetName}"`);

    // キャッシュに保存（5分間）
    cacheService.set(cacheKey, formUpdates);

    return formUpdates;
  } catch (error) {
    console.error('❌ Error fetching from Google Sheets:', error.message);
    // エラーが発生しても空のオブジェクトを返す
    return {};
  }
}

/**
 * Google Sheets から休会情報を取得（キャッシュ対応）
 * H列: 学籍番号、I列: 休会開始日、K列: 休会期間
 */
export async function fetchSuspensionData() {
  const cacheKey = 'sheets_suspension_data';
  
  // キャッシュをチェック
  const cached = cacheService.get(cacheKey);
  if (cached) {
    console.log(`📦 Returning suspension data from cache (${Object.keys(cached).length} records)`);
    return cached;
  }

  try {
    console.log('🔄 Fetching suspension data from Google Sheets...');
    
    const auth = getAuth();
    if (!auth) {
      console.warn('⚠️  Google Sheets authentication not configured, returning empty data');
      return {};
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    // 複数のシート名を試す
    const possibleSheetNames = [
      'シート1',
      'Sheet1',
      'フォームの回答 1',
      'Form Responses 1',
    ];
    
    let response = null;
    let successSheetName = null;
    
    // 各シート名を順番に試す
    for (const sheetName of possibleSheetNames) {
      try {
        console.log(`📋 Trying suspension sheet name: "${sheetName}"`);
        response = await sheets.spreadsheets.values.get({
          spreadsheetId: SUSPENSION_SPREADSHEET_ID,
          range: `${sheetName}!A:M`, // 全列を取得して正しい列を特定
        });
        successSheetName = sheetName;
        console.log(`✅ Successfully accessed suspension sheet: "${sheetName}"`);
        break; // 成功したらループを抜ける
      } catch (err) {
        console.log(`❌ Failed to access suspension sheet: "${sheetName}" - ${err.message}`);
        continue; // 次のシート名を試す
      }
    }
    
    // すべて失敗した場合
    if (!response) {
      throw new Error('Unable to find valid suspension sheet name. Tried: ' + possibleSheetNames.join(', '));
    }

    const rows = response.data.values || [];
    
    console.log(`📊 Total rows fetched: ${rows.length}`);
    console.log(`📋 Header row: ${JSON.stringify(rows[0])}`);
    console.log(`📋 First data row: ${JSON.stringify(rows[1])}`);
    console.log(`📋 Second data row: ${JSON.stringify(rows[2])}`);
    
    // ヘッダー行をスキップ
    const dataRows = rows.slice(1);
    
    // 学籍番号をキーとして休会情報を格納
    const suspensionData = {};
    
    dataRows.forEach((row, index) => {
      // スプレッドシートの列構造:
      // A: タイムスタンプ, B: 修正日, C: 休会開始日（フォーム入力日）, D: メール, E: 担当Tutor
      // F: 契約ID, G: 契約者名, H: 学籍番号, I: 休会理由, J: ドライブリンク
      // K: 休会期間, L: 復帰予定日（開始）=休会開始日, M: 復帰予定日（終了）
      
      const rawStudentId = row[7]?.trim(); // H列: 学籍番号（インデックス7）
      const suspensionStartDate = row[11]?.trim(); // L列: 復帰予定日（開始）=休会開始日（インデックス11）
      const suspensionMonths = parseInt(row[10]) || 0; // K列: 休会期間（インデックス10）
      
      // 学籍番号の正規化: OLST を OLTS に変換
      // スプレッドシートには OLST と OLTS の両方が混在しているため統一する
      let studentId = rawStudentId;
      if (studentId && studentId.startsWith('OLST')) {
        // OLST240082-OG → OLTS240082-OG に変換
        studentId = studentId.replace(/^OLST/, 'OLTS');
      }
      
      // デバッグ: 最初の10件を詳細ログ出力
      if (index < 10) {
        console.log(`  [${index}] Raw row data (first 11 columns):`, JSON.stringify(row.slice(0, 11)));
        console.log(`    → rawStudentId="${rawStudentId}", normalized="${studentId}", startDate="${suspensionStartDate}", months=${suspensionMonths}`);
      }
      
      if (studentId && suspensionMonths > 0) {
        suspensionData[studentId] = {
          suspensionMonths,
          suspensionStartDate, // 休会開始日を追加
          hasSuspensionHistory: true,
        };
        
        // マッチした場合も表示
        if (index < 10) {
          console.log(`    ✅ Added to suspensionData`);
        }
      } else {
        if (index < 10) {
          console.log(`    ❌ Skipped (studentId="${studentId}", months=${suspensionMonths})`);
        }
      }
    });

    console.log(`✅ Fetched suspension data for ${Object.keys(suspensionData).length} students from "${successSheetName}"`);

    // キャッシュに保存（5分間）
    cacheService.set(cacheKey, suspensionData);

    return suspensionData;
  } catch (error) {
    console.error('❌ Error fetching suspension data from Google Sheets:', error.message);
    // エラーが発生しても空のオブジェクトを返す
    return {};
  }
}

/**
 * 審査結果フォームの送信状況を確認
 * スプレッドシート: https://docs.google.com/spreadsheets/d/1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ/edit?gid=1473368384#gid=1473368384
 * シート名: フォームの回答 1
 * B列: タイムスタンプ、E列: 学籍番号
 * @param {string} studentId - 学籍番号
 * @returns {Promise<boolean>} - 今月のフォーム送信があればtrue
 */
export async function checkExaminationFormSubmission(studentId) {
  try {
    const auth = getAuth();
    if (!auth) {
      console.warn('⚠️ Google Sheets authentication not configured');
      return false;
    }

    const sheets = google.sheets({ version: 'v4', auth });
    
    // シート名を試す
    const possibleSheetNames = [
      'フォームの回答 1',
      'Form Responses 1',
      'Form Responses',
    ];
    
    let response = null;
    
    for (const sheetName of possibleSheetNames) {
      try {
        response = await sheets.spreadsheets.values.get({
          spreadsheetId: EXAMINATION_FORM_SPREADSHEET_ID,
          range: `${sheetName}!B:E`, // B列（タイムスタンプ）とE列（学籍番号）
        });
        break;
      } catch (err) {
        continue;
      }
    }
    
    if (!response) {
      console.warn('⚠️ Unable to access examination form sheet');
      return false;
    }

    const rows = response.data.values || [];
    const dataRows = rows.slice(1); // ヘッダー行をスキップ
    
    // 今月の年月を取得 (YYYY-MM形式)
    const now = new Date();
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // 学籍番号とタイムスタンプの月が一致する行を検索
    const hasSubmission = dataRows.some(row => {
      const timestamp = row[0]; // B列
      const formStudentId = row[3]; // E列（インデックス3）
      
      if (!timestamp || !formStudentId) return false;
      if (formStudentId !== studentId) return false;
      
      // タイムスタンプから年月を抽出
      try {
        const date = new Date(timestamp);
        const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return yearMonth === currentYearMonth;
      } catch (error) {
        return false;
      }
    });
    
    return hasSubmission;
  } catch (error) {
    console.error('❌ Error checking examination form submission:', error);
    return false;
  }
}
