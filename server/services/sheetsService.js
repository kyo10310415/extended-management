import { google } from 'googleapis';
import { Gaxios } from 'gaxios';
import dotenv from 'dotenv';
import cacheService from './cacheService.js';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SUSPENSION_SPREADSHEET_ID = '17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA';
const EXAMINATION_FORM_SPREADSHEET_ID = process.env.EXAMINATION_FORM_SPREADSHEET_ID
  || '1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ';
const EXAMINATION_FORM_SHEET_NAME = process.env.EXAMINATION_FORM_SHEET_NAME
  || 'フォームの回答 1';
const LESSON_RESERVATION_SPREADSHEET_ID = process.env.LESSON_RESERVATION_SPREADSHEET_ID
  || '1DvjTbwz2qhqwSnNqROTDAvd1hl-Lz9o05LE6rzEQEGo';
const LESSON_RESERVATION_SHEET_NAME = process.env.LESSON_RESERVATION_SHEET_NAME
  || 'レッスン予約データ';
const LESSON_DATES_CACHE_TTL_MS = 5 * 60 * 1000;
let lessonRowsFetchPromise = null;
const EXAMINATION_RESULTS_CACHE_TTL_MS = 30 * 60 * 1000;
let examinationFormRowsFetchPromise = null;

/**
 * ERR_STREAM_PREMATURE_CLOSE 根本解消
 *
 * 問題: node-fetch v2 は Node.js の https モジュールを使い、
 *      Node.js v18+ が TCP レベルで Accept-Encoding: gzip,br を自動付与する。
 *      Google Sheets API は gzip 圧縮レスポンスを返すが、
 *      node-fetch の Gunzip ストリームが Node.js v18+ で途中切断される。
 *
 * 解決: Node.js 18+ 組み込みの globalThis.fetch (undici ベース) を使用する。
 *      undici は独自の HTTP スタックを持ち、gzip を正しく解凍できる。
 */
const customTransporter = new Gaxios({ fetchImplementation: globalThis.fetch });

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
        // globalThis.fetch ベースのカスタムトランスポーターを
        // clientOptions 経由で JWT クライアントに渡す
        // → OAuth2 トークン取得・Sheets API リクエスト両方に適用される
        clientOptions: { transporter: customTransporter },
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
 * 学籍番号をスプレッドシート照合用に正規化する。
 * 過去データに混在する OLST は、システム側の OLTS と同一として扱う。
 */
export function normalizeLessonStudentId(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^OLST/, 'OLTS');
}

/**
 * Google Sheets の表示値から年月・表示用日時・ソートキーを生成する。
 * 対応形式: YYYY/MM/DD, YYYY-MM-DD、および任意の HH:mm[:ss]
 */
export function parseLessonDate(value) {
  const rawValue = String(value ?? '').trim();
  const match = rawValue.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? null : Number(match[4]);
  const minute = match[5] === undefined ? null : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  const isValidDate = month >= 1 && month <= 12
    && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isValidTime = hour === null
    || (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59);

  if (!isValidDate || !isValidTime) return null;

  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  const datePart = `${year}/${paddedMonth}/${paddedDay}`;
  const timePart = hour === null
    ? ''
    : ` ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    yearMonth: `${year}-${paddedMonth}`,
    displayValue: `${datePart}${timePart}`,
    sortKey: `${year}-${paddedMonth}-${paddedDay}T${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
  };
}

/**
 * 日本時間の現在月を基準に、月オフセット先の YYYY-MM を返す。
 */
