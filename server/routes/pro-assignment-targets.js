export function selectProAssignments(students, records, suspensions, deps, now = new Date()) {
  const currentMonth = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now);
  const [year, month] = currentMonth.split('-').map(Number);
  const shifted = offset => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  const previousMonth = shifted(-1), nextMonth = shifted(1);
  const byId = new Map(records.map(r => [r.student_id, r]));
  const selected = new Map();
  for (const s of students) {
    const record = byId.get(s.studentId) || {};
    const adjusted = offset => Math.max(0, deps.lessonMonths(s.lessonStartDate, offset) - deps.suspensionMonths(suspensions[s.studentId], offset));
    const extended = s.status === 'アクティブ' && s.plan !== 'エントリープラン' && adjusted(-1) === 17 && record.examination_result_3 === '延長';
    const lifetimePage = s.plan === '永久会員' || (s.plan === '生徒プラン' && s.status === 'アクティブ' && adjusted(0) >= 17);
    const startsNext = lifetimePage && record.pro_plan_start_month === nextMonth;
    if (s.studentId && (extended || startsNext)) selected.set(s.studentId, {
      studentId: s.studentId, name: s.name || '', tutor: s.tutor || '', plan: s.plan || '',
      lessonStartDate: s.lessonStartDate || null, notionUrl: s.notionUrl || '',
    });
  }
  return { success: true, month: currentMonth, previousMonth, nextMonth, data: [...selected.values()] };
}

export function createProAssignmentHandler(deps) {
  return async (req, res) => {
    try {
      const [students, suspensions, records] = await Promise.all([
        deps.fetchStudents(), deps.fetchSuspensionData({ strict: true }), deps.queryable.query(`
          SELECT COALESCE(e.student_id,p.student_id) AS student_id,e.examination_result_3,p.pro_plan_start_month
          FROM student_extensions e FULL OUTER JOIN pro_plan_data p ON p.student_id=e.student_id`),
      ]);
      return res.json(selectProAssignments(students, records.rows, suspensions, deps));
    } catch {
      console.error('[ProAssignments] Target lookup failed');
      return res.status(503).json({ error: 'PRO assignment targets unavailable' });
    }
  };
}
