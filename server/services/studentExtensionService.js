import { MAX_EXTENSION_CYCLE } from '../utils/examinationCycle.js';

function getHearingColumns(cycle) {
  const cycleNumber = Number(cycle);
  if (
    !Number.isInteger(cycleNumber)
    || cycleNumber < 1
    || cycleNumber > MAX_EXTENSION_CYCLE
  ) {
    throw new Error(`cycle must be between 1 and ${MAX_EXTENSION_CYCLE}`);
  }

  return {
    certainty: `extension_certainty_${cycleNumber}`,
    hearing: `hearing_status_${cycleNumber}`,
    notes: `notes_${cycleNumber}`,
  };
}

/**
 * ヒアリング画面で編集できる3項目だけを保存する。
 * 審査自動化用カラムに依存させず、ヒアリング保存への影響を分離する。
 */
export async function saveHearingExtensionData({
  queryable,
  studentId,
  cycle,
  extensionCertainty,
  hearingStatus,
  notes,
}) {
  const columns = getHearingColumns(cycle);
  const result = await queryable.query(
    `INSERT INTO student_extensions (
       student_id,
       ${columns.certainty},
       ${columns.hearing},
       ${columns.notes},
       updated_at
     )
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT (student_id)
     DO UPDATE SET
       ${columns.certainty} = EXCLUDED.${columns.certainty},
       ${columns.hearing} = EXCLUDED.${columns.hearing},
       ${columns.notes} = EXCLUDED.${columns.notes},
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [studentId, extensionCertainty, hearingStatus, notes]
  );

  const row = result.rows[0];
  return {
    student_id: row.student_id,
    extension_certainty: row[columns.certainty],
    hearing_status: row[columns.hearing] || false,
    notes: row[columns.notes] ?? '',
    updated_at: row.updated_at,
    created_at: row.created_at,
  };
}
