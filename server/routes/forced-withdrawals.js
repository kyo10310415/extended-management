import express from 'express';
import { pool } from '../index.js';
import {
  sendForcedWithdrawalNotification,
  sendForcedWithdrawalStudentNotification,
} from '../services/discordService.js';
import { getForcedWithdrawalStudentDiscordDestination } from '../services/sheetsService.js';
import {
  FORCED_WITHDRAWAL_REASONS,
  calculateForcedWithdrawalMonth,
  isValidIsoDate,
  normalizeStudentId,
} from '../utils/forcedWithdrawalUtils.js';

const router = express.Router();

function studentIdCandidates(studentId) {
  const normalized = normalizeStudentId(studentId);
  const legacy = normalized.replace(/^OLTS/, 'OLST');
  return [...new Set([normalized, legacy])];
}

async function findStudent(queryable, studentId) {
  const candidates = studentIdCandidates(studentId);
  if (!candidates[0]) return null;

  const result = await queryable.query(
    `SELECT
       student_id AS "studentId",
       name,
       TO_CHAR(lesson_start_date, 'YYYY-MM-DD') AS "lessonStartDate"
     FROM notion_students_cache
     WHERE UPPER(student_id) = ANY($1::text[])
     ORDER BY CASE WHEN UPPER(student_id) = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [candidates, candidates[0]]
  );

  if (result.rows.length === 0) return null;

  return {
    ...result.rows[0],
    studentId: normalizeStudentId(result.rows[0].studentId),
  };
}

router.get('/student/:studentId', async (req, res) => {
  try {
    const student = await findStudent(pool, req.params.studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        error: '該当する学籍番号の生徒が見つかりません。',
      });
    }

    return res.json({ success: true, data: student });
  } catch (error) {
    console.error('強制退会申請の生徒検索エラー:', error);
    return res.status(500).json({
      success: false,
      error: '生徒情報の取得に失敗しました。',
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        student_id AS "studentId",
        student_name AS "studentName",
        TO_CHAR(forced_withdrawal_date, 'YYYY-MM-DD') AS "forcedWithdrawalDate",
        withdrawal_reason AS "withdrawalReason",
        months_elapsed AS "monthsElapsed",
        discord_notification_sent AS "discordNotificationSent",
        student_discord_notification_sent AS "studentDiscordNotificationSent",
        created_at AS "createdAt"
      FROM forced_withdrawals
      ORDER BY forced_withdrawal_date DESC, created_at DESC
    `);

    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('強制退会一覧の取得エラー:', error);
    return res.status(500).json({
      success: false,
      error: '強制退会一覧の取得に失敗しました。',
    });
  }
});

router.post('/', async (req, res) => {
  const studentId = normalizeStudentId(req.body?.studentId);
  const forcedWithdrawalDate = String(req.body?.forcedWithdrawalDate ?? '').trim();
  const withdrawalReason = String(req.body?.withdrawalReason ?? '').trim();

  if (!studentId) {
    return res.status(400).json({ success: false, error: '学籍番号を入力してください。' });
  }
  if (studentId.length > 50) {
    return res.status(400).json({ success: false, error: '学籍番号が長すぎます。' });
  }
  if (!isValidIsoDate(forcedWithdrawalDate)) {
    return res.status(400).json({ success: false, error: '強制退会日を正しく入力してください。' });
  }
  if (!FORCED_WITHDRAWAL_REASONS.includes(withdrawalReason)) {
    return res.status(400).json({ success: false, error: '退会理由を選択してください。' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const student = await findStudent(client, studentId);
    if (!student) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: '該当する学籍番号の生徒が見つかりません。',
      });
    }
    if (!student.lessonStartDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'この生徒にはレッスン開始日が設定されていません。',
      });
    }

    const monthsElapsed = calculateForcedWithdrawalMonth(
      student.lessonStartDate,
      forcedWithdrawalDate
    );
    if (!monthsElapsed) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: '強制退会日はレッスン開始日以降の日付を選択してください。',
      });
    }

    const studentDiscordDestination = await getForcedWithdrawalStudentDiscordDestination(
      student.studentId
    );

    const insertResult = await client.query(
      `INSERT INTO forced_withdrawals (
         student_id,
         student_name,
         lesson_start_date,
         forced_withdrawal_date,
         withdrawal_reason,
         months_elapsed
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at AS "createdAt"`,
      [
        student.studentId,
        student.name || '-',
        student.lessonStartDate,
        forcedWithdrawalDate,
        withdrawalReason,
        monthsElapsed,
      ]
    );

    const operationNotification = await sendForcedWithdrawalNotification({
      name: student.name,
      studentId: student.studentId,
      forcedWithdrawalDate,
      withdrawalReason,
    });

    if (!operationNotification.success) {
      const notificationError = new Error(
        `Operation Discord notification failed: ${operationNotification.error}`
      );
      notificationError.isDiscordNotificationError = true;
      notificationError.notificationTarget = 'operation';
      throw notificationError;
    }

    // 再試行時に生徒様へ重複通知するリスクを抑えるため、
    // 通知先が固定の運営向け通知を先に送信する。
    const studentNotification = await sendForcedWithdrawalStudentNotification({
      ...studentDiscordDestination,
      studentId: student.studentId,
    });

    if (!studentNotification.success) {
      const notificationError = new Error(
        `Student Discord notification failed: ${studentNotification.error}`
      );
      notificationError.isDiscordNotificationError = true;
      notificationError.notificationTarget = 'student';
      throw notificationError;
    }

    await client.query(
      `UPDATE forced_withdrawals
          SET discord_notification_sent = true,
              discord_notification_sent_at = CURRENT_TIMESTAMP,
              student_discord_notification_sent = true,
              student_discord_notification_sent_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [insertResult.rows[0].id]
    );
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      data: {
        id: insertResult.rows[0].id,
        studentId: student.studentId,
        studentName: student.name || '-',
        forcedWithdrawalDate,
        withdrawalReason,
        monthsElapsed,
        discordNotificationSent: true,
        studentDiscordNotificationSent: true,
        createdAt: insertResult.rows[0].createdAt,
      },
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('強制退会申請のロールバックエラー:', rollbackError.message);
      }
    }

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'この生徒の強制退会申請はすでに登録されています。',
      });
    }

    if (error.isStudentDiscordDestinationError === true) {
      return res.status(422).json({
        success: false,
        error: error.message,
      });
    }

    console.error('強制退会申請エラー:', error.message);
    const notificationFailed = error.isDiscordNotificationError === true;
    const notificationTargetLabel = error.notificationTarget === 'student'
      ? '生徒様へのDiscord通知'
      : '運営へのDiscord通知';
    return res.status(notificationFailed ? 502 : 500).json({
      success: false,
      error: notificationFailed
        ? `${notificationTargetLabel}を送信できなかったため、申請は保存されませんでした。時間をおいて再度お試しください。`
        : '強制退会申請の保存に失敗しました。',
    });
  } finally {
    client?.release();
  }
});

export default router;
