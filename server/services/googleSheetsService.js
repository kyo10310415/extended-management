import { google } from 'googleapis';
import { fetchStudents } from './notionService.js';
import { calculateMonthsElapsed } from '../utils/dateUtils.js';

/**
 * Google Sheets APIクライアントを初期化
 */
function getGoogleSheetsClient() {
  // 既存の環境変数を優先的に使用
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SHEETS_CREDENTIALS;
  
  if (!credentials) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SHEETS_CREDENTIALS environment variable is not set');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentials),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * 生徒情報をGoogle Sheetsにエクスポート
 */
export async function exportStudentsToSheet() {
  try {
    console.log('📊 Starting export to Google Sheets...');

    // Notionから生徒データを取得
    const students = await fetchStudents();
    console.log(`✅ Fetched ${students.length} students from Notion`);

    // データを整形
    const rows = students.map(student => {
      const monthsElapsed = calculateMonthsElapsed(student.lessonStartDate);
      
      // X IDから@を除去
      let xId = student.xId || '';
      if (xId.startsWith('@')) {
        xId = xId.substring(1);
      }

      return [
        student.name || '',                    // 生徒様名
        student.studentId || '',               // 学籍番号
        monthsElapsed || '',                   // 経過月数
        student.notionUrl || '',               // NotionURL
        student.status || '',                  // ステータス
        student.plan || '',                    // 契約プラン
        student.characterName || '',           // キャラクター名
        student.ytChannelId || '',             // YTチャンネルID
        xId,                                   // X ID（@なし）
      ];
    });

    // ヘッダー行を追加
    const headers = [
      '生徒様名',
      '学籍番号',
      '経過月数',
      'NotionURL',
      'ステータス',
      '契約プラン',
      'キャラクター名',
      'YTチャンネルID',
      'X ID（@は無し）',
    ];

    const data = [headers, ...rows];

    console.log(`📝 Prepared ${rows.length} rows for export`);

    // Google Sheets APIクライアントを取得
    const sheets = getGoogleSheetsClient();

    // 新しいスプレッドシートを作成
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: `生徒マスタ_${new Date().toISOString().split('T')[0]}`,
        },
        sheets: [
          {
            properties: {
              title: '生徒一覧',
            },
          },
        ],
      },
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    const spreadsheetUrl = createResponse.data.spreadsheetUrl;

    console.log(`✅ Created spreadsheet: ${spreadsheetUrl}`);

    // データを書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: '生徒一覧!A1',
      valueInputOption: 'RAW',
      requestBody: {
        values: data,
      },
    });

    console.log(`✅ Wrote ${data.length} rows to spreadsheet`);

    // ヘッダー行をフォーマット（太字、背景色）
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 0,
                startRowIndex: 0,
                endRowIndex: 1,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: {
                    red: 0.2,
                    green: 0.6,
                    blue: 0.9,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 1,
                      green: 1,
                      blue: 1,
                    },
                  },
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId: 0,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 9,
              },
            },
          },
        ],
      },
    });

    console.log(`✅ Applied formatting to spreadsheet`);

    return {
      success: true,
      spreadsheetId,
      spreadsheetUrl,
      rowCount: rows.length,
    };
  } catch (error) {
    console.error('❌ Error exporting to Google Sheets:', error);
    throw error;
  }
}
