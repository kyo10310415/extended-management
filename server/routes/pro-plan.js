import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

/**
 * GET /api/pro-plan/:studentId
 * 特定の生徒のProプラン管理データを取得
 */
router.get('/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM pro_plan_management WHERE student_id = $1',
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    const row = result.rows[0];
    
    const data = {
      student_id: row.student_id,
      pro_plan_start_date: row.pro_plan_start_date,
      pro_plan_enabled: row.pro_plan_enabled,
      notes: row.notes,
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching pro plan data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/pro-plan/:studentId
 * 生徒のProプラン管理データを作成または更新
 */
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const { pro_plan_start_date, pro_plan_enabled, notes } = req.body;
  
  console.log('📝 POST /api/pro-plan/:studentId');
  console.log('  学籍番号:', studentId);
  console.log('  データ:', { pro_plan_start_date, pro_plan_enabled, notes });

  try {
    const result = await pool.query(
      `INSERT INTO pro_plan_management (student_id, pro_plan_start_date, pro_plan_enabled, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id)
       DO UPDATE SET
         pro_plan_start_date = EXCLUDED.pro_plan_start_date,
         pro_plan_enabled = EXCLUDED.pro_plan_enabled,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, pro_plan_start_date, pro_plan_enabled, notes]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving pro plan data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/pro-plan/bulk
 * 複数の生徒のProプラン管理データを一括取得
 */
router.post('/bulk', async (req, res) => {
  const { studentIds } = req.body;

  console.log('📦 POST /api/pro-plan/bulk');
  console.log('  生徒数:', studentIds?.length);

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'studentIds must be a non-empty array',
    });
  }

  try {
    const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT * FROM pro_plan_management WHERE student_id IN (${placeholders})`,
      studentIds
    );

    console.log('  取得件数:', result.rows.length);

    // 学籍番号をキーとしたマップに変換
    const proPlanMap = {};
    result.rows.forEach(row => {
      proPlanMap[row.student_id] = {
        student_id: row.student_id,
        pro_plan_start_date: row.pro_plan_start_date,
        pro_plan_enabled: row.pro_plan_enabled,
        notes: row.notes,
        updated_at: row.updated_at,
        created_at: row.created_at,
      };
    });

    console.log('  ✅ 一括取得成功');

    res.json({
      success: true,
      data: proPlanMap,
    });
  } catch (error) {
    console.error('  ❌ 一括取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
