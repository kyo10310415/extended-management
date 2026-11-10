import express from 'express';
import { parseHistoryMonths, buildExaminationHistoryCsv } from '../services/examinationHistoryCsv.js';

export function createExaminationHistoryRouter({ queryable, fetchStudents, fetchSuspensionData, fetchProStartDates, lessonMonths, suspensionMonths, proMonths }) {
  const router = express.Router();
  router.get('/export.csv', async (req, res) => {
    if (!['admin', 'leader'].includes(req.user?.role)) return res.status(403).json({ error: '権限がありません。' });
    let months;
    try { months = parseHistoryMonths(req.query.from, req.query.to); }
    catch { return res.status(400).json({ error: '開始月・終了月は2000年以降の過去月で、20年以内の範囲を指定してください。' }); }
    try {
      const columns = Array.from({ length: 10 }, (_, n) => `extension_certainty_${n + 1}, examination_result_${n + 1}`).join(', ');
      const [students, suspensions, result] = await Promise.all([
        fetchStudents(), fetchSuspensionData({ strict: true }), queryable.query(`SELECT student_id, ${columns} FROM student_extensions`),
      ]);
      const proDates = await fetchProStartDates(students.map(s => s.studentId), { strict: true });
      const csv = buildExaminationHistoryCsv({ students, suspensions, extensions: result.rows, proDates, months, lessonMonths, suspensionMonths, proMonths });
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="examination-history-${req.query.from}-${req.query.to}.csv"`);
      return res.send(csv);
    } catch {
      console.error('[ExaminationHistory] CSV export failed');
      return res.status(500).json({ error: '審査履歴を取得できませんでした。時間をおいて再試行してください。' });
    }
  });
  return router;
}
