import { google } from 'googleapis';
import { Gaxios } from 'gaxios';
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import cacheService from './cacheService.js';

dotenv.config();

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SUSPENSION_SPREADSHEET_ID = process.env.SUSPENSION_SPREADSHEET_ID
  || '17ys2PZpDpffG3j4EQrXiLlwGbFxiNosBqMivL2quVEA';
const SUSPENSION_SHEET_NAME = process.env.SUSPENSION_SHEET_NAME || 'フォームの回答 1';
const PAYMENT_STATUS_SPREADSHEET_ID = process.env.PAYMENT_STATUS_SPREADSHEET_ID
  || '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
const PAYMENT_STATUS_SHEET_NAME = process.env.PAYMENT_STATUS_SHEET_NAME
  || 'RAW_支払い状況';
const PAYMENT_STATUS_MONTH_START_COLUMN = process.env.PAYMENT_STATUS_MONTH_START_COLUMN || 'N';
const PAYMENT_STATUS_END_COLUMN = process.env.PAYMENT_STATUS_END_COLUMN || 'BP';
const EXAMINATION_FORM_SPREADSHEET_ID = process.env.EXAMINATION_FORM_SPREADSHEET_ID
  || '1m7P2nsX-M9BGP2RHIj3CjAZiDPs2K9gu1Y_md7xiazQ';
const EXAMINATION_FORM_SHEET_NAME = process.env.EXAMINATION_FORM_SHEET_NAME
  || 'フォームの回答 1';
const LESSON_RESERVATION_SPREADSHEET_ID = process.env.LESSON_RESERVATION_SPREADSHEET_ID
  || '1DvjTbwz2qhqwSnNqROTDAvd1hl-Lz9o05LE6rzEQEGo';
const LESSON_RESERVATION_SHEET_NAME = process.env.LESSON_RESERVATION_SHEET_NAME
  || 'レッスン予約データ';
const FORCED_WITHDRAWAL_STUDENT_SPREADSHEET_ID = process.env.FORCED_WITHDRAWAL_STUDENT_SPREADSHEET_ID
  || '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
const FORCED_WITHDRAWAL_STUDENT_SHEET_NAME = process.env.FORCED_WITHDRAWAL_STUDENT_SHEET_NAME
  || '❶RAW_生徒様情報';
const EXAMINATION_AUTOMATION_SPREADSHEET_ID = process.env.EXAMINATION_AUTOMATION_SPREADSHEET_ID
  || '1iqrAhNjW8jTvobkur5N_9r9uUWFHCKqrhxM72X5z-iM';
const SALES_FORECAST_SHEET_NAME = process.env.SALES_FORECAST_SHEET_NAME
  || '❷売上予測シート';
const SALES_FORECAST_END_COLUMN = process.env.SALES_FORECAST_END_COLUMN || 'BM';
const STUDENT_INFO_SHEET_NAME = process.env.STUDENT_INFO_SHEET_NAME || '❶RAW_生徒様情報';
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
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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
 * B2:B の検索結果から、学籍番号が一致する実際のシート行番号を返す。
 */
export function findForcedWithdrawalStudentInfoRow(studentIdRows, studentId) {
  const normalizedStudentId = normalizeLessonStudentId(studentId);
  if (!normalizedStudentId || !Array.isArray(studentIdRows)) return null;

  const rowIndex = studentIdRows.findIndex(
    row => normalizeLessonStudentId(row?.[0]) === normalizedStudentId
  );

  return rowIndex >= 0 ? rowIndex + 2 : null;
}

export function findStudentRowNumber(studentIdRows, studentId, firstRowNumber) {
  const normalizedStudentId = normalizeLessonStudentId(studentId);
  if (!normalizedStudentId || !Array.isArray(studentIdRows)) return null;

  const rowIndex = studentIdRows.findIndex(
    row => normalizeLessonStudentId(row?.[0]) === normalizedStudentId
  );

  return rowIndex >= 0 ? rowIndex + firstRowNumber : null;
}

export function parseSalesForecastMonthHeader(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})[/-](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  return `${year}-${String(month).padStart(2, '0')}`;
}

