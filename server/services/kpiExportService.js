import { google } from 'googleapis';
import { Gaxios } from 'gaxios';
import dotenv from 'dotenv';

dotenv.config();

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
        // globalThis.fetch ベースのカスタムトランスポーターを
        // clientOptions 経由で JWT クライアントに渡す
        // → OAuth2 トークン取得・Sheets API リクエスト両方に適用される
        clientOptions: { transporter: customTransporter },
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
 * 既存のスプレッドシートにKPI項目を初期化
 * 新規作成ではなく、既存のスプレッドシートを使用する方式に変更
 */
export async function setupKPISpreadsheet(spreadsheetId) {
  try {
    console.log(`📊 Setting up KPI spreadsheet: ${spreadsheetId}`);
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    // スプレッドシートの情報を取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const firstSheet = spreadsheet.data.sheets[0];
    const firstSheetId = firstSheet.properties.sheetId;
    const firstSheetTitle = firstSheet.properties.title;
    
    // 初期データを書き込み
    await ensureExtendedKpiRows(spreadsheetId, sheets, firstSheet);
    
    // グラフシートを作成
    await createChartSheet(spreadsheetId, sheets, firstSheetId, firstSheetTitle);

    return {
      success: true,
      spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      message: 'KPI項目の初期化とグラフシートの作成が完了しました',
    };
  } catch (error) {
    console.error('❌ Error setting up KPI spreadsheet:', error);
    throw error;
  }
}

/**
 * KPIシートの初期化（項目名を設定）
 */
async function initializeKPISheet(spreadsheetId, sheetTitle) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // A列に項目名を設定
    const values = [
      ['項目名'],                     // A1
      ['延長審査1回目_対象数'],       // A2
      ['延長審査1回目_延長数'],       // A3
      ['延長審査1回目_退会数'],       // A4 ★追加
      ['延長審査1回目_延長率(%)'],    // A5
      ['延長審査2回目_対象数'],       // A6
      ['延長審査2回目_延長数'],       // A7
      ['延長審査2回目_退会数'],       // A8 ★追加
      ['延長審査2回目_延長率(%)'],    // A9
      ['延長審査3回目_対象数'],       // A10 ★追加
      ['延長審査3回目_延長数'],       // A11 ★追加
      ['延長審査3回目_永久会員数'],   // A12 ★追加（退会に相当）
      ['延長審査3回目_延長率(%)'],    // A13 ★追加
      ['延長審査4回目_対象数'],
      ['延長審査4回目_延長数'],
      ['延長審査4回目_永久会員数'],
      ['延長審査4回目_延長率(%)'],
      ['延長審査5回目_対象数'],
      ['延長審査5回目_延長数'],
      ['延長審査5回目_永久会員数'],
      ['延長審査5回目_延長率(%)'],
      ['延長審査6回目_対象数'],
      ['延長審査6回目_延長数'],
      ['延長審査6回目_永久会員数'],
      ['延長審査6回目_延長率(%)'],
      ['Proプラン成約率(%)'],
      ['延長率（対 審査対象）(%)'],
    ];

    // シート名を指定してデータを書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1:A27`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });

    console.log('✅ Initialized KPI sheet with item names');
  } catch (error) {
    console.error('❌ Error initializing KPI sheet:', error);
    throw error;
  }
}

