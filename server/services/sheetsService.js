import { google } from 'googleapis';
import dotenv from 'dotenv';
import cacheService from './cacheService.js';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SUSPENSION_SPREADSHEET_ID = '17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA';

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
 * H列: 学籍番号、K列: 休会期間
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
          range: `${sheetName}!H:K`,
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
    
    // ヘッダー行をスキップ
    const dataRows = rows.slice(1);
    
    // 学籍番号をキーとして休会情報を格納
    const suspensionData = {};
    
    dataRows.forEach(row => {
      const studentId = row[0]; // H列: 学籍番号
      const suspensionMonths = parseInt(row[3]) || 0; // K列: 休会期間
      
      if (studentId && suspensionMonths > 0) {
        suspensionData[studentId] = {
          suspensionMonths,
          hasSuspensionHistory: true,
        };
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
