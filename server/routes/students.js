import express from 'express';
import { pool } from '../index.js';

const router = express.Router();

/**
 * サイクル（1回目/2回目/3回目）を判定
 * @param {number} monthsElapsed - 継続月数
 * @returns {number} - 1, 2, or 3
 */
function determineCycle(monthsElapsed) {
  // 4ヶ月目・5ヶ月目 → 1回目
  // 10ヶ月目・11ヶ月目 → 2回目
  // 16ヶ月目・17ヶ月目 → 3回目（Proプラン）
  if (monthsElapsed === 4 || monthsElapsed === 5) {
    return 1;
  } else if (monthsElapsed === 10 || monthsElapsed === 11) {
    return 2;
  } else if (monthsElapsed === 16 || monthsElapsed === 17) {
    return 3;
  }
  // デフォルトは1回目
  return 1;
}

/**
 * POST /api/students/bulk
 * 複数の生徒の延長管理データを一括取得
 * @body {Array} studentIds - 学籍番号の配列
 * @body {number} cycle - サイクル（1, 2, or 3）
 * 
 * 重要: このルートは /:studentId より前に定義する必要がある
 */
router.post('/bulk', async (req, res) => {
  const { studentIds, cycle } = req.body;
  const cycleNumber = cycle || 1;

  console.log('📦 POST /api/students/bulk');
  console.log('  生徒数:', studentIds?.length);
  console.log('  サイクル:', cycleNumber);

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

    console.log('  取得件数:', result.rows.length);

    // 学籍番号をキーとしたマップに変換（サイクルに応じたフィールド）
    const extensionMap = {};
    result.rows.forEach(row => {
      extensionMap[row.student_id] = {
        student_id: row.student_id,
        extension_certainty: row[`extension_certainty_${cycleNumber}`],
        hearing_status: row[`hearing_status_${cycleNumber}`],
        examination_result: row[`examination_result_${cycleNumber}`],
        notes: row[`notes_${cycleNumber}`],
        updated_at: row.updated_at,
        created_at: row.created_at,
      };
    });

    console.log('  ✅ 一括取得成功');

    res.json({
      success: true,
      data: extensionMap,
    });
  } catch (error) {
    console.error('  ❌ 一括取得エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/students/:studentId
 * 特定の生徒の延長管理データを取得
 * @query {number} cycle - サイクル（1, 2, or 3）
 */
router.get('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const cycle = parseInt(req.query.cycle) || 1;

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

    const row = result.rows[0];
    
    // サイクルに応じたフィールドを返す
    const data = {
      student_id: row.student_id,
      extension_certainty: row[`extension_certainty_${cycle}`],
      hearing_status: row[`hearing_status_${cycle}`],
      examination_result: row[`examination_result_${cycle}`],
      notes: row[`notes_${cycle}`],
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    res.json({
      success: true,
      data,
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
 * @body {number} cycle - サイクル（1, 2, or 3）
 */
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const { extension_certainty, hearing_status, examination_result, notes, cycle } = req.body;
  
  const cycleNumber = cycle || 1;

  // デバッグログ
  console.log('📝 POST /api/students/:studentId');
  console.log('  学籍番号:', studentId);
  console.log('  サイクル:', cycleNumber);
  console.log('  データ:', { extension_certainty, hearing_status, examination_result, notes });

  try {
    // サイクルに応じたカラム名を構築
    const certaintyCol = `extension_certainty_${cycleNumber}`;
    const hearingCol = `hearing_status_${cycleNumber}`;
    const examCol = `examination_result_${cycleNumber}`;
    const notesCol = `notes_${cycleNumber}`;

    console.log('  カラム名:', { certaintyCol, hearingCol, examCol, notesCol });

    const result = await pool.query(
      `INSERT INTO student_extensions 
        (student_id, ${certaintyCol}, ${hearingCol}, ${examCol}, ${notesCol}, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (student_id) 
       DO UPDATE SET
         ${certaintyCol} = EXCLUDED.${certaintyCol},
         ${hearingCol} = EXCLUDED.${hearingCol},
         ${examCol} = EXCLUDED.${examCol},
         ${notesCol} = EXCLUDED.${notesCol},
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [studentId, extension_certainty, hearing_status, examination_result, notes]
    );

    const row = result.rows[0];
    
    // サイクルに応じたフィールドを返す
    const data = {
      student_id: row.student_id,
      extension_certainty: row[certaintyCol],
      hearing_status: row[hearingCol],
      examination_result: row[examCol],
      notes: row[notesCol],
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    console.log('  ✅ 保存成功:', data);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('  ❌ 保存エラー:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