async function ensureExtendedKpiRows(spreadsheetId, sheets, dataSheet) {
  const sheetTitle = dataSheet.properties.title;
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetTitle}!A1:A27`,
  });
  const labels = (current.data.values || []).map(row => row[0] || '');

  // 旧形式ではPro成約率が14行目。そこへ12行挿入し、既存月次データを保持する。
  if (labels[13] === 'Proプラン成約率(%)') {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: {
              sheetId: dataSheet.properties.sheetId,
              dimension: 'ROWS',
              startIndex: 13,
              endIndex: 25,
            },
            inheritFromBefore: true,
          },
        }],
      },
    });
  }

  await initializeKPISheet(spreadsheetId, sheetTitle);
}

function columnNumberToA1(columnNumber) {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

/**
 * グラフシートを確認し、存在しなければ作成
 */
async function ensureChartSheet(spreadsheetId, sheets, dataSheetId, dataSheetTitle) {
  try {
    // スプレッドシート情報を取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    // 「グラフ」シートが既に存在するか確認
    const chartSheet = spreadsheet.data.sheets.find(
      sheet => sheet.properties.title === 'グラフ'
    );

    if (chartSheet) {
      console.log('📊 Chart sheet already exists, skipping creation');
      return;
    }

    console.log('📊 Creating chart sheet...');
    await createChartSheet(spreadsheetId, sheets, dataSheetId, dataSheetTitle);
  } catch (error) {
    console.error('❌ Error ensuring chart sheet:', error);
    // エラーでも処理を継続（グラフ作成失敗してもデータ追加は成功とする）
  }
}

/**
 * グラフシートを作成
 */
async function createChartSheet(spreadsheetId, sheets, dataSheetId, dataSheetTitle) {
  try {
    console.log('📊 Creating chart sheet...');
    
    // 新しいシート「グラフ」を追加
    const addSheetResponse = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: 'グラフ',
                gridProperties: {
                  rowCount: 100,
                  columnCount: 10,
                }
              }
            }
          }
        ]
      }
    });
    
    const chartSheetId = addSheetResponse.data.replies[0].addSheet.properties.sheetId;
    console.log(`✅ Created chart sheet with ID: ${chartSheetId}`);
    
    // 3つのグラフを作成
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // グラフ1: 延長審査1回目_延長率(%)
          {
            addChart: {
              chart: {
                spec: {
                  title: '延長審査1回目 延長率推移',
                  basicChart: {
                    chartType: 'LINE',
                    legendPosition: 'BOTTOM_LEGEND',
                    axis: [
                      {
                        position: 'BOTTOM_AXIS',
                        title: '月'
                      },
                      {
                        position: 'LEFT_AXIS',
                        title: '延長率(%)'
                      }
                    ],
                    domains: [
                      {
                        domain: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 1,
                                endColumnIndex: 100 // 動的に拡張可能
                              }
                            ]
                          }
                        }
                      }
                    ],
                    series: [
                      {
                        series: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 3, // 4行目（延長審査1回目_延長率）
                                endRowIndex: 4,
                                startColumnIndex: 1,
                                endColumnIndex: 100 // 動的に拡張可能
                              }
                            ]
                          }
                        },
                        targetAxis: 'LEFT_AXIS'
                      }
                    ],
                    headerCount: 1
                  }
                },
                position: {
                  overlayPosition: {
                    anchorCell: {
                      sheetId: chartSheetId,
                      rowIndex: 0,
                      columnIndex: 0
                    }
                  }
                }
              }
            }
          },
          // グラフ2: 延長審査2回目_延長率(%)
          {
            addChart: {
              chart: {
                spec: {
                  title: '延長審査2回目 延長率推移',
                  basicChart: {
                    chartType: 'LINE',
                    legendPosition: 'BOTTOM_LEGEND',
                    axis: [
                      {
                        position: 'BOTTOM_AXIS',
                        title: '月'
                      },
                      {
                        position: 'LEFT_AXIS',
                        title: '延長率(%)'
                      }
                    ],
                    domains: [
                      {
                        domain: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        }
                      }
                    ],
                    series: [
                      {
                        series: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 6, // 7行目（延長審査2回目_延長率）
                                endRowIndex: 7,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        },
                        targetAxis: 'LEFT_AXIS'
                      }
                    ],
                    headerCount: 1
                  }
                },
                position: {
                  overlayPosition: {
                    anchorCell: {
                      sheetId: chartSheetId,
                      rowIndex: 0,
                      columnIndex: 6
                    }
                  }
                }
              }
            }
          },
          // グラフ3: Proプラン成約率(%)
          {
            addChart: {
              chart: {
                spec: {
                  title: 'Proプラン成約率推移',
                  basicChart: {
                    chartType: 'LINE',
                    legendPosition: 'BOTTOM_LEGEND',
                    axis: [
                      {
                        position: 'BOTTOM_AXIS',
                        title: '月'
                      },
                      {
                        position: 'LEFT_AXIS',
                        title: '成約率(%)'
                      }
                    ],
                    domains: [
                      {
                        domain: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        }
                      }
                    ],
                    series: [
                      {
                        series: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 7, // 8行目（Proプラン成約率）
                                endRowIndex: 8,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        },
                        targetAxis: 'LEFT_AXIS'
                      }
                    ],
                    headerCount: 1
                  }
                },
                position: {
                  overlayPosition: {
                    anchorCell: {
                      sheetId: chartSheetId,
                      rowIndex: 20,
                      columnIndex: 0
                    }
                  }
                }
              }
            }
          },
          // グラフ4: 延長率（対 審査対象）(%)
          {
            addChart: {
              chart: {
                spec: {
                  title: '延長率（対 審査対象）推移',
                  basicChart: {
                    chartType: 'LINE',
                    legendPosition: 'BOTTOM_LEGEND',
                    axis: [
                      {
                        position: 'BOTTOM_AXIS',
                        title: '月'
                      },
                      {
                        position: 'LEFT_AXIS',
                        title: '延長率(%)'
                      }
                    ],
                    domains: [
                      {
                        domain: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        }
                      }
                    ],
                    series: [
                      {
                        series: {
                          sourceRange: {
                            sources: [
                              {
                                sheetId: dataSheetId,
                                startRowIndex: 8, // 9行目（延長率（対 審査対象））
                                endRowIndex: 9,
                                startColumnIndex: 1,
                                endColumnIndex: 100
                              }
                            ]
                          }
                        },
                        targetAxis: 'LEFT_AXIS'
                      }
                    ],
                    headerCount: 1
                  }
                },
                position: {
                  overlayPosition: {
                    anchorCell: {
                      sheetId: chartSheetId,
                      rowIndex: 20,
                      columnIndex: 6
                    }
                  }
                }
              }
            }
          }
        ]
      }
    });
    
    console.log('✅ Created 4 charts on chart sheet');
  } catch (error) {
    console.error('❌ Error creating chart sheet:', error);
    throw error;
  }
}

/**
 * KPIデータを月次列として追加
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {object} kpiData - KPIデータオブジェクト
 * @param {number} monthOffset - 0: 今月（デフォルト）, -1: 先月
 */
export async function appendMonthlyKPI(spreadsheetId, kpiData, monthOffset = 0) {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // スプレッドシート情報を取得
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    const dataSheet = spreadsheet.data.sheets[0];
    const dataSheetId = dataSheet.properties.sheetId;
    const dataSheetTitle = dataSheet.properties.title;

    await ensureExtendedKpiRows(spreadsheetId, sheets, dataSheet);

    // 対象月を取得（monthOffset 分ずらす）
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const monthLabel = `${year}年${month}月`;

    // 既存のデータ範囲を取得して、次の列を特定
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${dataSheetTitle}!1:1`, // 1行目のヘッダー行を取得
    });

    const existingHeaders = response.data.values?.[0] || ['項目名'];
    const nextColumn = columnNumberToA1(existingHeaders.length + 1);

    console.log(`📊 Adding KPI data to column ${nextColumn} (${monthLabel})`);

    // データを整形（パーセンテージは小数点以下2桁に丸める）
    const values = [
      [monthLabel],                                                               // 1行: ヘッダー
      [kpiData.exam1stTargetCount || 0],                                          // 2行: 1回目_対象数
      [kpiData.exam1stExtensionCount || 0],                                       // 3行: 1回目_延長数
      [kpiData.exam1stWithdrawalCount || 0],                                      // 4行: 1回目_退会数 ★
      [Math.round((kpiData.exam1stExtensionRate || 0) * 100) / 100],              // 5行: 1回目_延長率
      [kpiData.exam2ndTargetCount || 0],                                          // 6行: 2回目_対象数
      [kpiData.exam2ndExtensionCount || 0],                                       // 7行: 2回目_延長数
      [kpiData.exam2ndWithdrawalCount || 0],                                      // 8行: 2回目_退会数 ★
      [Math.round((kpiData.exam2ndExtensionRate || 0) * 100) / 100],              // 9行: 2回目_延長率
      [kpiData.exam3rdTargetCount || 0],                                          // 10行: 3回目_対象数 ★
      [kpiData.exam3rdExtensionCount || 0],                                       // 11行: 3回目_延長数 ★
      [kpiData.exam3rdLifetimeCount || 0],                                        // 12行: 3回目_永久会員数 ★
      [Math.round((kpiData.exam3rdExtensionRate || 0) * 100) / 100],              // 13行: 3回目_延長率 ★
      ...[4, 5, 6].flatMap(cycle => [
        [kpiData[`exam${cycle}thTargetCount`] || 0],
        [kpiData[`exam${cycle}thExtensionCount`] || 0],
        [kpiData[`exam${cycle}thLifetimeCount`] || 0],
        [Math.round((kpiData[`exam${cycle}thExtensionRate`] || 0) * 100) / 100],
      ]),
      [Math.round((kpiData.proPlanSuccessRate || 0) * 100) / 100],
      [Math.round((kpiData.overallExtensionRate || 0) * 100) / 100],
    ];

    // データを書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${dataSheetTitle}!${nextColumn}1:${nextColumn}27`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log(`✅ Added KPI data for ${monthLabel} to column ${nextColumn}`);

    // グラフシートを確認・作成
    await ensureChartSheet(spreadsheetId, sheets, dataSheetId, dataSheetTitle);

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
 * @param {number} overallExtensionRate - 延長率（対 審査対象）
 */
export function formatKPIData(data) {
  return { ...data };
}
