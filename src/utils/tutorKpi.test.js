import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateTutorKpiSnapshots } from './tutorKpi.js'

test('Tutor別KPIは保存済み月次データの件数を合算し率を再計算する', () => {
  const result = aggregateTutorKpiSnapshots([
    {
      tutorKpi: [{
        tutor: 'Tutor A',
        exam1stTargetCount: 3,
        exam1stExtensionCount: 2,
        exam1stWithdrawalCount: 1,
        exam2ndTargetCount: 1,
        exam2ndExtensionCount: 1,
        exam2ndWithdrawalCount: 0,
        exam3rdTargetCount: 0,
        exam3rdExtensionCount: 0,
        exam3rdLifetimeCount: 0,
      }],
    },
    {
      tutorKpi: [{
        tutor: 'Tutor A',
        exam1stTargetCount: 1,
        exam1stExtensionCount: 0,
        exam1stWithdrawalCount: 1,
        exam2ndTargetCount: 1,
        exam2ndExtensionCount: 1,
        exam2ndWithdrawalCount: 0,
        exam3rdTargetCount: 2,
        exam3rdExtensionCount: 1,
        exam3rdLifetimeCount: 1,
      }],
    },
  ])

  assert.deepEqual(result, [{
    tutor: 'Tutor A',
    exam1stTargetCount: 4,
    exam1stExtensionCount: 2,
    exam1stWithdrawalCount: 2,
    exam2ndTargetCount: 2,
    exam2ndExtensionCount: 2,
    exam2ndWithdrawalCount: 0,
    exam3rdTargetCount: 2,
    exam3rdExtensionCount: 1,
    exam3rdLifetimeCount: 1,
    exam1stExtensionRate: 50,
    exam2ndExtensionRate: 100,
    exam3rdExtensionRate: 50,
    totalTargetCount: 8,
    totalExtensionCount: 5,
    overallExtensionRate: 62.5,
  }])
})

test('Tutor別KPI累計は空データを無視しTutorごとに分ける', () => {
  const result = aggregateTutorKpiSnapshots([
    { tutorKpi: null },
    {
      tutorKpi: [
        { tutor: 'Tutor B', exam1stTargetCount: 2, exam1stExtensionCount: 1 },
        { tutor: 'Tutor A', exam1stTargetCount: 1, exam1stExtensionCount: 1 },
      ],
    },
  ])

  assert.deepEqual(result.map(row => row.tutor), ['Tutor A', 'Tutor B'])
  assert.equal(result[0].overallExtensionRate, 100)
  assert.equal(result[1].overallExtensionRate, 50)
})
