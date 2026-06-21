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

/**
 * POST /api/kpi-snapshots/import-csv
 * CSVテキストを解析して複数月のスナップショットを一括インポート
 * Body: { csvText: string, overwrite?: boolean }
 *
 * CSVフォーマット（スプレッドシート書き出し形式）:
 *   1行目: 項目名, 平均, 2026年02月, 2026年03月, ...
 *   2行目: 延長審査1回目_対象数, ...
 *   ...
 *   15行目: 延長率（対 審査対象）(%), ...
 */
router.post('/import-csv', async (req, res) => {
  try {
    const { csvText, overwrite = false } = req.body;
    if (!csvText) {
      return res.status(400).json({ success: false, error: 'csvText is required' });
    }

    // --- CSV / TSV 自動判定パース ---
    // スプレッドシートからコピーした場合はタブ区切り、CSVファイルはカンマ区切り
    const rawLines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
    const delimiter = rawLines[0]?.includes('\t') ? '\t' : ',';
    const lines = rawLines
      .map(l => l.split(delimiter))
      .filter(cols => cols.length >= 2);

    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSVデータが不足しています（最低2行必要）' });
    }

    // 1行目: ヘッダー（列0=項目名, 列1=平均, 列2以降=各月）
    const headerRow = lines[0];
    // 月ラベル一覧（列2以降）例: ["2026年02月", "2026年03月", ...]
    const monthLabels = headerRow.slice(2).map(s => s.trim()).filter(Boolean);

    if (monthLabels.length === 0) {
      return res.status(400).json({ success: false, error: '月列が見つかりません（3列目以降に「YYYY年MM月」形式で記載してください）' });
    }

    // 行インデックスと snapshotData キーの対応（CSVの項目名で照合）
    const KEY_MAP = {
      '延長審査1回目_対象数':       'exam1stTargetCount',
      '延長審査1回目_延長数':       'exam1stExtensionCount',
      '延長審査1回目_退会数':       'exam1stWithdrawalCount',
      '延長審査1回目_延長率(%)':    'exam1stExtensionRate',
      '延長審査2回目_対象数':       'exam2ndTargetCount',
      '延長審査2回目_延長数':       'exam2ndExtensionCount',
      '延長審査2回目_退会数':       'exam2ndWithdrawalCount',
      '延長審査2回目_延長率(%)':    'exam2ndExtensionRate',
      '延長審査3回目_対象数':       'exam3rdTargetCount',
      '延長審査3回目_延長数':       'exam3rdExtensionCount',
      '延長審査3回目_永久会員数':   'exam3rdLifetimeCount',
      '延長審査3回目_延長率(%)':    'exam3rdExtensionRate',
      'Proプラン成約率(%)':         'proPlanSuccessRate',
      '延長率（対 審査対象）(%)':   'overallExtensionRate',
    };

    // 月ラベル → yearMonth 変換 (例: "2026年02月" → "2026-02")
    const labelToYearMonth = (label) => {
      const m = label.match(/(\d{4})年(\d{2})月/);
      if (!m) return null;
      return `${m[1]}-${m[2]}`;
    };

    // 月ごとに snapshotData を構築
    const monthDataList = monthLabels.map(label => ({
      yearMonth: labelToYearMonth(label),
      monthLabel: label,
      snapshotData: {},
    }));

    // 各データ行を処理（ヘッダー行をスキップ）
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i];
      const itemName = (cols[0] || '').trim();
      const key = KEY_MAP[itemName];
      if (!key) continue; // 平均行など不要行はスキップ

      // 各月の値を格納（列2以降）
      monthLabels.forEach((_, mi) => {
        const rawVal = (cols[mi + 2] || '').trim().replace('%', '');
        const numVal = rawVal === '' ? null : parseFloat(rawVal);
        monthDataList[mi].snapshotData[key] = numVal;
      });
    }

    // --- DB UPSERT ---
    const results = [];
    const skipped = [];

    for (const item of monthDataList) {
      if (!item.yearMonth) {
        skipped.push({ monthLabel: item.monthLabel, reason: '年月フォーマット不正' });
        continue;
      }

      // 既存チェック
      const existing = await pool.query(
        'SELECT id FROM kpi_monthly_snapshots WHERE year_month = $1',
        [item.yearMonth]
      );
      if (existing.rows.length > 0 && !overwrite) {
        skipped.push({ yearMonth: item.yearMonth, monthLabel: item.monthLabel, reason: '既存データあり（overwrite:true で上書き可）' });
        continue;
      }

      await pool.query(
        `INSERT INTO kpi_monthly_snapshots (year_month, month_label, snapshot_data, tutor_data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (year_month) DO UPDATE SET
           snapshot_data = EXCLUDED.snapshot_data,
           created_at    = CURRENT_TIMESTAMP`,
        [item.yearMonth, item.monthLabel, JSON.stringify(item.snapshotData), JSON.stringify([])]
      );

      console.log(`✅ CSV import: snapshot saved for ${item.monthLabel}`);
      results.push({ yearMonth: item.yearMonth, monthLabel: item.monthLabel });
    }

    res.json({
      success: true,
      imported: results,
      skipped,
      message: `${results.length}件インポート完了${skipped.length > 0 ? `、${skipped.length}件スキップ` : ''}`,
    });
  } catch (error) {
    console.error('Error importing CSV snapshot:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
