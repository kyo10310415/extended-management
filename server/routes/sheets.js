import express from 'express';
import { exportStudentsToSheet } from '../services/googleSheetsService.js';

const router = express.Router();

/**
 * POST /api/sheets/export
 * 生徒情報をGoogle Sheetsにエクスポート
 */
router.post('/export', async (req, res) => {
  try {
    console.log('📊 Export to Google Sheets request received');

    const result = await exportStudentsToSheet();

    res.json({
      success: true,
      message: `${result.rowCount}件の生徒情報をスプレッドシートに出力しました`,
      spreadsheetUrl: result.spreadsheetUrl,
      spreadsheetId: result.spreadsheetId,
      rowCount: result.rowCount,
    });
  } catch (error) {
    console.error('Error in /api/sheets/export:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