export function addMonthsToYearMonth(yearMonth, amount) {
  if (!/^\d{4}-\d{2}$/.test(String(yearMonth ?? ''))) return null;
  const [year, month] = yearMonth.split('-').map(Number);
  if (month < 1 || month > 12) return null;

  const target = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function columnNumberToLetter(columnNumber) {
  let value = Number(columnNumber);
  if (!Number.isInteger(value) || value < 1) return null;

  let letters = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

export function columnLetterToNumber(columnLetter) {
  const normalized = String(columnLetter ?? '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return null;

  return [...normalized].reduce(
    (total, letter) => total * 26 + letter.charCodeAt(0) - 64,
    0
  );
}

/**
 * Google Sheetsの表示日付から年月だけを取り出す。
 * 日は1〜31を許容し、フォーム上の表記ゆれ（YYYY/M/D・YYYY-M-D）を吸収する。
 */
export function parseSuspensionYearMonth(value) {
  const match = String(value ?? '').trim().match(
    /^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?(?:\s|$)/
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildSuspensionApplicationKey({ submittedAt, studentId, rowNumber }) {
  const sourceIdentity = String(submittedAt ?? '').trim() || `row:${rowNumber}`;
  return createHash('sha256')
    .update(`${sourceIdentity}\u001f${normalizeLessonStudentId(studentId)}`)
    .digest('hex');
}

export function parseSuspensionApplicationRows(rows, firstRowNumber = 2) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row, index) => {
      const rowNumber = firstRowNumber + index;
      const submittedAt = String(row?.[0] ?? '').trim(); // A列
      const studentId = normalizeLessonStudentId(row?.[7]); // H列
      const suspensionStartDate = String(row?.[11] ?? '').trim(); // L列
      const suspensionEndDate = String(row?.[12] ?? '').trim(); // M列
      const startYearMonth = parseSuspensionYearMonth(suspensionStartDate);
      const endYearMonth = parseSuspensionYearMonth(suspensionEndDate);
      const hasAnyValue = row?.some(value => String(value ?? '').trim() !== '');

      let validationError = null;
      if (!studentId) {
        validationError = '学籍番号が未入力です。';
      } else if (!startYearMonth || !endYearMonth) {
        validationError = '休会開始日または休会終了日を年月として読み取れません。';
      } else if (startYearMonth > endYearMonth) {
        validationError = '休会終了月が休会開始月より前です。';
      }

      return {
        sourceKey: buildSuspensionApplicationKey({ submittedAt, studentId, rowNumber }),
        sourceRowNumber: rowNumber,
        submittedAt,
        studentId,
        suspensionStartDate,
        suspensionEndDate,
        startYearMonth,
        endYearMonth,
        validationError,
        hasAnyValue,
      };
    })
    .filter(record => record.hasAnyValue)
    .map(({ hasAnyValue, ...record }) => record);
}

/**
 * 支払い状況シートの年月ヘッダーから、休会期間に対応する連続セル範囲を作る。
 */
export function buildSuspensionPaymentPlan({
  headerValues,
  startYearMonth,
  endYearMonth,
  firstColumnNumber = 14,
}) {
  const startIndex = headerValues
    .map(parseSalesForecastMonthHeader)
    .indexOf(startYearMonth);
  const endIndex = headerValues
    .map(parseSalesForecastMonthHeader)
    .indexOf(endYearMonth);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error('支払い状況シートに休会期間の年月列がありません。');
  }
  if (endIndex < startIndex) {
    throw new Error('休会終了月が休会開始月より前です。');
  }

  for (let index = startIndex; index <= endIndex; index += 1) {
    const expected = addMonthsToYearMonth(startYearMonth, index - startIndex);
    if (parseSalesForecastMonthHeader(headerValues[index]) !== expected) {
      throw new Error('支払い状況シートの年月列が連続していません。');
    }
  }

  return {
    startYearMonth,
    endYearMonth,
    startColumn: columnNumberToLetter(firstColumnNumber + startIndex),
    endColumn: columnNumberToLetter(firstColumnNumber + endIndex),
    monthCount: endIndex - startIndex + 1,
  };
}

function isNonEmptySheetValue(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== '';
}

/**
 * 月次ヘッダーと生徒行から、最後の有効値の次の6か月を計画する。
 * headerValues/studentRowValues はK列を0番目とする同じ幅の配列。
 */
export function buildSalesForecastExtensionPlan({
  headerValues,
  studentRowValues,
  firstColumnNumber = 11,
}) {
  const monthlyColumns = headerValues
    .map((header, index) => ({
      offset: index,
      columnNumber: firstColumnNumber + index,
      yearMonth: parseSalesForecastMonthHeader(header),
    }))
    .filter(column => column.yearMonth);

  const lastValidColumn = [...monthlyColumns]
    .reverse()
    .find(column => isNonEmptySheetValue(studentRowValues[column.offset]));

  if (!lastValidColumn) {
    throw new Error('対象生徒の月次売上に有効な値がありません。');
  }

  const targetColumns = monthlyColumns
    .filter(column => column.columnNumber > lastValidColumn.columnNumber)
    .slice(0, 6);

  if (targetColumns.length !== 6) {
    throw new Error('売上予測シートに追記先の6か月分の年月列がありません。');
  }

  targetColumns.forEach((column, index) => {
    const expectedColumnNumber = lastValidColumn.columnNumber + index + 1;
    const expectedYearMonth = addMonthsToYearMonth(lastValidColumn.yearMonth, index + 1);
    if (
      column.columnNumber !== expectedColumnNumber
      || column.yearMonth !== expectedYearMonth
    ) {
      throw new Error('売上予測シートの年月列が連続していません。');
    }
  });

  return {
    startYearMonth: targetColumns[0].yearMonth,
    endYearMonth: targetColumns[5].yearMonth,
    startColumn: columnNumberToLetter(targetColumns[0].columnNumber),
    endColumn: columnNumberToLetter(targetColumns[5].columnNumber),
  };
}

function normalizeExtensionPrice(value) {
  return String(value ?? '').replace(/[\s,¥￥]/g, '');
}

function isExtensionPrice(value) {
  return normalizeExtensionPrice(value) === '22000';
}

async function getAutomationSheetsClient() {
  const auth = getAuth();
  if (!auth || 'key' in auth) {
    throw new Error('Google Sheets service account authentication is not configured');
  }
  return google.sheets({ version: 'v4', auth });
}

async function findStudentRowInSheet({
  sheets,
  spreadsheetId = EXAMINATION_AUTOMATION_SPREADSHEET_ID,
  sheetName,
  studentIdColumn,
  firstRowNumber,
  studentId,
}) {
  const escapedSheetName = sheetName.replace(/'/g, "''");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escapedSheetName}'!${studentIdColumn}${firstRowNumber}:${studentIdColumn}`,
  });
  const rowNumber = findStudentRowNumber(
    response.data.values || [],
    studentId,
    firstRowNumber
  );

  if (!rowNumber) {
    throw new Error(`${sheetName}に学籍番号 ${studentId} が見つかりません。`);
  }
  return rowNumber;
}

/**
 * 休会申請フォームの全レコードを、処理済み判定に使える安定キー付きで取得する。
 * キャッシュは使わず、30分同期ごとに新規行を確認する。
 */
export async function fetchSuspensionApplications() {
  const sheets = await getAutomationSheetsClient();
  const escapedSheetName = SUSPENSION_SHEET_NAME.replace(/'/g, "''");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SUSPENSION_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!A2:M`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  return parseSuspensionApplicationRows(response.data.values || []);
}

async function getPaymentStatusHeaders(sheets) {
  const escapedSheetName = PAYMENT_STATUS_SHEET_NAME.replace(/'/g, "''");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: PAYMENT_STATUS_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!${PAYMENT_STATUS_MONTH_START_COLUMN}13:${PAYMENT_STATUS_END_COLUMN}13`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return response.data.values?.[0] || [];
}

/**
 * 学籍番号と休会年月を使い、RAW_支払い状況の該当月へ「休会」を書き込む。
 * values.updateのため、既存の書式・入力規則は保持される。
 */
export async function applySuspensionPaymentStatus({
  studentId,
  startYearMonth,
  endYearMonth,
}) {
  const sheets = await getAutomationSheetsClient();
  const escapedSheetName = PAYMENT_STATUS_SHEET_NAME.replace(/'/g, "''");
  const firstColumnNumber = columnLetterToNumber(PAYMENT_STATUS_MONTH_START_COLUMN);
  if (!firstColumnNumber) {
    throw new Error('支払い状況シートの月次開始列設定が不正です。');
  }

  const [rowNumber, headerValues] = await Promise.all([
    findStudentRowInSheet({
      sheets,
      spreadsheetId: PAYMENT_STATUS_SPREADSHEET_ID,
      sheetName: PAYMENT_STATUS_SHEET_NAME,
      studentIdColumn: 'D',
      firstRowNumber: 14,
      studentId,
    }),
    getPaymentStatusHeaders(sheets),
  ]);
  const plan = buildSuspensionPaymentPlan({
    headerValues,
    startYearMonth,
    endYearMonth,
    firstColumnNumber,
  });
  const targetRange = `'${escapedSheetName}'!${plan.startColumn}${rowNumber}:${plan.endColumn}${rowNumber}`;
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: PAYMENT_STATUS_SPREADSHEET_ID,
    range: targetRange,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const currentValues = currentResponse.data.values?.[0] || [];
  const alreadyApplied = Array.from(
    { length: plan.monthCount },
    (_, index) => String(currentValues[index] ?? '').trim() === '休会'
  ).every(Boolean);

  if (!alreadyApplied) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: PAYMENT_STATUS_SPREADSHEET_ID,
      range: targetRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [Array(plan.monthCount).fill('休会')] },
    });
  }

  const verifyResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: PAYMENT_STATUS_SPREADSHEET_ID,
    range: targetRange,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const verifiedValues = verifyResponse.data.values?.[0] || [];
  const verified = Array.from(
    { length: plan.monthCount },
    (_, index) => String(verifiedValues[index] ?? '').trim() === '休会'
  ).every(Boolean);
  if (!verified) {
    throw new Error('支払い状況シートへの休会反映結果を確認できませんでした。');
  }

  return {
    ...plan,
    rowNumber,
    range: targetRange,
    alreadyApplied,
  };
}

