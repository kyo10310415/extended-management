import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

/**
 * GET /api/students/:studentId
 * 特定の生徒の延長管理データを取得
 */
router.get('/:studentId', async (req, res) => {
  const { studentId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM student_extensions WHERE student_id = $1',
      [studentId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error fetching student extension data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/students/:studentId
 * 生徒の延長管理データを作成または更新
 */
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const { extension_certainty, hearing_status, examination_result, notes } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO student_extensions 
        (student_id, extension_certainty, hearing_status, examination_result, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (student_id) 
       DO UPDATE SET
         extension_certainty = EXCLUDED.extension_certainty,
         hearing_status = EXCLUDED.hearing_status,
         examination_result = EXCLUDED.examination_result,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, extension_certainty, hearing_status, examination_result, notes]
    );

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error saving student extension data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/students/bulk/:studentIds
 * 複数の生徒の延長管理データを一括取得
 */
router.post('/bulk', async (req, res) => {
  const { studentIds } = req.body;

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'studentIds must be a non-empty array',
    });
  }

  try {
    const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT * FROM student_extensions WHERE student_id IN (${placeholders})`,
      studentIds
    );

    // 学籍番号をキーとしたマップに変換
    const extensionMap = {};
    result.rows.forEach(row => {
      extensionMap[row.student_id] = row;
    });

    res.json({
      success: true,
      data: extensionMap,
    });
  } catch (error) {
    console.error('Error fetching bulk student extension data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
