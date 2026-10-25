const RESULTS = new Set(['', '延長', 'アップセル', '在籍', '退会', '永久会員', '未払い', '音信不通']);
const CERTAINTIES = new Set(['', '高', '中', '低', '対象外']);
const FIELDS = new Set(['cycle', 'extension_certainty', 'hearing_status', 'notes', 'examination_result', 'send_discord_notification']);
const STUDENT_FIELDS = ['student_id', 'extension_certainty', 'hearing_status', 'notes', 'examination_result', 'updated_at', 'created_at'];

export function readCycle(value = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : null;
}

// Crew has its own assigned list. All legacy/global APIs remain closed unless
// explicitly authorized below, before their handlers or automation can run.
export function createCrewAccessMiddleware({ queryable }) {
  return async (req, res, next) => {
    if (req.user?.role !== 'crew') return next();
    if (!req.path.toLowerCase().startsWith('/api')) return next();
    if (req.method === 'GET' && req.path === '/api/auth/me') return next();
    const deny = () => res.status(403).json({ error: '担当生徒へのアクセス権限を確認できません。' });
    if (!req.user.tutorName) return deny();
    if (req.method === 'GET' && req.path === '/api/crew/students') return next();
    const match = req.path.match(/^\/api\/students\/([^/]+)(\/hearing)?$/);
    if (!match || !['GET', 'POST'].includes(req.method) || (match[2] && req.method !== 'POST')) return deny();
    let studentId;
    try { studentId = decodeURIComponent(match[1]); } catch { return deny(); }
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(studentId)) return deny();
    const cycle = readCycle(req.method === 'POST' ? req.body?.cycle : req.query.cycle);
    if (!cycle) return res.status(400).json({ error: 'cycle must be between 1 and 10' });
    try {
      const assigned = await queryable.query(
        `SELECT s.student_id FROM notion_students_cache s CROSS JOIN notion_student_access_snapshot a
          WHERE a.id = 1 AND a.synced_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
            AND a.student_ids @> jsonb_build_array(s.student_id)
            AND s.student_id = $1 AND s.tutor = $2`,
        [studentId, req.user.tutorName]
      );
      if (assigned.rows.length !== 1) return deny();
      if (req.method === 'POST') {
        const body = req.body;
        if (!body || Object.keys(body).some(key => !FIELDS.has(key))
          || !CERTAINTIES.has(body.extension_certainty) || typeof body.hearing_status !== 'boolean'
          || typeof body.notes !== 'string' || body.notes.length > 5000
          || (!match[2] && !RESULTS.has(body.examination_result))
          || (body.send_discord_notification !== undefined && typeof body.send_discord_notification !== 'boolean')
          || (match[2] && (body.examination_result !== undefined || body.send_discord_notification !== undefined))) {
          return res.status(400).json({ error: '更新内容が無効です。' });
        }
        if (!match[2]) {
          const current = await queryable.query(
            `SELECT examination_result_${cycle} AS result FROM student_extensions WHERE student_id = $1`, [studentId]
          );
          // Derive the business transition from stored data, not a client flag.
          body.examination_result_manually_changed = (current.rows[0]?.result || '') !== body.examination_result;
        }
      }
      const json = res.json.bind(res);
      res.json = body => {
        if (res.statusCode >= 400) return json({ success: false, error: '処理できませんでした。権限または入力内容を確認してください。' });
        if (body?.data) body = { success: body.success, data: Object.fromEntries(STUDENT_FIELDS
          .filter(key => Object.hasOwn(body.data, key)).map(key => [key, body.data[key]])) };
        return json(body);
      };
      return next();
    } catch {
      return res.status(503).json({ error: '担当情報を確認できません。時間をおいて開き直してください。' });
    }
  };
}

export function createAssignedStudentsHandler({ queryable }) {
  return async (req, res) => {
    if (req.user?.role !== 'crew' || !req.user.tutorName) return res.status(403).json({ error: '担当者の対応登録が必要です。' });
    const cycle = readCycle(req.query.cycle);
    if (!cycle) return res.status(400).json({ error: 'cycle must be between 1 and 10' });
    try {
      const snapshot = await queryable.query(`SELECT 1 FROM notion_student_access_snapshot
        WHERE id = 1 AND synced_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'`);
      if (snapshot.rows.length !== 1) return res.status(503).json({ error: '担当情報の同期が必要です。管理者にお問い合わせください。' });
      const result = await queryable.query(
        `SELECT s.student_id AS "studentId", s.name, s.tutor, s.plan, s.status,
                TO_CHAR(s.lesson_start_date, 'YYYY-MM-DD') AS "lessonStartDate",
                e.extension_certainty_${cycle} AS extension_certainty,
                COALESCE(e.hearing_status_${cycle}, FALSE) AS hearing_status,
                COALESCE(e.notes_${cycle}, '') AS notes,
                COALESCE(e.examination_result_${cycle}, '') AS examination_result
           FROM notion_students_cache s LEFT JOIN student_extensions e ON e.student_id = s.student_id
           CROSS JOIN notion_student_access_snapshot a
          WHERE a.id = 1 AND a.synced_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
            AND a.student_ids @> jsonb_build_array(s.student_id)
            AND s.tutor = $1 ORDER BY s.student_id`, [req.user.tutorName]
      );
      return res.json({ success: true, data: result.rows, count: result.rows.length, cycle });
    } catch {
      return res.status(503).json({ error: '担当生徒を取得できません。管理者にお問い合わせください。' });
    }
  };
}
