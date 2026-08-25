import {
  applySalesForecastExtensionPlan,
  getExtensionAgreementStudentChatDestination,
  planSalesForecastExtension,
} from './sheetsService.js';
import { sendExtensionAgreementNotification } from './discordService.js';
const MIN_EXTENSION_CYCLE = 1;
const MAX_EXTENSION_CYCLE = 10;

function isValidExtensionCycle(cycle) {
  return Number.isInteger(cycle)
    && cycle >= MIN_EXTENSION_CYCLE
    && cycle <= MAX_EXTENSION_CYCLE;
}

export const EXECUTIVE_CHECK_VALUES = Object.freeze(['', '未確認', '確認済']);

export function isValidExecutiveCheck(value) {
  return EXECUTIVE_CHECK_VALUES.includes(String(value ?? ''));
}

function cycleColumns(cycle) {
  return {
    examinationResult: `examination_result_${cycle}`,
    executiveCheck: `executive_check_${cycle}`,
    revenuePending: `revenue_extension_pending_${cycle}`,
    revenueCompleted: `revenue_extension_completed_${cycle}`,
    revenueStartMonth: `revenue_extension_start_month_${cycle}`,
    revenueEndMonth: `revenue_extension_end_month_${cycle}`,
    revenueSyncedAt: `revenue_extension_synced_at_${cycle}`,
    studentNotificationPending: `student_extension_notification_pending_${cycle}`,
    studentNotificationSent: `student_extension_notification_sent_${cycle}`,
    studentNotificationSentAt: `student_extension_notification_sent_at_${cycle}`,
  };
}

function selectedCycles(cycle) {
  if (cycle !== null && !isValidExtensionCycle(cycle)) {
    throw new Error(`cycle must be between ${MIN_EXTENSION_CYCLE} and ${MAX_EXTENSION_CYCLE}`);
  }
  return cycle === null
    ? Array.from(
        { length: MAX_EXTENSION_CYCLE - MIN_EXTENSION_CYCLE + 1 },
        (_, index) => index + MIN_EXTENSION_CYCLE
      )
    : [cycle];
}

async function processRevenueExtensions({ client, cycles, studentId }) {
  let completedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const cycle of cycles) {
    const columns = cycleColumns(cycle);
    const params = [];
    const studentFilter = studentId ? 'AND student_id = $1' : '';
    if (studentId) params.push(studentId);

    const pendingRows = await client.query(
      `SELECT student_id,
              ${columns.revenueStartMonth} AS start_month,
              ${columns.revenueEndMonth} AS end_month
         FROM student_extensions
        WHERE COALESCE(${columns.revenuePending}, FALSE)
          AND NOT COALESCE(${columns.revenueCompleted}, FALSE)
          AND ${columns.examinationResult} = '延長'
          ${studentFilter}
        ORDER BY student_id`,
      params
    );

    for (const pending of pendingRows.rows) {
      try {
        let startYearMonth = pending.start_month;
        let endYearMonth = pending.end_month;

        if (!startYearMonth || !endYearMonth) {
          const plan = await planSalesForecastExtension(pending.student_id);
          startYearMonth = plan.startYearMonth;
          endYearMonth = plan.endYearMonth;

          const planUpdate = await client.query(
            `UPDATE student_extensions
                SET ${columns.revenueStartMonth} = $2,
                    ${columns.revenueEndMonth} = $3,
                    updated_at = CURRENT_TIMESTAMP
              WHERE student_id = $1
                AND COALESCE(${columns.revenuePending}, FALSE)
                AND NOT COALESCE(${columns.revenueCompleted}, FALSE)`,
            [pending.student_id, startYearMonth, endYearMonth]
          );
          if (planUpdate.rowCount !== 1) {
            throw new Error('追記計画の保存中に審査結果が更新されました。');
          }
        }

        const currentState = await client.query(
          `SELECT 1
             FROM student_extensions
            WHERE student_id = $1
              AND COALESCE(${columns.revenuePending}, FALSE)
              AND NOT COALESCE(${columns.revenueCompleted}, FALSE)
              AND ${columns.examinationResult} = '延長'`,
          [pending.student_id]
        );
        if (currentState.rowCount !== 1) {
          throw new Error('追記処理の開始前に審査結果が更新されました。');
        }

        await applySalesForecastExtensionPlan({
          studentId: pending.student_id,
          startYearMonth,
          endYearMonth,
        });

        const updateResult = await client.query(
          `UPDATE student_extensions
              SET ${columns.revenuePending} = FALSE,
                  ${columns.revenueCompleted} = TRUE,
                  ${columns.revenueSyncedAt} = CURRENT_TIMESTAMP,
                  ${columns.executiveCheck} = '未確認',
                  updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1
              AND COALESCE(${columns.revenuePending}, FALSE)
              AND ${columns.examinationResult} = '延長'`,
          [pending.student_id]
        );

        if (updateResult.rowCount !== 1) {
          throw new Error('追記完了状態をDBに保存できませんでした。');
        }

        completedCount += 1;
        results.push({
          studentId: pending.student_id,
          cycle,
          success: true,
          startYearMonth,
          endYearMonth,
        });
      } catch (error) {
        failedCount += 1;
        console.error(
          `❌ Failed sales forecast extension: student=${pending.student_id}, cycle=${cycle}:`,
          error.message
        );
        results.push({
          studentId: pending.student_id,
          cycle,
          success: false,
          error: error.message,
        });
      }
    }
  }

  return { completedCount, failedCount, results };
}

