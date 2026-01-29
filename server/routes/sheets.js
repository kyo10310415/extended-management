import express from 'express';
import { exportStudentsToCSV } from '../services/googleSheetsService.js';

const router = express.Router();

/**
 * POST /api/sheets/export
 * 生徒情報をCSV形式でエクスポート
 */
router.post('/export', async (req, res) => {
  try {
    console.log('📊 CSV export request received');

    const result = await exportStudentsToCSV();

    // CSVファイルとしてレスポンス
    const filename = `生徒マスタ_${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    
    // UTF-8 BOM を追加（Excelで正しく開くため）
    res.write('\ufeff');
    res.write(result.csvContent);
    res.end();

    console.log(`✅ CSV export completed: ${result.rowCount} rows`);
  } catch (error) {
    console.error('Error in /api/sheets/export:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
