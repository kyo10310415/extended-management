import {
  fetchAutomaticExaminationResultsForMonth,
  fetchSuspensionData,
  normalizeLessonStudentId,
} from './sheetsService.js';
import { fetchStudents } from './notionService.js';
import {
  calculateEffectiveSuspensionMonths,
  enrichStudentsWithMonths,
} from '../utils/dateUtils.js';
import {
  calculateProPlanMonths,
  examMonth,
  fetchProStartDates,
} from './proPlanExternalService.js';
import { sendExaminationResultNotification } from './discordService.js';

export const MIN_EXTENSION_CYCLE = 1;
export const MAX_EXTENSION_CYCLE = 10;
export const EXAMINATION_SYNC_MONTH_OFFSETS = Object.freeze([-6, -5, -4, -3, -2, -1, 0, 1]);

let fullSyncPromise = null;

export function isValidExtensionCycle(cycle) {
  return Number.isInteger(cycle)
    && cycle >= MIN_EXTENSION_CYCLE
    && cycle <= MAX_EXTENSION_CYCLE;
}

function createCyclePayloads() {
  return new Map(
    Array.from(
      { length: MAX_EXTENSION_CYCLE },
      (_, index) => [index + 1, new Map()]
    )
  );
}

function getAutomaticResult(resultsByStudent, studentId) {
  const normalizedStudentId = normalizeLessonStudentId(studentId);
  const matchedResult = resultsByStudent?.[normalizedStudentId];
  return {
    result: matchedResult?.result || null,
    sourceValue: matchedResult?.sourceValue || null,
  };
}

function addTarget(payloads, cycle, studentId, resultsByStudent) {
  const trimmedStudentId = String(studentId ?? '').trim();
  if (!trimmedStudentId) return;

  payloads.get(cycle).set(
    trimmedStudentId,
    getAutomaticResult(resultsByStudent, trimmedStudentId)
  );
}

function isStandardExaminationStatus(status, monthOffset) {
  return status === 'アクティブ'
    || status === '正規退会'
    || status === '無断キャンセル'
    || (monthOffset < 0 && status === '強制退会');
}

function isProExaminationStatus(status, monthOffset) {
  return status === 'アクティブ'
    || (monthOffset < 0 && (status === '正規退会' || status === '強制退会'));
}

/**
 * 画面と同じ対象条件を使い、1〜10回目のDB同期対象を組み立てる。
 * 戻り値は Map<cycle, Map<studentId, {result, sourceValue}>>。
 */
export function buildAutomaticExaminationSyncPayloads({
  students,
  suspensionData,
  proStartMap,
  formResultsByOffset,
  monthOffsets = EXAMINATION_SYNC_MONTH_OFFSETS,
}) {
  const payloads = createCyclePayloads();

  for (const monthOffset of monthOffsets) {
    const resultsByStudent = formResultsByOffset.get(monthOffset)?.resultsByStudent || {};
    const studentsWithMonths = enrichStudentsWithMonths(students, monthOffset);

    for (const student of studentsWithMonths) {
      const suspension = suspensionData[student.studentId];
      const suspensionMonths = calculateEffectiveSuspensionMonths(suspension, monthOffset);
      const adjustedMonths = Math.max(0, student.monthsElapsed - suspensionMonths);

      if (isStandardExaminationStatus(student.status, monthOffset)) {
        if (adjustedMonths === 5) {
          addTarget(payloads, 1, student.studentId, resultsByStudent);
        } else if (adjustedMonths === 11) {
          addTarget(payloads, 2, student.studentId, resultsByStudent);
        }
      }

      if (adjustedMonths === 17 && isProExaminationStatus(student.status, monthOffset)) {
        addTarget(payloads, 3, student.studentId, resultsByStudent);
      }

      const { proStartDate } = proStartMap[student.studentId] || {};
      const proPlanMonths = calculateProPlanMonths(proStartDate, monthOffset);
      if (!proPlanMonths) continue;

      for (let cycle = 4; cycle <= MAX_EXTENSION_CYCLE; cycle += 1) {
        if (proPlanMonths === examMonth(cycle)) {
          addTarget(payloads, cycle, student.studentId, resultsByStudent);
          break;
        }
      }
    }
  }

  return payloads;
}

