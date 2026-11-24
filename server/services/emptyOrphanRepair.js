// A recoverable, bounded repair for pre-existing empty records. Never remap an ID
// or discard notes, review results, notification state, dates or financial data.
export async function quarantineEmptyOrphans(queryable) {
  const snapshot = await queryable.query(`
    SELECT 1 FROM notion_student_access_snapshot
    WHERE id = 1 AND synced_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
      AND jsonb_array_length(student_ids) > 0
  `);
  if (snapshot.rows.length !== 1) return { skipped: true, archived: 0 };

  await queryable.query(`
    CREATE TABLE IF NOT EXISTS data_integrity_archives (
      id BIGSERIAL PRIMARY KEY,
      source_table TEXT NOT NULL,
      student_id TEXT NOT NULL,
      original_data JSONB NOT NULL,
      reason TEXT NOT NULL,
      archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let archived = 0;
  // Table identifiers are a fixed allowlist, never request input.
  for (const table of ['student_extensions', 'pro_plan_data']) {
    const result = await queryable.query(`
      WITH candidates AS (
        SELECT s.id FROM ${table} s
        WHERE NOT EXISTS (SELECT 1 FROM notion_students_cache c WHERE c.student_id = s.student_id)
          AND (s.student_id !~ '^[A-Z]{4}[0-9]{6}-[A-Z]{2}$'
            OR (s.created_at < TIMESTAMP '2026-11-24 00:00:00'
              AND s.updated_at < TIMESTAMP '2026-11-24 00:00:00'))
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(to_jsonb(s) - 'id' - 'student_id' - 'created_at' - 'updated_at') e
            WHERE e.value NOT IN ('null'::jsonb, 'false'::jsonb, '""'::jsonb, '0'::jsonb)
          )
        FOR UPDATE OF s
      ), removed AS (
        DELETE FROM ${table} s USING candidates c
        WHERE s.id = c.id RETURNING s.*
      ), archived AS (
        INSERT INTO data_integrity_archives (source_table, student_id, original_data, reason)
        SELECT $1, r.student_id, to_jsonb(r), 'empty-unregistered-record-2026-11-24'
        FROM removed r RETURNING id
      )
      SELECT COUNT(*)::int AS count FROM archived
    `, [table]);
    // Deletion and archival are one atomic statement: a failed backup rolls back
    // the deletion, rather than leaving an unprotected gap between two writes.
    archived += Number(result.rows[0]?.count || 0);
  }
  return { skipped: false, archived };
}