async function getSalesForecastHeaders(sheets) {
  const escapedSheetName = SALES_FORECAST_SHEET_NAME.replace(/'/g, "''");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!K1:${SALES_FORECAST_END_COLUMN}1`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return response.data.values?.[0] || [];
}

export async function planSalesForecastExtension(studentId) {
  const sheets = await getAutomationSheetsClient();
  const escapedSheetName = SALES_FORECAST_SHEET_NAME.replace(/'/g, "''");
  const [rowNumber, headerValues] = await Promise.all([
    findStudentRowInSheet({
      sheets,
      sheetName: SALES_FORECAST_SHEET_NAME,
      studentIdColumn: 'A',
      firstRowNumber: 9,
      studentId,
    }),
    getSalesForecastHeaders(sheets),
  ]);
  const rowResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!K${rowNumber}:${SALES_FORECAST_END_COLUMN}${rowNumber}`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  return buildSalesForecastExtensionPlan({
    headerValues,
    studentRowValues: rowResponse.data.values?.[0] || [],
  });
}

export async function applySalesForecastExtensionPlan({
  studentId,
  startYearMonth,
  endYearMonth,
}) {
  const sheets = await getAutomationSheetsClient();
  const escapedSheetName = SALES_FORECAST_SHEET_NAME.replace(/'/g, "''");
  const [rowNumber, headerValues] = await Promise.all([
    findStudentRowInSheet({
      sheets,
      sheetName: SALES_FORECAST_SHEET_NAME,
      studentIdColumn: 'A',
      firstRowNumber: 9,
      studentId,
    }),
    getSalesForecastHeaders(sheets),
  ]);
  const parsedHeaders = headerValues.map(parseSalesForecastMonthHeader);
  const startOffset = parsedHeaders.indexOf(startYearMonth);
  const endOffset = parsedHeaders.indexOf(endYearMonth);

  if (startOffset < 0 || endOffset !== startOffset + 5) {
    throw new Error('保存済みの追記対象月が売上予測シートで確認できません。');
  }
  for (let index = 0; index < 6; index += 1) {
    if (parsedHeaders[startOffset + index] !== addMonthsToYearMonth(startYearMonth, index)) {
      throw new Error('保存済みの追記対象月が連続していません。');
    }
  }

  const startColumn = columnNumberToLetter(11 + startOffset);
  const endColumn = columnNumberToLetter(11 + endOffset);
  const targetRange = `'${escapedSheetName}'!${startColumn}${rowNumber}:${endColumn}${rowNumber}`;
  const currentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
    range: targetRange,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const currentValues = currentResponse.data.values?.[0] || [];
  const hasConflict = Array.from({ length: 6 }, (_, index) => currentValues[index])
    .some(value => isNonEmptySheetValue(value) && !isExtensionPrice(value));

  if (hasConflict) {
    throw new Error('売上予測シートの追記予定範囲に別の値が入っています。');
  }

  if (!Array.from({ length: 6 }, (_, index) => currentValues[index]).every(isExtensionPrice)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
      range: targetRange,
      valueInputOption: 'RAW',
      requestBody: { values: [Array(6).fill('22,000')] },
    });
  }

  const verifyResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
    range: targetRange,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const verifiedValues = verifyResponse.data.values?.[0] || [];
  if (!Array.from({ length: 6 }, (_, index) => verifiedValues[index]).every(isExtensionPrice)) {
    throw new Error('売上予測シートへの追記結果を確認できませんでした。');
  }

  return { startYearMonth, endYearMonth, range: targetRange };
}

export async function getExtensionAgreementStudentChatDestination(studentId) {
  const sheets = await getAutomationSheetsClient();
  const escapedSheetName = STUDENT_INFO_SHEET_NAME.replace(/'/g, "''");
  const rowNumber = await findStudentRowInSheet({
    sheets,
    sheetName: STUDENT_INFO_SHEET_NAME,
    studentIdColumn: 'B',
    firstRowNumber: 2,
    studentId,
  });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: EXAMINATION_AUTOMATION_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!M${rowNumber}`,
  });
  const chatUrl = String(response.data.values?.[0]?.[0] ?? '').trim();

  if (!chatUrl) {
    throw new Error('生徒情報シートのチャットURLが未設定です。');
  }
  return { chatUrl };
}