/**
 * 1サイクル分の自動結果をDBへ一括反映する。
 * 手動固定済みの結果は保持し、自動管理中の空欄はnullでクリアする。
 */
export async function applyAutomaticExaminationResults({
  pool,
  cycle,
  automaticResultsByStudent,
}) {
  if (!isValidExtensionCycle(cycle)) {
    throw new Error(`cycle must be between ${MIN_EXTENSION_CYCLE} and ${MAX_EXTENSION_CYCLE}`);
  }

  const entries = [...automaticResultsByStudent.entries()];
  if (entries.length === 0) {
    return { syncedCount: 0, mappedCount: 0 };
  }

  const studentIds = entries.map(([studentId]) => studentId);
  const automaticResults = entries.map(([, value]) => {
    if (value && typeof value === 'object') return value.result || null;
    return value || null;
  });
  const notificationResultLabels = entries.map(([, value]) => {
    const result = value && typeof value === 'object' ? value.result : value;
    const sourceValue = value && typeof value === 'object'
      ? String(value.sourceValue ?? '').replace(/＋/g, '+')
      : '';
    if (result !== '延長') return null;
    return sourceValue === '永久会員+PROプラン' ? 'PROプラン' : '延長';
  });
  const mappedCount = automaticResults.filter(Boolean).length;
  const examinationResultColumn = `examination_result_${cycle}`;
  const manualOverrideColumn = `examination_result_manual_override_${cycle}`;
  const discordSentColumn = `discord_notification_sent_${cycle}`;
  const discordPendingColumn = `discord_notification_pending_${cycle}`;
  const discordResultLabelColumn = `discord_notification_result_label_${cycle}`;

  await pool.query(
    `INSERT INTO student_extensions (
       student_id,
       ${examinationResultColumn},
       ${manualOverrideColumn},
       ${discordPendingColumn},
       ${discordResultLabelColumn},
       updated_at
     )
     SELECT source.student_id,
            source.examination_result,
            FALSE,
            source.examination_result = '延長',
            source.discord_result_label,
            CURRENT_TIMESTAMP
       FROM unnest($1::text[], $2::text[], $3::text[])
         AS source(student_id, examination_result, discord_result_label)
     ON CONFLICT (student_id)
     DO UPDATE SET
       ${examinationResultColumn} = CASE
         WHEN COALESCE(student_extensions.${manualOverrideColumn}, FALSE)
           THEN student_extensions.${examinationResultColumn}
         ELSE EXCLUDED.${examinationResultColumn}
       END,
       ${discordPendingColumn} = CASE
         WHEN COALESCE(student_extensions.${manualOverrideColumn}, FALSE)
           THEN student_extensions.${discordPendingColumn}
         WHEN EXCLUDED.${examinationResultColumn} = '延長'
          AND student_extensions.${examinationResultColumn} IS DISTINCT FROM '延長'
          AND NOT COALESCE(student_extensions.${discordSentColumn}, FALSE)
           THEN TRUE
         WHEN EXCLUDED.${examinationResultColumn} IS DISTINCT FROM '延長'
           THEN FALSE
         ELSE student_extensions.${discordPendingColumn}
       END,
       ${discordResultLabelColumn} = CASE
         WHEN NOT COALESCE(student_extensions.${manualOverrideColumn}, FALSE)
          AND EXCLUDED.${examinationResultColumn} = '延長'
          AND (
            student_extensions.${examinationResultColumn} IS DISTINCT FROM '延長'
            OR COALESCE(student_extensions.${discordPendingColumn}, FALSE)
          )
           THEN EXCLUDED.${discordResultLabelColumn}
         ELSE student_extensions.${discordResultLabelColumn}
       END,
       updated_at = CASE
         WHEN NOT COALESCE(student_extensions.${manualOverrideColumn}, FALSE)
          AND student_extensions.${examinationResultColumn}
              IS DISTINCT FROM EXCLUDED.${examinationResultColumn}
           THEN CURRENT_TIMESTAMP
         ELSE student_extensions.updated_at
       END`,
    [studentIds, automaticResults, notificationResultLabels]
  );

  console.log(
    `✅ Synced automatic examination results: cycle=${cycle}, `
      + `targets=${studentIds.length}, mapped=${mappedCount}`
  );

  return { syncedCount: studentIds.length, mappedCount };
}

