// Display names and request path segments are not proof of a registered student.
export function createStudentWriteIntegrity({ queryable }) {
  return async (req, res, next, studentId) => {
    if (req.method !== 'POST') return next();
    if (typeof studentId !== 'string' || !/^[A-Z]{4}[0-9]{6}-[A-Z]{2}$/.test(studentId)) {
      return res.status(400).json({ success: false, error: '学籍番号の形式が正しくありません。' });
    }
    try {
      const result = await queryable.query(
        'SELECT student_id FROM notion_students_cache WHERE student_id = $1 LIMIT 1',
        [studentId]
      );
      if (result.rows.length !== 1) {
        return res.status(404).json({ success: false, error: '生徒名簿に登録されていない学籍番号です。同期状況を確認してください。' });
      }
      return next();
    } catch {
      return res.status(503).json({ success: false, error: '生徒名簿を確認できないため保存を中止しました。' });
    }
  };
}
