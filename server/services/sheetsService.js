import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

/**
 * Google Sheets から延長フォームの最終更新月を取得
 */
export async function fetchFormUpdates() {
  try {
    const sheets = google.sheets({ version: 'v4' });
    
    // A列: 最終更新月、E列: 学籍番号
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Form_Responses!A:E',
      key: process.env.GOOGLE_API_KEY,
    });

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

    return formUpdates;
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error);
    // エラーが発生しても空のオブジェクトを返す
    return {};
  }
}
