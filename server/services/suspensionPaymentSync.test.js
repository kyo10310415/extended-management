import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsToYearMonth,
  buildSuspensionApplicationKey,
  buildSuspensionPaymentPlan,
  columnLetterToNumber,
  parseSuspensionApplicationRows,
  parseSuspensionYearMonth,
} from './sheetsService.js';
import {
  buildSuspensionDiscordForumMessage,
  formatSuspensionForumThreadName,
  parseDiscordForumTagIds,
} from './discordService.js';

function buildMonthlyHeaders(startYearMonth, count) {
  return Array.from({ length: count }, (_, index) => {
    const yearMonth = addMonthsToYearMonth(startYearMonth, index);
    const [year, month] = yearMonth.split('-').map(Number);
    return `${year}/${month}`;
  });
}

test('休会開始日・終了日は年月へ正規化し、月末日の表記ゆれを許容する', () => {
  assert.equal(parseSuspensionYearMonth('2026/09/01'), '2026-09');
  assert.equal(parseSuspensionYearMonth('2026-11-30'), '2026-11');
  assert.equal(parseSuspensionYearMonth('2026/11/31'), '2026-11');
  assert.equal(parseSuspensionYearMonth('2026/13/01'), null);
});

test('休会申請はH列・L列・M列から必要項目を取得する', () => {
  const row = Array(13).fill('');
  row[0] = '2026/08/26 10:00:00';
  row[6] = '山田太郎';
  row[7] = ' olst260001-ab ';
  row[11] = '2026/09/01';
  row[12] = '2026/11/30';

  const [application] = parseSuspensionApplicationRows([row]);

  assert.equal(application.sourceRowNumber, 2);
  assert.equal(application.studentName, '山田太郎');
  assert.equal(application.studentId, 'OLTS260001-AB');
  assert.equal(application.startYearMonth, '2026-09');
  assert.equal(application.endYearMonth, '2026-11');
  assert.equal(application.validationError, null);
});

test('同じフォーム送信は行番号が変わっても同じ処理キーになる', () => {
  const first = buildSuspensionApplicationKey({
    submittedAt: '2026/08/26 10:00:00',
    studentId: 'OLST260001-AB',
    rowNumber: 2,
  });
  const second = buildSuspensionApplicationKey({
    submittedAt: '2026/08/26 10:00:00',
    studentId: 'OLTS260001-AB',
    rowNumber: 99,
  });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('2026年9月から11月は実シート構造上BB列からBD列になる', () => {
  const headerValues = buildMonthlyHeaders('2023-05', 47);

  assert.deepEqual(
    buildSuspensionPaymentPlan({
      headerValues,
      startYearMonth: '2026-09',
      endYearMonth: '2026-11',
      firstColumnNumber: 14,
    }),
    {
      startYearMonth: '2026-09',
      endYearMonth: '2026-11',
      startColumn: 'BB',
      endColumn: 'BD',
      monthCount: 3,
    }
  );
});

test('年をまたぐ休会期間も開始月・終了月を含めて連続範囲にする', () => {
  assert.deepEqual(
    buildSuspensionPaymentPlan({
      headerValues: ['2026/11', '2026/12', '2027/1', '2027/2'],
      startYearMonth: '2026-12',
      endYearMonth: '2027-02',
      firstColumnNumber: 55,
    }),
    {
      startYearMonth: '2026-12',
      endYearMonth: '2027-02',
      startColumn: 'BD',
      endColumn: 'BF',
      monthCount: 3,
    }
  );
});

test('支払い状況シートの年月が欠けている場合は書き込み計画を作らない', () => {
  assert.throws(
    () => buildSuspensionPaymentPlan({
      headerValues: ['2026/9', '2026/11'],
      startYearMonth: '2026-09',
      endYearMonth: '2026-11',
      firstColumnNumber: 54,
    }),
    /年月列が連続していません/
  );
});

test('列記号はZ以降も列番号へ変換できる', () => {
  assert.equal(columnLetterToNumber('N'), 14);
  assert.equal(columnLetterToNumber('BB'), 54);
  assert.equal(columnLetterToNumber('BP'), 68);
  assert.equal(columnLetterToNumber('1A'), null);
});

test('休会Discord通知は生徒名＋様を投稿タイトルにして必要情報を本文へ入れる', () => {
  assert.deepEqual(
    buildSuspensionDiscordForumMessage({
      name: '山田太郎',
      studentId: 'OLTS260001-AB',
      notionUrl: 'https://www.notion.so/example-page',
      suspensionStartDate: '2026/09/01',
      suspensionEndDate: '2026/11/30',
    }),
    {
      thread_name: '山田太郎様',
      content: [
        '学籍番号：OLTS260001-AB',
        'Notionリンク：https://www.notion.so/example-page',
        '休会開始日：2026/09/01',
        '休会終了日：2026/11/30',
      ].join('\n'),
      allowed_mentions: { parse: [] },
    }
  );
});

test('投稿タイトルは様を重複させず改行を除去して100文字以内にする', () => {
  assert.equal(formatSuspensionForumThreadName(' 山田\n太郎様 '), '山田 太郎様');
  const longTitle = formatSuspensionForumThreadName('あ'.repeat(120));
  assert.equal(Array.from(longTitle).length, 100);
  assert.match(longTitle, /様$/);
  assert.equal(formatSuspensionForumThreadName(''), null);
});

test('フォーラムタグIDは任意のカンマ区切り設定を安全に解釈する', () => {
  assert.deepEqual(
    parseDiscordForumTagIds('12345678901234567, 234567890123456789'),
    ['12345678901234567', '234567890123456789']
  );
  assert.deepEqual(parseDiscordForumTagIds(''), []);
  assert.equal(parseDiscordForumTagIds('invalid'), null);
});
