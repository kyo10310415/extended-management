import { ENTRY_PLAN_NAME } from './examinationCycle.js';

export const KPI_CALCULATION_VERSION = 2;

export function groupDashboardStandardExamTargets(students) {
  const eligible = (Array.isArray(students) ? students : []).filter(student =>
    student?.status === 'アクティブ' && student.plan !== ENTRY_PLAN_NAME
  );
  return {
    1: eligible.filter(student => student.adjustedMonths === 5),
    2: eligible.filter(student => student.adjustedMonths === 11),
    3: eligible.filter(student => student.adjustedMonths === 17),
  };
}

export function removeTargetOutsideStudents(students, targetOutsideIds) {
  const excluded = targetOutsideIds instanceof Set ? targetOutsideIds : new Set(targetOutsideIds || []);
  return students.filter(student => !excluded.has(student.studentId));
}

export function getDashboardProPlanTargets(students) {
  return (Array.isArray(students) ? students : []).filter(student =>
    student?.plan === '永久会員'
    || (student?.plan === '生徒プラン'
      && student.status === 'アクティブ'
      && student.adjustedMonths >= 17)
  );
}
