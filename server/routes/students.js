import express from 'express';
import { pool } from '../index.js';
import {
  isValidExtensionCycle,
  processPendingExaminationDiscordNotifications,
} from '../services/examinationResultSyncService.js';

const router = express.Router();

function parseCycle(value) {
  const cycle = Number.parseInt(value, 10);
  return isValidExtensionCycle(cycle) ? cycle : null;
}

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
 * @body {number} cycle - サイクル（1〜10）
 * 
 * 重要: このルートは /:studentId より前に定義する必要がある
 */
router.post('/bulk', async (req, res) => {
  const { studentIds, cycle } = req.body;
  const cycleNumber = parseCycle(cycle ?? 1);

  console.log('📦 POST /api/students/bulk');
  console.log('  生徒数:', studentIds?.length);
  console.log('  サイクル:', cycleNumber);

  if (!cycleNumber) {
    return res.status(400).json({ success: false, error: 'cycle must be between 1 and 10' });
  }

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
        examination_result_manual_override: row[`examination_result_manual_override_${cycleNumber}`] || false,
        discord_notification_sent: row[`discord_notification_sent_${cycleNumber}`] || false,
        discord_notification_sent_at: row[`discord_notification_sent_at_${cycleNumber}`] || null,
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
 * @query {number} cycle - サイクル（1〜10）
 */
router.get('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const cycle = parseCycle(req.query.cycle ?? 1);

  if (!cycle) {
    return res.status(400).json({ success: false, error: 'cycle must be between 1 and 10' });
  }

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
      examination_result_manual_override: row[`examination_result_manual_override_${cycle}`] || false,
      discord_notification_sent: row[`discord_notification_sent_${cycle}`] || false,
      discord_notification_sent_at: row[`discord_notification_sent_at_${cycle}`] || null,
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
 * @body {number} cycle - サイクル（1〜10）
 */
router.post('/:studentId', async (req, res) => {
  const { studentId } = req.params;
  const {
    extension_certainty,
    hearing_status,
    examination_result,
    examination_result_manually_changed,
    send_discord_notification,
    notes,
    cycle,
  } = req.body;
  const cycleNumber = parseCycle(cycle ?? 1);
  const examinationResultWasManuallyChanged = examination_result_manually_changed === true;
  const discordNotificationWasRequested = send_discord_notification === true;

  if (!cycleNumber) {
    return res.status(400).json({ success: false, error: 'cycle must be between 1 and 10' });
  }

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
    const examManualOverrideCol = `examination_result_manual_override_${cycleNumber}`;
    const discordSentCol = `discord_notification_sent_${cycleNumber}`;
    const discordPendingCol = `discord_notification_pending_${cycleNumber}`;
    const discordResultLabelCol = `discord_notification_result_label_${cycleNumber}`;
    const discordSentAtCol = `discord_notification_sent_at_${cycleNumber}`;
    const notesCol = `notes_${cycleNumber}`;

    console.log('  カラム名:', {
      certaintyCol,
      hearingCol,
      examCol,
      examManualOverrideCol,
      discordSentCol,
      discordPendingCol,
      notesCol,
    });

    const result = await pool.query(
      `INSERT INTO student_extensions 
        (student_id,
         ${certaintyCol},
         ${hearingCol},
         ${examCol},
         ${examManualOverrideCol},
         ${discordPendingCol},
         ${discordResultLabelCol},
         ${notesCol},
         updated_at)
       VALUES (
         $1,
         $2,
         $3,
         CASE WHEN $6 THEN NULLIF($4, '') ELSE NULL END,
         $6,
         CASE WHEN $6 AND $7 AND NULLIF($4, '') = '延長' THEN TRUE ELSE FALSE END,
         CASE WHEN $6 AND $7 AND NULLIF($4, '') = '延長' THEN '延長' ELSE NULL END,
         $5,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (student_id) 
       DO UPDATE SET
         ${certaintyCol} = EXCLUDED.${certaintyCol},
         ${hearingCol} = EXCLUDED.${hearingCol},
         ${examCol} = CASE
           WHEN $6 THEN EXCLUDED.${examCol}
           ELSE student_extensions.${examCol}
         END,
         ${examManualOverrideCol} = CASE
           WHEN $6 THEN TRUE
           ELSE COALESCE(student_extensions.${examManualOverrideCol}, FALSE)
         END,
         ${discordPendingCol} = CASE
           WHEN $6
            AND $7
            AND EXCLUDED.${examCol} = '延長'
            AND student_extensions.${examCol} IS DISTINCT FROM '延長'
            AND NOT COALESCE(student_extensions.${discordSentCol}, FALSE)
             THEN TRUE
           WHEN $6 THEN FALSE
           ELSE COALESCE(student_extensions.${discordPendingCol}, FALSE)
         END,
         ${discordResultLabelCol} = CASE
           WHEN $6
            AND $7
            AND EXCLUDED.${examCol} = '延長'
            AND student_extensions.${examCol} IS DISTINCT FROM '延長'
            AND NOT COALESCE(student_extensions.${discordSentCol}, FALSE)
             THEN '延長'
           ELSE student_extensions.${discordResultLabelCol}
         END,
         ${notesCol} = EXCLUDED.${notesCol},
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        studentId,
        extension_certainty,
        hearing_status,
        examination_result,
        notes,
        examinationResultWasManuallyChanged,
        discordNotificationWasRequested,
      ]
    );

    let row = result.rows[0];
    let notification = null;

    if (
      examinationResultWasManuallyChanged
      && discordNotificationWasRequested
      && examination_result === '延長'
    ) {
      try {
        const processed = await processPendingExaminationDiscordNotifications({
          pool,
          cycle: cycleNumber,
          studentId,
        });
        const refreshed = await pool.query(
          `SELECT * FROM student_extensions WHERE student_id = $1`,
          [studentId]
        );
        row = refreshed.rows[0] || row;
        notification = {
          requested: true,
          success: row[discordSentCol] === true,
          queued: row[discordPendingCol] === true,
          error: processed.results?.find(item =>
            item.studentId === studentId && item.cycle === cycleNumber
          )?.error,
        };
      } catch (notificationError) {
        console.error('  ❌ Discord通知処理エラー:', notificationError.message);
        notification = {
          requested: true,
          success: false,
          queued: true,
          error: notificationError.message,
        };
      }
    }
    
    // サイクルに応じたフィールドを返す
    const data = {
      student_id: row.student_id,
      extension_certainty: row[certaintyCol],
      hearing_status: row[hearingCol],
      examination_result: row[examCol],
      examination_result_manual_override: row[examManualOverrideCol] || false,
      discord_notification_sent: row[discordSentCol] || false,
      discord_notification_sent_at: row[discordSentAtCol] || null,
      notes: row[notesCol],
      updated_at: row.updated_at,
      created_at: row.created_at,
    };

    console.log('  ✅ 保存成功:', data);

    res.json({
      success: true,
      data,
      notification,
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
