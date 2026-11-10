export function parseHistoryMonths(from, to, now = new Date()) {
  const current = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now);
  const index = value => {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('invalid month');
    return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
  };
  const first = index(from), last = index(to), present = index(current);
  if (first > last || last >= present || last - first >= 240 || first < 2000 * 12) throw new Error('invalid range');
  return Array.from({ length: last - first + 1 }, (_, n) => {
    const absolute = first + n;
    return { label: `${Math.floor(absolute / 12)}/${String(absolute % 12 + 1).padStart(2, '0')}`, offset: absolute - present };
  });
}

export function csvCell(value) {
  let text = String(value ?? '');
  // Treat spreadsheet formulas as text, including formulas hidden behind whitespace.
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildExaminationHistoryCsv({ students, extensions, proDates, suspensions, months, lessonMonths, suspensionMonths, proMonths }) {
  const stored = new Map(extensions.map(row => [row.student_id, row]));
  const header = ['生徒名', '学籍番号', ...months.flatMap(m => [`${m.label} 審査回`, `${m.label} 延長確度`, `${m.label} 審査結果`])];
  const rows = [header];
  for (const student of [...students].sort((a, b) => String(a.studentId).localeCompare(String(b.studentId)))) {
    if (!student.studentId || student.plan === 'エントリープラン') continue;
    const data = stored.get(student.studentId) || {};
    let targeted = false;
    const cells = months.flatMap(month => {
      const adjusted = Math.max(0, lessonMonths(student.lessonStartDate, month.offset)
        - suspensionMonths(suspensions[student.studentId], month.offset));
      const pro = proMonths(proDates[student.studentId]?.proStartDate, month.offset);
      const rounds = [];
      if ([5, 11, 17].includes(adjusted)) rounds.push((adjusted - 5) / 6 + 1);
      for (let round = 4; round <= 10; round++) if (pro === 5 + (round - 4) * 6) rounds.push(round);
      if (!rounds.length) return ['', '', ''];
      targeted = true;
      const field = prefix => rounds.map(round => {
        const value = data[`${prefix}_${round}`] ?? '';
        return rounds.length > 1 ? `${round}回目: ${value}` : value;
      }).join(' / ');
      return [rounds.map(round => `${round}回目`).join(' / '), field('extension_certainty'), field('examination_result')];
    });
    if (targeted) rows.push([student.name, student.studentId, ...cells]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
