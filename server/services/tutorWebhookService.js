import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const TUTOR_WEBHOOK_SHEET_ID = process.env.TUTOR_WEBHOOK_SHEET_ID || '13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs';

let auth = null;

/**
 * Google認証を初期化
 */
function initializeAuth() {
  if (auth) return auth;

  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_SHEETS_CREDENTIALS;
  
  if (!credentials) {
    throw new Error('Google credentials not configured');
  }

  const parsedCredentials = typeof credentials === 'string' 
    ? JSON.parse(credentials) 
    : credentials;

  auth = new google.auth.GoogleAuth({
    credentials: parsedCredentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return auth;
}

/**
 * TutorのWebhook URLとUser IDを取得
 * スプレッドシート: https://docs.google.com/spreadsheets/d/13rHnYHavM6Mm7JRC3n88X2pTCoAlCZOXMkapDq7uwNs/edit?gid=2058276273#gid=2058276273
 * シート名: 「WTCチャットURL」
 * A列: Tutor名、E列: WTCチャットURL、L列: ユーザーID
 */
export async function getTutorWebhooks() {
  try {
    const authClient = initializeAuth();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // 指定したシート名「WTCチャットURL」を使用
    const sheetName = 'WTCチャットURL';

    console.log(`🔍 Fetching data from sheet: "${sheetName}"`);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: TUTOR_WEBHOOK_SHEET_ID,
      range: `${sheetName}!A:L`, // A列（Tutor名）、E列（WTCチャットURL）、L列（ユーザーID）
    });

    const rows = response.data.values || [];
    
    if (rows.length === 0) {
      console.warn('⚠️ No data found in tutor webhook sheet');
      return {};
    }

    // ヘッダー行をスキップ
    const dataRows = rows.slice(1);
    
    const tutorWebhooks = {};
    
    dataRows.forEach(row => {
      const tutorName = row[0]; // A列
      const webhookUrl = row[4]; // E列（インデックス4）
      const userId = row[11]; // L列（インデックス11）
      
      if (tutorName && webhookUrl) {
        // Tutor名を正規化（「先生」とスペースを除去）
        const normalizedName = normalizeTutorName(tutorName);
        tutorWebhooks[normalizedName] = {
          webhookUrl,
          userId: userId || null, // ユーザーIDがない場合はnull
        };
      }
    });

    console.log(`✅ Loaded webhook URLs for ${Object.keys(tutorWebhooks).length} tutors`);
    return tutorWebhooks;
  } catch (error) {
    console.error('❌ Error fetching tutor webhooks:', error);
    throw error;
  }
}

/**
 * Tutor名を正規化（「先生」とスペースを除去）
 * 例: 「のあ先生」→「のあ」、「先生 ゆか」→「ゆか」、「先生りほ」→「りほ」
 */
export function normalizeTutorName(tutorName) {
  if (!tutorName) return '';
  return tutorName
    .replace(/先生/g, '')  // 「先生」を削除
    .replace(/\s+/g, '')   // 全てのスペースを削除（半角・全角）
    .trim();               // 前後の空白を削除
}

export default {
  getTutorWebhooks,
  normalizeTutorName,
};
