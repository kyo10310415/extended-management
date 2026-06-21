import express from 'express';
import { pool } from '../index.js';
import { calculateKPIData } from './kpi-export.js';

const router = express.Router();

/**
 * POST /api/kpi-snapshots/save
 * 現在のKPIデータをDBにスナップショットとして保存（月1回・上書き可）
 * Body: { monthOffset?: number, overwrite?: boolean }
 */
router.post('/save', async (req, res) => {
  try {
    const { monthOffset = 0, overwrite = false } = req.body;

    // 対象年月を決定
    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + monthOffset);
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}-${month}`;
    const monthLabel = `${year}年${month}月`;

    // 既存チェック
    const existing = await pool.query(
      'SELECT id FROM kpi_monthly_snapshots WHERE year_month = $1',
      [yearMonth]
    );

    if (existing.rows.length > 0 && !overwrite) {
      return res.status(409).json({
        success: false,
        alreadyExists: true,
        yearMonth,
        monthLabel,
        message: `${monthLabel}のスナップショットは既に存在します。上書きする場合は overwrite: true を指定してください。`,
      });
    }

    console.log(`📸 Saving KPI snapshot for ${monthLabel} (monthOffset: ${monthOffset})...`);

    // KPIデータを計算
    const kpiData = await calculateKPIData(monthOffset);
    const { tutorKpi, ...snapshotData } = kpiData;

    // UPSERT
    await pool.query(
      `INSERT INTO kpi_monthly_snapshots (year_month, month_label, snapshot_data, tutor_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (year_month) DO UPDATE SET
         snapshot_data = EXCLUDED.snapshot_data,
         tutor_data = EXCLUDED.tutor_data,
         created_at = CURRENT_TIMESTAMP`,
      [yearMonth, monthLabel, JSON.stringify(snapshotData), JSON.stringify(tutorKpi || [])]
    );

    console.log(`✅ KPI snapshot saved for ${monthLabel}`);

    res.json({
      success: true,
      yearMonth,
      monthLabel,
      snapshotData,
      tutorKpi,
    });
  } catch (error) {
    console.error('Error saving KPI snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/kpi-snapshots/list
 * 保存済みスナップショットの年月一覧を取得
 */
router.get('/list', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT year_month, month_label, created_at
       FROM kpi_monthly_snapshots
       ORDER BY year_month DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error listing KPI snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/kpi-snapshots/:yearMonth
 * 特定月のスナップショットを取得（例: 2026-05）
 */
router.get('/:yearMonth', async (req, res) => {
  try {
    const { yearMonth } = req.params;
    const result = await pool.query(
      'SELECT * FROM kpi_monthly_snapshots WHERE year_month = $1',
      [yearMonth]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Snapshot not found' });
    }
    const row = result.rows[0];
    res.json({
      success: true,
      data: {
        yearMonth: row.year_month,
        monthLabel: row.month_label,
        snapshotData: row.snapshot_data,
        tutorKpi: row.tutor_data,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching KPI snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/kpi-snapshots
 * 全スナップショットデータを取得（グラフ用）
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT year_month, month_label, snapshot_data, tutor_data, created_at
       FROM kpi_monthly_snapshots
       ORDER BY year_month ASC`
    );
    res.json({
      success: true,
      data: result.rows.map(row => ({
        yearMonth: row.year_month,
        monthLabel: row.month_label,
        snapshotData: row.snapshot_data,
        tutorKpi: row.tutor_data,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching all KPI snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