function createStudentDiscordDestinationError(message) {
  const error = new Error(message);
  error.isStudentDiscordDestinationError = true;
  return error;
}

/**
 * 強制退会申請時に使う生徒様向けDiscord通知先を取得する。
 * B列だけを検索し、一致行のG列とL列のみを追加取得する。
 */
export async function getForcedWithdrawalStudentDiscordDestination(studentId) {
  const auth = getAuth();
  if (!auth) {
    throw new Error('Google Sheets authentication is not configured');
  }

  const sheets = google.sheets({ version: 'v4', auth });
  const escapedSheetName = FORCED_WITHDRAWAL_STUDENT_SHEET_NAME.replace(/'/g, "''");
  const studentIdResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: FORCED_WITHDRAWAL_STUDENT_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!B2:B`,
  });
  const rowNumber = findForcedWithdrawalStudentInfoRow(
    studentIdResponse.data.values || [],
    studentId
  );

  if (!rowNumber) {
    throw createStudentDiscordDestinationError(
      '生徒情報シートに該当する学籍番号が見つかりません。'
    );
  }

  const destinationResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: FORCED_WITHDRAWAL_STUDENT_SPREADSHEET_ID,
    range: `'${escapedSheetName}'!G${rowNumber}:L${rowNumber}`,
  });
  const destinationRow = destinationResponse.data.values?.[0] || [];
  const discordUserId = String(destinationRow[0] ?? '').trim(); // G列
  const webhookUrl = String(destinationRow[5] ?? '').trim(); // L列

  if (!discordUserId) {
    throw createStudentDiscordDestinationError(
      '生徒情報シートのDiscord IDが未設定です。'
    );
  }
  if (!webhookUrl) {
    throw createStudentDiscordDestinationError(
      '生徒情報シートのお支払い_WHが未設定です。'
    );
  }

  return { discordUserId, webhookUrl };
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
 * H列: 学籍番号、K列: 休会期間、L列: 休会開始日、M列: 休会終了日
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
