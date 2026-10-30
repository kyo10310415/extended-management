const CERTAINTIES = new Set(['', '高', '中', '低', '対象外']);
const FIELDS = new Set(['cycle', 'extension_certainty', 'hearing_status', 'notes']);
const STUDENT_FIELDS = ['student_id', 'extension_certainty', 'hearing_status', 'notes', 'examination_result', 'updated_at', 'created_at'];
const CREW_READ_PATHS = new Set([
  '/api/notion/students', '/api/notion/hearing', '/api/notion/examination',
  '/api/notion/entry-plan-examination', '/api/notion/pro-hearing',
  '/api/notion/pro-examination', '/api/notion/suspension-history',
  '/api/pro-plan/students', '/api/pro-plan/advanced-hearing',
  '/api/pro-plan/advanced-examination', '/api/pro-plan/advanced-all',
  '/api/forced-withdrawals', '/api/kpi-export/current-kpi',
  '/api/kpi-snapshots', '/api/kpi-snapshots/list',
  '/api/kpi-settings',
]);

export function readCycle(value = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 10 ? number : null;
}

// Crew can view all current students and update hearing fields only. Other APIs remain closed unless
// explicitly authorized below, before their handlers or automation can run.
export function createCrewAccessMiddleware({ queryable }) {
  return async (req, res, next) => {
    if (req.user?.role !== 'crew') return next();
    if (!req.path.toLowerCase().startsWith('/api')) return next();
    if (req.method === 'GET' && req.path === '/api/auth/me') return next();
    const deny = () => res.status(403).json({ error: 'この操作はcrewに許可されていません。' });
    if (req.method === 'GET' && (CREW_READ_PATHS.has(req.path)
      || /^\/api\/kpi-snapshots\/\d{4}-\d{2}$/.test(req.path)
      || /^\/api\/forced-withdrawals\/student\/[A-Za-z0-9_-]{1,50}$/.test(req.path))) return next();
    // These POST routes only read records; permit their exact input contracts.
    if (req.method === 'POST' && ['/api/students/bulk', '/api/pro-plan/bulk'].includes(req.path)) {
      const body = req.body;
      const allowed = req.path === '/api/students/bulk' ? ['studentIds', 'cycle'] : ['studentIds'];
      if (!body || Object.keys(body).some(key => !allowed.includes(key))
        || !Array.isArray(body.studentIds) || body.studentIds.length < 1 || body.studentIds.length > 10000
        || body.studentIds.some(value => typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(value))
        || (req.path === '/api/students/bulk' && !readCycle(body.cycle))) return res.status(400).json({ error: 'Invalid read request' });
      return next();
    }
    if (req.method === 'GET' && req.path === '/api/crew/students') return next();
    const match = req.path.match(/^\/api\/students\/([^/]+)(\/hearing)?$/);
    if (!match || !(req.method === 'GET' && !match[2] || req.method === 'POST' && match[2])) return deny();
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
            AND s.student_id = $1`,
        [studentId]
      );
      if (assigned.rows.length !== 1) return deny();
      if (req.method === 'POST') {
        const body = req.body;
        if (!body || Object.keys(body).some(key => !FIELDS.has(key))
          || !CERTAINTIES.has(body.extension_certainty) || typeof body.hearing_status !== 'boolean'
          || typeof body.notes !== 'string' || body.notes.length > 5000
          ) {
          return res.status(400).json({ error: '更新内容が無効です。' });
        }
      }
      const json = res.json.bind(res);
      res.json = body => {
        if (res.statusCode >= 400) return json({ success: false, error: '処理できませんでした。権限または入力内容を確認してください。' });
        if (req.method !== 'GET' && body?.data) body = { success: body.success, data: Object.fromEntries(STUDENT_FIELDS
          .filter(key => Object.hasOwn(body.data, key)).map(key => [key, body.data[key]])) };
        return json(body);
      };
      return next();
    } catch {
      return res.status(503).json({ error: '生徒情報を確認できません。時間をおいて開き直してください。' });
    }
  };
}

export function createCrewStudentsHandler({ queryable }) {
  return async (req, res) => {
    if (req.user?.role !== 'crew') return res.status(403).json({ error: 'Forbidden' });
    const cycle = readCycle(req.query.cycle);
    if (!cycle) return res.status(400).json({ error: 'cycle must be between 1 and 10' });
    try {
      const snapshot = await queryable.query(`SELECT 1 FROM notion_student_access_snapshot
        WHERE id = 1 AND synced_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'`);
      if (snapshot.rows.length !== 1) return res.status(503).json({ error: '生徒データの同期が必要です。管理者にお問い合わせください。' });
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
          ORDER BY s.student_id`
      );
      return res.json({ success: true, data: result.rows, count: result.rows.length, cycle });
    } catch {
      return res.status(503).json({ error: '生徒を取得できません。管理者にお問い合わせください。' });
    }
  };
}
