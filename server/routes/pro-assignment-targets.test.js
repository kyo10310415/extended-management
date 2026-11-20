import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProAssignments } from './pro-assignment-targets.js';

const deps = { lessonMonths: (start, offset) => start + offset, suspensionMonths: s => s || 0 };
test('previous PRO review extensions and next-month lifetime page starts form a unique union', () => {
  const students = [
    { studentId: 'BOTH', name: '両方', plan: '生徒プラン', status: 'アクティブ', lessonStartDate: 18 },
    { studentId: 'EXT', plan: 'PROプラン', status: 'アクティブ', lessonStartDate: 18 },
    { studentId: 'LIFE', plan: '永久会員', status: '退会', lessonStartDate: 0 },
    { studentId: 'SUSP', plan: '生徒プラン', status: 'アクティブ', lessonStartDate: 19 },
    { studentId: 'NO', plan: '生徒プラン', status: 'アクティブ', lessonStartDate: 18 },
    { studentId: 'WRONG', plan: '生徒プラン', status: 'アクティブ', lessonStartDate: 17 },
  ];
  const records = [
    { student_id: 'BOTH', examination_result_3: '延長', pro_plan_start_month: '2026-12' },
    { student_id: 'EXT', examination_result_3: '延長' }, { student_id: 'LIFE', pro_plan_start_month: '2026-12' },
    { student_id: 'SUSP', examination_result_3: '延長' }, { student_id: 'NO', examination_result_3: '退会', pro_plan_start_month: '2026-11' },
    { student_id: 'WRONG', examination_result_3: '延長' },
  ];
  const result = selectProAssignments(students, records, { SUSP: 1 }, deps, new Date('2026-11-20T00:00:00Z'));
  assert.deepEqual(result.data.map(s => s.studentId), ['BOTH', 'EXT', 'LIFE', 'SUSP']);
  assert.equal(result.previousMonth, '2026-10'); assert.equal(result.nextMonth, '2026-12');
});
test('Tokyo year boundaries and exact lifetime page eligibility are respected', () => {
  const result = selectProAssignments([{ studentId: 'A', plan: '永久会員' }, { studentId: 'B', plan: 'PROプラン', lessonStartDate: 18, status: 'アクティブ' }],
    [{ student_id: 'A', pro_plan_start_month: '2026-02' }, { student_id: 'B', pro_plan_start_month: '2026-02' }], {}, deps, new Date('2025-12-31T15:00:00Z'));
  assert.equal(result.previousMonth, '2025-12'); assert.equal(result.nextMonth, '2026-02');
  assert.deepEqual(result.data.map(s => s.studentId), ['A']);
});
