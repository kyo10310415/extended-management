const CERTAINTY_LEVELS = Object.freeze(['高', '中', '低'])

/**
 * 延長審査ページの表示対象から、入力済みの延長確度を集計する。
 * 「対象外」や空欄は記入済み件数に含めない。
 */
export function calculateExtensionCertaintyStats(students) {
  const counts = { 高: 0, 中: 0, 低: 0 }

  for (const student of Array.isArray(students) ? students : []) {
    const certainty = String(student?.extensionData?.extension_certainty ?? '').trim()
    if (CERTAINTY_LEVELS.includes(certainty)) counts[certainty] += 1
  }

  return {
    filledCount: counts.高 + counts.中 + counts.低,
    highCount: counts.高,
    midCount: counts.中,
    lowCount: counts.低,
  }
}

/**
 * 生徒マスタのPRO継続月数から、4〜10回目の延長審査対象を抽出する。
 */
export function getAdvancedExaminationTargets(students, maxRound = 10) {
  const targets = []

  for (const student of Array.isArray(students) ? students : []) {
    if (student?.status !== 'アクティブ') continue

    for (let round = 4; round <= maxRound; round += 1) {
      const targetMonth = 5 + ((round - 4) * 6)
      if (Number(student.proPlanMonths) === targetMonth) {
        targets.push({ ...student, round })
        break
      }
    }
  }

  return targets
}
