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

const CSV_COLUMNS = Object.freeze([
  { key: 'tutor', label: '担当Tutor' },
  { key: 'exam1stTargetCount', label: '1回目対象' },
  { key: 'exam1stExtensionCount', label: '1回目延長' },
  { key: 'exam1stWithdrawalCount', label: '1回目退会' },
  { key: 'exam1stExtensionRate', label: '1回目延長率', isRate: true },
  { key: 'exam2ndTargetCount', label: '2回目対象' },
  { key: 'exam2ndExtensionCount', label: '2回目延長' },
  { key: 'exam2ndWithdrawalCount', label: '2回目退会' },
  { key: 'exam2ndExtensionRate', label: '2回目延長率', isRate: true },
  { key: 'exam3rdTargetCount', label: '3回目対象' },
  { key: 'exam3rdExtensionCount', label: '3回目延長' },
  { key: 'exam3rdLifetimeCount', label: '3回目永久会員' },
  { key: 'exam3rdExtensionRate', label: '3回目延長率', isRate: true },
  { key: 'totalTargetCount', label: '合計対象' },
  { key: 'totalExtensionCount', label: '合計延長' },
  { key: 'overallExtensionRate', label: '全体延長率', isRate: true },
])

function toCount(value) {
  const count = Number(value)
  return Number.isFinite(count) ? count : 0
}

function calculateRate(extensionCount, targetCount) {
  if (targetCount <= 0) return 0
  return Math.round((extensionCount / targetCount) * 10000) / 100
}

function escapeCsvCell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Tutor別KPIの累計データを、Excelで文字化けしにくいBOM付きCSVへ変換する。
 */
export function buildTutorKpiCumulativeCsv(tutorData) {
  const header = CSV_COLUMNS.map(column => escapeCsvCell(column.label)).join(',')
  const rows = (Array.isArray(tutorData) ? tutorData : []).map(row =>
    CSV_COLUMNS.map(column => {
      const value = column.isRate
        ? `${Number(row?.[column.key] ?? 0).toFixed(1)}%`
        : row?.[column.key] ?? 0
      return escapeCsvCell(value)
    }).join(',')
  )

  return `\uFEFF${[header, ...rows].join('\r\n')}`
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
