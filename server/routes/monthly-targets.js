import express from 'express';
import { timingSafeEqual } from 'node:crypto';

export function monthlyTargets(students, suspensions, proDates, { lessonMonths, suspensionMonths, proMonths }) {
  return students.flatMap(s => {
    const hearing = [], examination = [];
    const active = s.status === 'アクティブ';
    const months = Math.max(0, lessonMonths(s.lessonStartDate) - suspensionMonths(suspensions[s.studentId]));
    if (active && s.plan !== 'エントリープラン') {
      if ([4, 10].includes(months)) hearing.push((months - 4) / 6 + 1);
      if ([5, 11, 17].includes(months)) examination.push((months - 5) / 6 + 1);
    }
    // Match the separate EP examination and PRO hearing lists.
    if (active && months === 16) hearing.push(3);
    if (active && s.plan === 'エントリープラン' && months >= 5 && (months - 5) % 6 === 0 && months <= 59) examination.push((months - 5) / 6 + 1);
    const pro = proMonths(proDates[s.studentId]?.proStartDate);
    for (let round = 4; round <= 10; round++) {
      if (pro === 4 + (round - 4) * 6) hearing.push(round);
      if (active && pro === 5 + (round - 4) * 6) examination.push(round);
    }
    return s.studentId && (hearing.length || examination.length) ? [{ studentId: s.studentId, hearing, examination }] : [];
  });
}

export function createMonthlyTargetsRouter(deps, env = process.env) {
  const router = express.Router();
  let pending, cached;
  router.get('/current', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const expected = env.EXTENSION_TARGETS_READ_TOKEN;
    const actual = req.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!expected || expected.length < 32 || !actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected)
      || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return res.status(401).json({ error: 'Read token required' });
    const month = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(new Date());
    try {
      if (!cached || cached.month !== month || Date.now() - cached.at > 60000) {
        if (!pending) pending = (async () => {
          const [students, suspensions] = await Promise.all([deps.fetchStudents(), deps.fetchSuspensionData({ strict: true })]);
          const proDates = await deps.fetchProStartDates(students.map(s => s.studentId), { strict: true });
          const data = monthlyTargets(students, suspensions, proDates, deps);
          cached = { month, at: Date.now(), data };
        })().finally(() => { pending = null; });
        await pending;
      }
      return res.json({ success: true, month: cached.month, data: cached.data });
    } catch {
      console.error('[MonthlyTargets] Target retrieval failed');
      return res.status(503).json({ error: 'Monthly targets unavailable' });
    }
  });
  return router;
}