async function processStudentNotifications({ client, cycles, studentId }) {
  let sentCount = 0;
  let failedCount = 0;
  const results = [];

  for (const cycle of cycles) {
    const columns = cycleColumns(cycle);
    const params = [];
    const studentFilter = studentId ? 'AND student_id = $1' : '';
    if (studentId) params.push(studentId);

    const pendingRows = await client.query(
      `SELECT student_id,
              ${columns.revenueEndMonth} AS end_month
         FROM student_extensions
        WHERE COALESCE(${columns.studentNotificationPending}, FALSE)
          AND NOT COALESCE(${columns.studentNotificationSent}, FALSE)
          AND ${columns.executiveCheck} = '確認済'
          AND COALESCE(${columns.revenueCompleted}, FALSE)
          AND ${columns.revenueEndMonth} IS NOT NULL
          ${studentFilter}
        ORDER BY student_id`,
      params
    );

    for (const pending of pendingRows.rows) {
      try {
        const destination = await getExtensionAgreementStudentChatDestination(
          pending.student_id
        );
        const notification = await sendExtensionAgreementNotification({
          ...destination,
          endYearMonth: pending.end_month,
          studentId: pending.student_id,
        });

        if (!notification.success) {
          throw new Error(notification.error || 'Discord Bot notification failed');
        }

        await client.query(
          `UPDATE student_extensions
              SET ${columns.studentNotificationPending} = FALSE,
                  ${columns.studentNotificationSent} = TRUE,
                  ${columns.studentNotificationSentAt} = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
            WHERE student_id = $1
              AND COALESCE(${columns.studentNotificationPending}, FALSE)
              AND NOT COALESCE(${columns.studentNotificationSent}, FALSE)`,
          [pending.student_id]
        );

        sentCount += 1;
        results.push({ studentId: pending.student_id, cycle, success: true });
      } catch (error) {
        failedCount += 1;
        console.error(
          `❌ Failed extension agreement notification: student=${pending.student_id}, cycle=${cycle}:`,
          error.message
        );
        results.push({
          studentId: pending.student_id,
          cycle,
          success: false,
          error: error.message,
        });
      }
    }
  }

  return { sentCount, failedCount, results };
}

/**
 * 売上予測シート追記と契約延長通知の送信待ちを処理する。
 * advisory lockで複数サーバー間の二重処理を防止する。
 */
export async function processPendingExaminationAutomations({
  pool,
  cycle = null,
  studentId = null,
}) {
  const cycles = selectedCycles(cycle);
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext('examination_result_automations')) AS locked`
    );
    lockAcquired = lockResult.rows[0]?.locked === true;
    if (!lockAcquired) {
      return {
        success: true,
        skipped: true,
        revenue: { completedCount: 0, failedCount: 0, results: [] },
        studentNotifications: { sentCount: 0, failedCount: 0, results: [] },
      };
    }

    const revenue = await processRevenueExtensions({ client, cycles, studentId });
    const studentNotifications = await processStudentNotifications({
      client,
      cycles,
      studentId,
    });

    return {
      success: revenue.failedCount === 0 && studentNotifications.failedCount === 0,
      skipped: false,
      revenue,
      studentNotifications,
    };
  } finally {
    if (lockAcquired) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext('examination_result_automations'))`
      );
    }
    client.release();
  }
}
