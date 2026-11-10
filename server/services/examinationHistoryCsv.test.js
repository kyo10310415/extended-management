import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryMonths, buildExaminationHistoryCsv, csvCell } from './examinationHistoryCsv.js';
import { createExaminationHistoryRouter } from '../routes/examination-history.js';
import express from 'express';

test('history period is bounded, historical only and Tokyo based', () => {
  assert.deepEqual(parseHistoryMonths('2026-09', '2026-10', new Date('2026-10-31T15:00:00Z')),
    [{ label: '2026/09', offset: -2 }, { label: '2026/10', offset: -1 }]);
  for (const [from, to] of [['2026-10','2026-09'], ['2026-09','2026-11'], ['2026-00','2026-10'], ['1999-01','2026-10'], ['2000-01','2026-10'], [['2026-09'],'2026-10']]) {
    assert.throws(() => parseHistoryMonths(from, to, new Date('2026-11-10T00:00:00Z')));
  }
});

test('monthly pivot retains withdrawals, blank assessments, PRO rounds and overlapping exams', () => {
  const students = [
    { studentId: 'A', name: '退会済み', status: '正規退会', lessonStartDate: 7 },
    { studentId: 'B', name: 'PRO', lessonStartDate: 19 },
    { studentId: 'C', name: '未入力', lessonStartDate: 12 },
    { studentId: 'D', name: 'EP', plan: 'エントリープラン', lessonStartDate: 7 },
    { studentId: 'E', name: '対象外', lessonStartDate: 2 },
  ];
  const csv = buildExaminationHistoryCsv({ students,
    extensions: [{ student_id: 'A', extension_certainty_1: '高', examination_result_1: '退会' },
      { student_id: 'B', extension_certainty_3: '低', examination_result_3: '延長', extension_certainty_7: '高', examination_result_7: '永久会員' }],
    proDates: { B: { proStartDate: 25 } }, suspensions: {},
    months: [{ label: '2026/09', offset: -2 }, { label: '2026/10', offset: -1 }],
    lessonMonths: (start, offset) => start + offset, suspensionMonths: () => 0,
    proMonths: (start, offset) => start ? start + offset : null,
  });
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[1], '"退会済み","A","1回目","高","退会","","",""');
  assert.match(lines[2], /"3回目 \/ 7回目","3回目: 低 \/ 7回目: 高","3回目: 延長 \/ 7回目: 永久会員"/);
  assert.equal(lines[3], '"未入力","C","","","","2回目","",""');
  assert.doesNotMatch(csv, /対象外|"EP"/);
});

test('suspensions affect target month and round 10 is supported', () => {
  const csv = buildExaminationHistoryCsv({ students: [{ studentId: 'A', lessonStartDate: 6 }], extensions: [],
    suspensions: { A: { months: 1 } }, proDates: { A: { proStartDate: 41 } }, months: [{ label: '2026/09', offset: 0 }],
    lessonMonths: x => x, suspensionMonths: x => x.months, proMonths: x => x,
  });
  assert.match(csv, /1回目 \/ 10回目/);
});

test('CSV safely quotes commas, quotes, newlines and formulas', () => {
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  for (const value of ['=1+1', '+1', '-1', '@SUM(1)', '  =1', '\ttext']) assert.ok(csvCell(value).startsWith('"\''));
});

async function fixture(t, { role = 'leader', fail = false } = {}) {
  const calls = [];
  const app = express();
  app.use((req, res, next) => { req.user = { role }; next(); });
  app.use(createExaminationHistoryRouter({
    queryable: { query: async sql => { calls.push(sql); return { rows: [] }; } },
    fetchStudents: async () => { if (fail) throw new Error('SYNTHETIC_PRIVATE_DATA'); return []; },
    fetchSuspensionData: async options => { assert.equal(options.strict, true); return {}; },
    fetchProStartDates: async (ids, options) => { assert.equal(options.strict, true); return {}; },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls, request: query => fetch(`http://127.0.0.1:${server.address().port}/export.csv?${query}`) };
}

test('export route validates before loading data and denies crew', async t => {
  const denied = await fixture(t, { role: 'crew' });
  assert.equal((await denied.request('from=2026-09&to=2026-10')).status, 403);
  assert.equal(denied.calls.length, 0);
  const f = await fixture(t);
  assert.equal((await f.request('from=invalid&to=2026-10')).status, 400);
  assert.equal(f.calls.length, 0);
  const response = await f.request('from=2026-09&to=2026-10');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /2026\/09 延長確度/);
  assert.match(f.calls[0], /extension_certainty_10, examination_result_10/);
});

test('export failures return a fixed message without private upstream details', async t => {
  const f = await fixture(t, { fail: true });
  const response = await f.request('from=2026-09&to=2026-10');
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /SYNTHETIC_PRIVATE_DATA/);
});
