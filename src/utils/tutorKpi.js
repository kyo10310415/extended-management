const COUNT_FIELDS = Object.freeze([
  'exam1stTargetCount',
  'exam1stExtensionCount',
  'exam1stWithdrawalCount',
  'exam2ndTargetCount',
  'exam2ndExtensionCount',
  'exam2ndWithdrawalCount',
  'exam3rdTargetCount',
  'exam3rdExtensionCount',
  'exam3rdLifetimeCount',
])

function toCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

function calculateRate(extensionCount, targetCount) {
  if (targetCount <= 0) return 0
  return Math.round((extensionCount / targetCount) * 10000) / 100
}

/**
 * 保存済み月次スナップショットをTutorごとに合算する。
 * 延長率は月別率を平均せず、累計件数から再計算する。
 */
export function aggregateTutorKpiSnapshots(snapshots) {
  const tutorMap = new Map()

  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    for (const row of Array.isArray(snapshot?.tutorKpi) ? snapshot.tutorKpi : []) {
      const tutor = String(row?.tutor ?? '').trim() || '未設定'
      if (!tutorMap.has(tutor)) {
        tutorMap.set(tutor, Object.fromEntries(COUNT_FIELDS.map(field => [field, 0])))
      }

      const totals = tutorMap.get(tutor)
      for (const field of COUNT_FIELDS) {
        totals[field] += toCount(row?.[field])
      }
    }
  }

  return [...tutorMap.entries()]
    .map(([tutor, totals]) => {
      const totalTargetCount = totals.exam1stTargetCount
        + totals.exam2ndTargetCount
        + totals.exam3rdTargetCount
      const totalExtensionCount = totals.exam1stExtensionCount
        + totals.exam2ndExtensionCount
        + totals.exam3rdExtensionCount

      return {
        tutor,
        ...totals,
        exam1stExtensionRate: calculateRate(
          totals.exam1stExtensionCount,
          totals.exam1stTargetCount
        ),
        exam2ndExtensionRate: calculateRate(
          totals.exam2ndExtensionCount,
          totals.exam2ndTargetCount
        ),
        exam3rdExtensionRate: calculateRate(
          totals.exam3rdExtensionCount,
          totals.exam3rdTargetCount
        ),
        totalTargetCount,
        totalExtensionCount,
        overallExtensionRate: calculateRate(totalExtensionCount, totalTargetCount),
      }
    })
    .sort((a, b) => b.overallExtensionRate - a.overallExtensionRate)
}
