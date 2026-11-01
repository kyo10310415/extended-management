import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDashboardProPlanTargets,
  groupDashboardStandardExamTargets,
  removeTargetOutsideStudents,
} from './kpiTargets.js';

test('スナップショット対象者はダッシュボードのプラン・状態・休会調整後月数に従う', () => {
  const students = [
    { studentId: 'cycle-1', status: 'アクティブ', plan: '生徒プラン', adjustedMonths: 5 },
    { studentId: 'cycle-2', status: 'アクティブ', plan: '生徒プラン', adjustedMonths: 11 },
    { studentId: 'cycle-3', status: 'アクティブ', plan: '生徒プラン', adjustedMonths: 17 },
    { studentId: 'entry', status: 'アクティブ', plan: 'エントリープラン', adjustedMonths: 5 },
    { studentId: 'inactive', status: '休会', plan: '生徒プラン', adjustedMonths: 5 },
  ];
  const grouped = groupDashboardStandardExamTargets(students);
  assert.deepEqual(grouped[1].map(student => student.studentId), ['cycle-1']);
  assert.deepEqual(grouped[2].map(student => student.studentId), ['cycle-2']);
  assert.deepEqual(grouped[3].map(student => student.studentId), ['cycle-3']);
});

test('延長確度が対象外の生徒はKPI対象から除外する', () => {
  const students = [{ studentId: 'included' }, { studentId: 'excluded' }];
  assert.deepEqual(
    removeTargetOutsideStudents(students, new Set(['excluded'])).map(student => student.studentId),
    ['included']
  );
});

test('Pro成約率の分母はダッシュボード表示対象と同じ', () => {
  const students = [
    { studentId: 'lifetime', plan: '永久会員', status: '退会', adjustedMonths: 1 },
    { studentId: 'pro-active', plan: '生徒プラン', status: 'アクティブ', adjustedMonths: 17 },
    { studentId: 'too-early', plan: '生徒プラン', status: 'アクティブ', adjustedMonths: 16 },
    { studentId: 'inactive', plan: '生徒プラン', status: '休会', adjustedMonths: 20 },
  ];
  assert.deepEqual(
    getDashboardProPlanTargets(students).map(student => student.studentId),
    ['lifetime', 'pro-active']
  );
});
