import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateExtensionRateVsResult,
  calculateExtensionCertaintyStats,
  getAdvancedExaminationTargets,
} from './dashboardKpi.js'

test('対結果お伝えの延長率は延長と退会・永久会員だけを分母にする', () => {
  assert.equal(calculateExtensionRateVsResult(8, 2), 80)
  assert.equal(calculateExtensionRateVsResult(0, 0), 0)
  assert.equal(calculateExtensionRateVsResult('3', '1'), 75)
})

test('延長審査各ページの表示対象から入力済み延長確度を集計する', () => {
  const students = [
    { extensionData: { extension_certainty: '高' } },
    { extensionData: { extension_certainty: '中' } },
    { extensionData: { extension_certainty: '低' } },
    { extensionData: { extension_certainty: '高' } },
    { extensionData: { extension_certainty: '' } },
    { extensionData: { extension_certainty: '対象外' } },
    { extensionData: null },
  ]

  assert.deepEqual(calculateExtensionCertaintyStats(students), {
    filledCount: 4,
    highCount: 2,
    midCount: 1,
    lowCount: 1,
  })
})

test('Pro審査4回目以降はアクティブな各回の対象者を抽出する', () => {
  const targets = getAdvancedExaminationTargets([
    { studentId: 'ROUND-4', status: 'アクティブ', proPlanMonths: 5 },
    { studentId: 'ROUND-5', status: 'アクティブ', proPlanMonths: 11 },
    { studentId: 'ROUND-10', status: 'アクティブ', proPlanMonths: 41 },
    { studentId: 'INACTIVE', status: '休会', proPlanMonths: 5 },
    { studentId: 'NOT-TARGET', status: 'アクティブ', proPlanMonths: 6 },
  ])

  assert.deepEqual(
    targets.map(student => [student.studentId, student.round]),
    [['ROUND-4', 4], ['ROUND-5', 5], ['ROUND-10', 10]]
  )
})
