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
    
    const firstSheetId = spreadsheet.data.sheets[0].properties.sheetId;
    const firstSheetTitle = spreadsheet.data.sheets[0].properties.title;
    
    // 初期データを書き込み
    await initializeKPISheet(spreadsheetId, firstSheetTitle);
    
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
      ['項目名'], // A1
      ['延長審査1回目_対象数'],
      ['延長審査1回目_延長数'],
      ['延長審査1回目_延長率(%)'],
      ['延長審査2回目_対象数'],
      ['延長審査2回目_延長数'],
      ['延長審査2回目_延長率(%)'],
      ['Proプラン成約率(%)'],
    ];

    // シート名を指定してデータを書き込み
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1:A8`,
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
          }
        ]
      }
    });
    
    console.log('✅ Created 3 charts on chart sheet');
  } catch (error) {
    console.error('❌ Error creating chart sheet:', error);
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
      range: '1:1', // 1行目のヘッダー行を取得（デフォルトシート）
    });

    const existingHeaders = response.data.values?.[0] || ['項目名'];
    const nextColumn = String.fromCharCode(65 + existingHeaders.length); // A=65, B=66, ...

    console.log(`📊 Adding KPI data to column ${nextColumn} (${monthLabel})`);

    // データを整形（パーセンテージは小数点以下2桁に丸める）
    const values = [
      [monthLabel], // ヘッダー
      [kpiData.exam1stTargetCount || 0],
      [kpiData.exam1stExtensionCount || 0],
      [Math.round((kpiData.exam1stExtensionRate || 0) * 100) / 100], // 小数点以下2桁
      [kpiData.exam2ndTargetCount || 0],
      [kpiData.exam2ndExtensionCount || 0],
      [Math.round((kpiData.exam2ndExtensionRate || 0) * 100) / 100], // 小数点以下2桁
      [Math.round((kpiData.proPlanSuccessRate || 0) * 100) / 100], // 小数点以下2桁
    ];

    // データを書き込み（デフォルトシート）
    // USER_ENTEREDを使用して、数値は数値として解釈される
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${nextColumn}1:${nextColumn}8`,
      valueInputOption: 'USER_ENTERED',
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