/**
 * DBに残っているDiscord送信待ちを処理する。
 * PostgreSQL advisory lockで複数サーバーからの同時実行を防ぐ。
 */
export async function processPendingExaminationDiscordNotifications({
  pool,
  cycle = null,
  studentId = null,
}) {
  if (cycle !== null && !isValidExtensionCycle(cycle)) {
    throw new Error(`cycle must be between ${MIN_EXTENSION_CYCLE} and ${MAX_EXTENSION_CYCLE}`);
  }

  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lockResult = await client.query(
      `SELECT pg_try_advisory_lock(hashtext('examination_discord_notifications')) AS locked`
    );
    lockAcquired = lockResult.rows[0]?.locked === true;
    if (!lockAcquired) {
      console.log('⏳ Discord examination notification processing is already running');
      return { success: true, skipped: true, sentCount: 0, failedCount: 0 };
    }

    const cycles = cycle === null
      ? Array.from(
          { length: MAX_EXTENSION_CYCLE },
          (_, index) => index + MIN_EXTENSION_CYCLE
        )
      : [cycle];
    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    for (const cycleNumber of cycles) {
      const examinationResultColumn = `examination_result_${cycleNumber}`;
      const discordSentColumn = `discord_notification_sent_${cycleNumber}`;
      const discordPendingColumn = `discord_notification_pending_${cycleNumber}`;
      const discordResultLabelColumn = `discord_notification_result_label_${cycleNumber}`;
      const discordSentAtColumn = `discord_notification_sent_at_${cycleNumber}`;
      const params = [];
      const studentFilter = studentId ? 'AND extensions.student_id = $1' : '';
      if (studentId) params.push(studentId);

      const pendingResult = await client.query(
        `SELECT extensions.student_id,
                extensions.${discordResultLabelColumn} AS result_label,
                students.name,
                students.notion_url
           FROM student_extensions AS extensions
           LEFT JOIN notion_students_cache AS students
             ON students.student_id = extensions.student_id
          WHERE COALESCE(extensions.${discordPendingColumn}, FALSE)
            AND NOT COALESCE(extensions.${discordSentColumn}, FALSE)
            AND extensions.${examinationResultColumn} = '延長'
            ${studentFilter}
          ORDER BY extensions.student_id`,
        params
      );

      for (const pending of pendingResult.rows) {
        const notification = await sendExaminationResultNotification({
          name: pending.name,
          studentId: pending.student_id,
          notionUrl: pending.notion_url,
          resultLabel: pending.result_label,
        });

        if (notification.success) {
          await client.query(
            `UPDATE student_extensions
                SET ${discordSentColumn} = TRUE,
                    ${discordPendingColumn} = FALSE,
                    ${discordSentAtColumn} = CURRENT_TIMESTAMP
              WHERE student_id = $1
                AND COALESCE(${discordPendingColumn}, FALSE)
                AND NOT COALESCE(${discordSentColumn}, FALSE)`,
            [pending.student_id]
          );
          sentCount += 1;
        } else {
          failedCount += 1;
        }

        results.push({
          studentId: pending.student_id,
          cycle: cycleNumber,
          success: notification.success,
          error: notification.error,
        });
      }
    }

    return {
      success: failedCount === 0,
      skipped: false,
      sentCount,
      failedCount,
      results,
    };
  } finally {
    if (lockAcquired) {
      await client.query(
        `SELECT pg_advisory_unlock(hashtext('examination_discord_notifications'))`
      );
    }
    client.release();
  }
}