export function getLessonTargetYearMonth(monthOffset = 0, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const normalizedOffset = Number.isFinite(Number(monthOffset)) ? Number(monthOffset) : 0;
  const target = new Date(Date.UTC(year, month - 1 + normalizedOffset, 1));

  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * B:E の行データを、対象年月・学籍番号別のレッスン日時配列に変換する。
 * 同一日時を含む複数行も、それぞれ1レッスンとして保持する。
 */
export function buildLessonDatesByStudent(rows, targetYearMonth) {
  const datedLessonsByStudent = {};

  rows.forEach(row => {
    const studentId = normalizeLessonStudentId(row?.[0]); // B列
    const lessonDate = parseLessonDate(row?.[3]); // E列（B:E 内の index 3）

    if (!studentId || !lessonDate || lessonDate.yearMonth !== targetYearMonth) return;

    if (!datedLessonsByStudent[studentId]) {
      datedLessonsByStudent[studentId] = [];
    }
    datedLessonsByStudent[studentId].push(lessonDate);
  });

  return Object.fromEntries(
    Object.entries(datedLessonsByStudent).map(([studentId, lessonDates]) => [
      studentId,
      lessonDates
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .map(lessonDate => lessonDate.displayValue),
    ])
  );
}

async function fetchLessonReservationRows() {
  const cacheKey = `lesson_reservation_rows_${LESSON_RESERVATION_SPREADSHEET_ID}_${LESSON_RESERVATION_SHEET_NAME}`;
  const cachedRows = cacheService.get(cacheKey);
  if (cachedRows) return cachedRows;

  if (lessonRowsFetchPromise) return lessonRowsFetchPromise;

  lessonRowsFetchPromise = (async () => {
    const auth = getAuth();
    if (!auth) {
      console.warn('⚠️ Google Sheets authentication not configured for lesson dates');
      return [];
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const escapedSheetName = LESSON_RESERVATION_SHEET_NAME.replace(/'/g, "''");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: LESSON_RESERVATION_SPREADSHEET_ID,
      range: `'${escapedSheetName}'!B:E`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = response.data.values || [];
    cacheService.set(cacheKey, rows, LESSON_DATES_CACHE_TTL_MS);
    console.log(`✅ Fetched ${rows.length} lesson reservation rows from "${LESSON_RESERVATION_SHEET_NAME}"`);
    return rows;
  })();

  try {
    return await lessonRowsFetchPromise;
  } finally {
    lessonRowsFetchPromise = null;
  }
}

/**
 * レッスン予約データから、表示月の全レッスン日を学籍番号別に取得する。
 * シート構造: B列=学籍番号、E列=レッスン日（1行目からデータ）
 */
export async function fetchLessonDatesForMonth(monthOffset = 0) {
  const targetYearMonth = getLessonTargetYearMonth(monthOffset);

  try {
    const rows = await fetchLessonReservationRows();
    const lessonDatesByStudent = buildLessonDatesByStudent(rows, targetYearMonth);
    console.log(`📅 Lesson dates for ${targetYearMonth}: ${Object.keys(lessonDatesByStudent).length} students`);

    return { targetYearMonth, lessonDatesByStudent };
  } catch (error) {
    console.error('❌ Error fetching lesson dates from Google Sheets:', error.message);
    return { targetYearMonth, lessonDatesByStudent: {} };
  }
}

export function getLessonDatesForStudent(lessonDatesByStudent, studentId) {
  return lessonDatesByStudent[normalizeLessonStudentId(studentId)] || [];
}

/**
 * フォームのI列の値を、システム上の審査結果へ変換する。
 * 指定外の値は自動入力しない。
 */
export function mapExaminationFormResult(value) {
  const normalizedValue = String(value ?? '').trim().replace(/＋/g, '+');

  if (normalizedValue === '延長' || normalizedValue === '永久会員+PROプラン') {
    return '延長';
  }
  if (normalizedValue === '正規退会' || normalizedValue === '無断キャンセル') {
    return '退会';
  }
  if (normalizedValue === '永久会員') {
    return '永久会員';
  }

  return null;
}

/**
 * B:I のフォーム回答から、対象年月の最新回答を学籍番号別に抽出する。
 * 同じ年月・学籍番号に複数回答がある場合は、B列の入力日時が最新の行を採用する。
 */
export function buildAutomaticExaminationResultsByStudent(rows, targetYearMonth) {
  const latestResponseByStudent = {};

  rows.forEach((row, rowIndex) => {
    const inputDate = parseLessonDate(row?.[0]); // B列
    const studentId = normalizeLessonStudentId(row?.[3]); // E列（B:I 内の index 3）

    if (!inputDate || inputDate.yearMonth !== targetYearMonth || !studentId) return;

    const sourceValue = String(row?.[7] ?? '').trim(); // I列（B:I 内の index 7）
    const candidate = {
      result: mapExaminationFormResult(sourceValue),
      sourceValue,
      sourceTimestamp: inputDate.displayValue,
      sortKey: `${inputDate.sortKey}-${String(rowIndex).padStart(8, '0')}`,
    };
    const current = latestResponseByStudent[studentId];

    if (!current || candidate.sortKey >= current.sortKey) {
      latestResponseByStudent[studentId] = candidate;
    }
  });

  return Object.fromEntries(
    Object.entries(latestResponseByStudent)
      .filter(([, response]) => response.result)
      .map(([studentId, response]) => [studentId, {
        result: response.result,
        sourceValue: response.sourceValue,
        sourceTimestamp: response.sourceTimestamp,
      }])
  );
}

async function fetchExaminationFormRows(forceRefresh = false) {
  const cacheKey = `examination_form_rows_${EXAMINATION_FORM_SPREADSHEET_ID}_${EXAMINATION_FORM_SHEET_NAME}`;
  if (forceRefresh) {
    cacheService.delete(cacheKey);
  }

  const cachedRows = cacheService.get(cacheKey);
  if (cachedRows) return { available: true, rows: cachedRows };

  if (examinationFormRowsFetchPromise) return examinationFormRowsFetchPromise;

  examinationFormRowsFetchPromise = (async () => {
    const auth = getAuth();
    if (!auth) {
      console.warn('⚠️ Google Sheets authentication not configured for examination results');
      return { available: false, rows: [] };
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const escapedSheetName = EXAMINATION_FORM_SHEET_NAME.replace(/'/g, "''");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: EXAMINATION_FORM_SPREADSHEET_ID,
      range: `'${escapedSheetName}'!B:I`,
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = (response.data.values || []).slice(1); // 1行目はヘッダー
    cacheService.set(cacheKey, rows, EXAMINATION_RESULTS_CACHE_TTL_MS);
    console.log(`✅ Fetched ${rows.length} examination form rows from "${EXAMINATION_FORM_SHEET_NAME}"`);
    return { available: true, rows };
  })();

  try {
    return await examinationFormRowsFetchPromise;
  } finally {
    examinationFormRowsFetchPromise = null;
  }
}

/**
 * 表示月のフォーム回答を、自動入力用の審査結果マップとして返す。
 */
export async function fetchAutomaticExaminationResultsForMonth(
  monthOffset = 0,
  { forceRefresh = false } = {}
) {
  const targetYearMonth = getLessonTargetYearMonth(monthOffset);

  try {
    const { available, rows } = await fetchExaminationFormRows(forceRefresh);
    if (!available) {
      return { available: false, targetYearMonth, resultsByStudent: {} };
    }

    const resultsByStudent = buildAutomaticExaminationResultsByStudent(rows, targetYearMonth);
    console.log(`📋 Automatic examination results for ${targetYearMonth}: ${Object.keys(resultsByStudent).length} students`);
    return { available: true, targetYearMonth, resultsByStudent };
  } catch (error) {
    console.error('❌ Error fetching automatic examination results:', error.message);
    return { available: false, targetYearMonth, resultsByStudent: {} };
  }
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
    
    // 学籍番号をキーとして休会情報を格納（複数レコード対応）
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
        // 既存のエントリがない場合は初期化
        if (!suspensionData[studentId]) {
          suspensionData[studentId] = {
            suspensionMonths: 0,
            suspensionStartDate: null,
            hasSuspensionHistory: true,
            records: [], // 複数レコードを保持
          };
        }
        
        // 休会期間を合計
        suspensionData[studentId].suspensionMonths += suspensionMonths;
        
        // 最初の休会開始日を記録（既存の値がない場合のみ）
        if (!suspensionData[studentId].suspensionStartDate) {
          suspensionData[studentId].suspensionStartDate = suspensionStartDate;
        }
        
        // レコードを配列に追加
        suspensionData[studentId].records.push({
          suspensionStartDate,
          suspensionMonths,
          rowIndex: index + 1, // 実際の行番号（ヘッダーを考慮）
        });
        
        // マッチした場合も表示
        if (index < 10) {
          console.log(`    ✅ Added to suspensionData (total: ${suspensionData[studentId].suspensionMonths} months)`);
        }
      } else {
        if (index < 10) {
          console.log(`    ❌ Skipped (studentId="${studentId}", months=${suspensionMonths})`);
        }
      }
    });

    console.log(`✅ Fetched suspension data for ${Object.keys(suspensionData).length} students from "${successSheetName}"`);
    console.log(`   Total records: ${dataRows.length}, Unique students: ${Object.keys(suspensionData).length}`);

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
