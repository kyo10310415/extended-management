import {
  applySuspensionPaymentStatus,
  fetchSuspensionApplications,
} from './sheetsService.js';

const LOCK_NAME = 'suspension_payment_status_sync';

function applicationParams(application, status, errorMessage = null) {
  return [
    application.sourceKey,
    application.sourceRowNumber,
    application.submittedAt || null,
    application.studentId || null,
    application.suspensionStartDate || null,
    application.suspensionEndDate || null,
    application.startYearMonth,
    application.endYearMonth,
    status,
    errorMessage,
  ];
}

async function insertApplication(client, application, status, errorMessage = null) {
  return client.query(
    `INSERT INTO suspension_payment_syncs (
       source_key,
       source_row_number,
       submitted_at,
       student_id,
       suspension_start_date,
       suspension_end_date,
       start_year_month,
       end_year_month,
       sync_status,
       last_error
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (source_key) DO NOTHING
     RETURNING source_key`,
    applicationParams(application, status, errorMessage)
  );
}

async function initializeBaseline(client, applications) {
  await client.query('BEGIN');
  try {
    for (const application of applications) {
      await insertApplication(client, application, 'baseline');
    }
    await client.query(
      `UPDATE suspension_payment_sync_state
          SET initialized = TRUE,
              initialized_at = COALESCE(initialized_at, CURRENT_TIMESTAMP),
              last_sync_at = CURRENT_TIMESTAMP,
              last_error = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function registerNewApplications(client, applications) {
  let discoveredCount = 0;
  let invalidCount = 0;

  await client.query('BEGIN');
  try {
    for (const application of applications) {
      const status = application.validationError ? 'invalid' : 'pending';
      const refreshedInvalid = await client.query(
        `UPDATE suspension_payment_syncs
            SET source_row_number = $2,
                submitted_at = $3,
                student_id = $4,
                suspension_start_date = $5,
                suspension_end_date = $6,
                start_year_month = $7,
                end_year_month = $8,
                sync_status = $9,
                last_error = $10,
                updated_at = CURRENT_TIMESTAMP
          WHERE source_key = $1
            AND sync_status = 'invalid'
        RETURNING source_key`,
        applicationParams(
          application,
          status,
          application.validationError
        )
      );
      if (refreshedInvalid.rowCount === 1) continue;

      const result = await insertApplication(
        client,
        application,
        status,
        application.validationError
      );
      if (result.rowCount === 1) {
        discoveredCount += 1;
        if (status === 'invalid') invalidCount += 1;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  return { discoveredCount, invalidCount };
}

async function processPendingApplications(client) {
  const pending = await client.query(
    `SELECT source_key,
            student_id,
            start_year_month,
            end_year_month
       FROM suspension_payment_syncs
      WHERE sync_status IN ('pending', 'failed')
      ORDER BY source_row_number, created_at`
  );
  let completedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const record of pending.rows) {
    await client.query(
      `UPDATE suspension_payment_syncs
          SET sync_status = 'pending',
              attempt_count = attempt_count + 1,
              last_error = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE source_key = $1`,
      [record.source_key]
    );

    try {
      const applied = await applySuspensionPaymentStatus({
        studentId: record.student_id,
        startYearMonth: record.start_year_month,
        endYearMonth: record.end_year_month,
      });
      await client.query(
        `UPDATE suspension_payment_syncs
            SET sync_status = 'completed',
                target_row_number = $2,
                target_range = $3,
                completed_at = CURRENT_TIMESTAMP,
                last_error = NULL,
                updated_at = CURRENT_TIMESTAMP
          WHERE source_key = $1`,
        [record.source_key, applied.rowNumber, applied.range]
      );
      completedCount += 1;
      results.push({ sourceKey: record.source_key, success: true, ...applied });
    } catch (error) {
      const message = String(error?.message || 'Unknown suspension payment sync error');
      await client.query(
        `UPDATE suspension_payment_syncs
            SET sync_status = 'failed',
                last_error = $2,
                updated_at = CURRENT_TIMESTAMP
          WHERE source_key = $1`,
        [record.source_key, message]
      );
      failedCount += 1;
      results.push({ sourceKey: record.source_key, success: false, error: message });
      console.error('❌ Failed to apply suspension to payment status sheet:', message);
    }
  }

  return { completedCount, failedCount, results };
}

/**
 * 新しく追加された休会申請だけをRAW_支払い状況へ反映する。
 * 初回は既存行をbaseline登録し、導入後の申請から処理を開始する。
 */
export async function syncSuspensionPaymentStatuses({ pool }) {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext('${LOCK_NAME}')) AS locked`
    );
    lockAcquired = lockResult.rows[0]?.locked === true;
    if (!lockAcquired) {
      return {
        success: true,
        skipped: true,
        discoveredCount: 0,
        completedCount: 0,
        failedCount: 0,
        invalidCount: 0,
      };
    }

    const applications = await fetchSuspensionApplications();
    const stateResult = await client.query(
      `SELECT initialized FROM suspension_payment_sync_state WHERE id = 1`
    );
    const initialized = stateResult.rows[0]?.initialized === true;

    if (!initialized) {
      await initializeBaseline(client, applications);
      console.log(
        `✅ Suspension payment sync initialized with ${applications.length} existing applications`
      );
      return {
        success: true,
        skipped: false,
        initialized: true,
        baselineCount: applications.length,
        discoveredCount: 0,
        completedCount: 0,
        failedCount: 0,
        invalidCount: 0,
      };
    }

    const registered = await registerNewApplications(client, applications);
    const processed = await processPendingApplications(client);
    const lastError = processed.failedCount > 0
      ? `${processed.failedCount}件の休会反映に失敗しました。次回再試行します。`
      : null;
    await client.query(
      `UPDATE suspension_payment_sync_state
          SET last_sync_at = CURRENT_TIMESTAMP,
              last_error = $1,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = 1`,
      [lastError]
    );

    console.log(
      `✅ Suspension payment sync completed: new=${registered.discoveredCount}, `
      + `completed=${processed.completedCount}, failed=${processed.failedCount}, `
      + `invalid=${registered.invalidCount}`
    );
    return {
      success: processed.failedCount === 0,
      skipped: false,
      ...registered,
      ...processed,
    };
  } catch (error) {
    const message = String(error?.message || 'Unknown suspension payment sync error');
    try {
      await client.query(
        `UPDATE suspension_payment_sync_state
            SET last_sync_at = CURRENT_TIMESTAMP,
                last_error = $1,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = 1`,
        [message]
      );
    } catch (stateError) {
      console.error('❌ Failed to save suspension payment sync error:', stateError.message);
    }
    console.error('❌ Suspension payment sync failed:', message);
    return {
      success: false,
      skipped: false,
      error: message,
      discoveredCount: 0,
      completedCount: 0,
      failedCount: 0,
      invalidCount: 0,
    };
  } finally {
    if (lockAcquired) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext('${LOCK_NAME}'))`
      );
    }
    client.release();
  }
}