async function fetchFormResultsForOffsets(monthOffsets) {
  const resultsByOffset = new Map();
  const [firstOffset, ...remainingOffsets] = monthOffsets;

  const firstResult = await fetchAutomaticExaminationResultsForMonth(
    firstOffset,
    { forceRefresh: true }
  );
  resultsByOffset.set(firstOffset, firstResult);

  if (!firstResult.available) return resultsByOffset;

  const remainingResults = await Promise.all(
    remainingOffsets.map(offset => fetchAutomaticExaminationResultsForMonth(offset))
  );
  remainingOffsets.forEach((offset, index) => {
    resultsByOffset.set(offset, remainingResults[index]);
  });

  return resultsByOffset;
}

async function performFullAutomaticExaminationResultSync({
  pool,
  monthOffsets,
}) {
  const startedAt = Date.now();
  console.log(
    `🔄 Starting 30-minute examination result sync `
      + `(month offsets: ${monthOffsets.join(', ')})`
  );

  const formResultsByOffset = await fetchFormResultsForOffsets(monthOffsets);
  const unavailableOffset = monthOffsets.find(
    offset => !formResultsByOffset.get(offset)?.available
  );

  if (unavailableOffset !== undefined) {
    console.warn(
      `⚠️ Examination result sync skipped: form sheet unavailable `
        + `(monthOffset=${unavailableOffset})`
    );
    let discordNotifications = null;
    try {
      discordNotifications = await processPendingExaminationDiscordNotifications({ pool });
    } catch (error) {
      console.error('❌ Failed to retry pending Discord notifications:', error.message);
    }

    return {
      success: false,
      skipped: true,
      reason: 'form_sheet_unavailable',
      syncedCount: 0,
      mappedCount: 0,
      discordNotifications,
    };
  }

  const [students, suspensionData] = await Promise.all([
    fetchStudents(),
    fetchSuspensionData(),
  ]);
  const studentIds = students
    .map(student => String(student.studentId ?? '').trim())
    .filter(Boolean);
  const proStartMap = await fetchProStartDates(studentIds);

  const payloads = buildAutomaticExaminationSyncPayloads({
    students,
    suspensionData,
    proStartMap,
    formResultsByOffset,
    monthOffsets,
  });

  let syncedCount = 0;
  let mappedCount = 0;
  for (let cycle = MIN_EXTENSION_CYCLE; cycle <= MAX_EXTENSION_CYCLE; cycle += 1) {
    const result = await applyAutomaticExaminationResults({
      pool,
      cycle,
      automaticResultsByStudent: payloads.get(cycle),
    });
    syncedCount += result.syncedCount;
    mappedCount += result.mappedCount;
  }

  const discordNotifications = await processPendingExaminationDiscordNotifications({ pool });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(
    `✅ 30-minute examination result sync completed in ${durationSeconds}s: `
      + `targets=${syncedCount}, mapped=${mappedCount}`
  );

  return {
    success: true,
    skipped: false,
    syncedCount,
    mappedCount,
    discordNotifications,
    durationSeconds: Number(durationSeconds),
  };
}

/**
 * サーバー起動時および30分ごとに呼び出す全件同期。
 * 同期中に次の実行タイミングが来た場合は、進行中のPromiseを共有して二重実行を防ぐ。
 */
export function syncAllAutomaticExaminationResults({
  pool,
  monthOffsets = EXAMINATION_SYNC_MONTH_OFFSETS,
}) {
  if (fullSyncPromise) {
    console.log('⏳ Examination result sync already in progress; reusing it');
    return fullSyncPromise;
  }

  fullSyncPromise = performFullAutomaticExaminationResultSync({ pool, monthOffsets })
    .catch(error => {
      console.error('❌ 30-minute examination result sync failed:', error);
      return {
        success: false,
        skipped: false,
        error: error.message,
        syncedCount: 0,
        mappedCount: 0,
      };
    })
    .finally(() => {
      fullSyncPromise = null;
    });

  return fullSyncPromise;
}
