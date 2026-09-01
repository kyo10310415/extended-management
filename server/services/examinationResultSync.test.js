import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAutomaticExaminationResultsByStudent,
  mapExaminationFormResult,
} from './sheetsService.js';
import {
  advanceExaminationFormSyncState,
  applyAutomaticExaminationResults,
  buildAutomaticExaminationSyncPayloads,
  getOrInitializeExaminationFormSyncState,
  isValidExtensionCycle,
} from './examinationResultSyncService.js';
import { buildExaminationResultDiscordMessage } from './discordService.js';
import { isExaminationOverdue } from '../../src/utils/examinationStatus.js';

function lessonStartDateForMonth(monthsElapsed) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsElapsed - 1), 1);
  const year = start.getFullYear();
  const month = String(start.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

test('フォームの結果を指定ルールで審査結果へ変換する', () => {
  assert.equal(mapExaminationFormResult('延長'), '延長');
  assert.equal(mapExaminationFormResult('永久会員+PROプラン'), '延長');
  assert.equal(mapExaminationFormResult('永久会員＋PROプラン'), '延長');
  assert.equal(mapExaminationFormResult('正規退会'), '退会');
  assert.equal(mapExaminationFormResult('無断キャンセル'), '退会');
  assert.equal(mapExaminationFormResult('永久会員'), '永久会員');
  assert.equal(mapExaminationFormResult('在籍'), null);
  assert.equal(mapExaminationFormResult('退会'), null);
});

test('同じ年月・学籍番号では最新回答を採用し、指定外の最新値は自動入力しない', () => {
  const rows = [
    ['2026/08/01 09:00:00', '', '', 'OLST240001-AA', '', '', '', '延長'],
    ['2026/08/15 18:00:00', '', '', 'OLTS240001-AA', '', '', '', '永久会員'],
    ['2026/08/10 12:00:00', '', '', 'OLTS240002-BB', '', '', '', '正規退会'],
    ['2026/08/20 12:00:00', '', '', 'OLTS240003-CC', '', '', '', '延長'],
    ['2026/08/21 12:00:00', '', '', 'OLTS240003-CC', '', '', '', '在籍'],
    ['2026/07/31 23:59:59', '', '', 'OLTS240004-DD', '', '', '', '延長'],
  ];

  const results = buildAutomaticExaminationResultsByStudent(rows, '2026-08');

  assert.deepEqual(results['OLTS240001-AA'], {
    result: '永久会員',
    sourceValue: '永久会員',
    sourceTimestamp: '2026/08/15 18:00',
    sourceRowNumber: 3,
  });
  assert.equal(results['OLTS240002-BB'].result, '退会');
  assert.equal(results['OLTS240003-CC'], undefined);
  assert.equal(results['OLTS240004-DD'], undefined);
});

test('拡張サイクルは1回目から10回目だけを許可する', () => {
  assert.equal(isValidExtensionCycle(1), true);
  assert.equal(isValidExtensionCycle(10), true);
  assert.equal(isValidExtensionCycle(0), false);
  assert.equal(isValidExtensionCycle(11), false);
  assert.equal(isValidExtensionCycle(1.5), false);
});

test('バックグラウンド同期は画面と同じ月数・ステータス条件で対象を振り分ける', () => {
  const students = [
    { studentId: 'OLTS-A', lessonStartDate: lessonStartDateForMonth(6), status: 'アクティブ' },
    { studentId: 'OLTS-B', lessonStartDate: lessonStartDateForMonth(11), status: '無断キャンセル' },
    { studentId: 'OLTS-C', lessonStartDate: lessonStartDateForMonth(17), status: 'アクティブ' },
    { studentId: 'OLTS-D', lessonStartDate: lessonStartDateForMonth(5), status: '強制退会' },
  ];
  const proStart = lessonStartDateForMonth(5);
  const formResultsByOffset = new Map([[0, {
    available: true,
    resultsByStudent: {
      'OLTS-A': { result: '延長', sourceValue: '永久会員＋PROプラン' },
      'OLTS-B': { result: '退会', sourceRowNumber: 101 },
      'OLTS-C': { result: '永久会員', sourceRowNumber: 102 },
    },
  }]]);

  const payloads = buildAutomaticExaminationSyncPayloads({
    students,
    suspensionData: {
      'OLTS-A': { suspensionMonths: 1 },
    },
    proStartMap: {
      'OLTS-C': { proStartDate: proStart },
    },
    formResultsByOffset,
    monthOffsets: [0],
    automationBaselineRow: 100,
  });

  assert.deepEqual(payloads.get(1).get('OLTS-A'), {
    result: '延長',
    sourceValue: '永久会員＋PROプラン',
    sourceRowNumber: null,
    automationEligible: false,
  });
  assert.equal(payloads.get(2).get('OLTS-B').result, '退会');
  assert.equal(payloads.get(2).get('OLTS-B').automationEligible, true);
  assert.equal(payloads.get(3).get('OLTS-C').result, '永久会員');
  assert.equal(payloads.get(4).get('OLTS-C').result, '永久会員');
  assert.equal(payloads.get(1).has('OLTS-D'), false);
});

test('DB同期SQLは手動固定済みの審査結果を上書きしない', async () => {
  let capturedQuery;
  let capturedParams;
  const pool = {
    async query(query, params) {
      capturedQuery = query;
      capturedParams = params;
    },
  };

  const result = await applyAutomaticExaminationResults({
    pool,
    cycle: 7,
    automaticResultsByStudent: new Map([
      ['OLTS-A', { result: '延長', automationEligible: true }],
      ['OLTS-B', { result: null, automationEligible: false }],
    ]),
  });

  assert.match(capturedQuery, /examination_result_manual_override_7/);
  assert.match(capturedQuery, /discord_notification_pending_7/);
  assert.match(capturedQuery, /revenue_extension_pending_7/);
  assert.match(capturedQuery, /revenue_extension_completed_7/);
  assert.match(capturedQuery, /source\.automation_eligible AND source\.examination_result = '延長'/);
  assert.match(capturedQuery, /COALESCE\(EXCLUDED\.discord_notification_pending_7, FALSE\)/);
  assert.match(capturedQuery, /WHEN COALESCE\(student_extensions\.examination_result_manual_override_7, FALSE\)/);
  assert.deepEqual(capturedParams, [
    ['OLTS-A'],
    ['延長'],
    ['延長'],
    [true],
  ]);
  assert.deepEqual(result, { syncedCount: 1, mappedCount: 1 });
});

test('基準行以前の回答だけならDB同期を実行しない', async () => {
  let queryCalled = false;
  const pool = {
    async query() {
      queryCalled = true;
    },
  };

  const result = await applyAutomaticExaminationResults({
    pool,
    cycle: 1,
    automaticResultsByStudent: new Map([
      ['OLTS-OLD', { result: '延長', automationEligible: false }],
    ]),
  });

  assert.equal(queryCalled, false);
  assert.deepEqual(result, { syncedCount: 0, mappedCount: 0 });
});

test('初回同期は既存フォーム行を基準登録し、次回以降だけ行番号を進める', async () => {
  const queries = [];
  const pool = {
    async query(query, params) {
      queries.push({ query, params });
      if (query.includes('INSERT INTO examination_form_sync_state')) {
        return { rowCount: 1, rows: [{ last_processed_row: 1910 }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };

  const state = await getOrInitializeExaminationFormSyncState({
    pool,
    currentMaxSourceRowNumber: 1910,
  });
  assert.deepEqual(state, { lastProcessedRow: 1910, initialized: true });

  await advanceExaminationFormSyncState({
    pool,
    currentMaxSourceRowNumber: 1912,
  });
  assert.deepEqual(queries[0].params, [1910]);
  assert.match(queries[1].query, /GREATEST\(last_processed_row, \$1\)/);
  assert.deepEqual(queries[1].params, [1912]);
});

test('既存基準行を除外し、新規フォーム行だけ自動化対象にする', () => {
  const students = [
    { studentId: 'OLTS-OLD', lessonStartDate: lessonStartDateForMonth(5), status: 'アクティブ' },
    { studentId: 'OLTS-NEW', lessonStartDate: lessonStartDateForMonth(5), status: 'アクティブ' },
  ];
  const payloads = buildAutomaticExaminationSyncPayloads({
    students,
    suspensionData: {},
    proStartMap: {},
    formResultsByOffset: new Map([[0, {
      available: true,
      resultsByStudent: {
        'OLTS-OLD': { result: '延長', sourceValue: '延長', sourceRowNumber: 1910 },
        'OLTS-NEW': { result: '延長', sourceValue: '延長', sourceRowNumber: 1911 },
      },
    }]]),
    monthOffsets: [0],
    automationBaselineRow: 1910,
  });

  assert.equal(payloads.get(1).get('OLTS-OLD').result, '延長');
  assert.equal(payloads.get(1).get('OLTS-OLD').automationEligible, false);
  assert.equal(payloads.get(1).get('OLTS-NEW').result, '延長');
  assert.equal(payloads.get(1).get('OLTS-NEW').automationEligible, true);
});

test('Discord通知は生徒名・担当Tutor名と指定項目を含みPROプラン表示を使う', () => {
  const message = buildExaminationResultDiscordMessage({
    name: '山田太郎',
    tutor: '佐藤Tutor',
    studentId: 'OLTS-A',
    notionUrl: 'https://www.notion.so/example',
    resultLabel: 'PROプラン',
  });

  assert.match(message.content, /^@everyone\n延長審査報告/);
  assert.match(message.content, /生徒名：山田太郎/);
  assert.match(message.content, /担当Tutor名：佐藤Tutor/);
  assert.match(message.content, /学籍番号：OLTS-A/);
  assert.match(message.content, /NotionURL：https:\/\/www\.notion\.so\/example/);
  assert.match(message.content, /審査結果：PROプラン/);
  assert.deepEqual(message.allowed_mentions, { parse: ['everyone'] });
});

test('最初のレッスン日の翌日以降で審査結果が空欄なら未実施と判定する', () => {
  const now = new Date('2026-08-24T03:00:00.000Z'); // JST 2026/08/24 12:00

  assert.equal(isExaminationOverdue({
    lessonDates: ['2026/08/28 10:00', '2026/08/23 18:00', '2026/08/25 12:00'],
    examinationResult: '',
    now,
  }), true);
  assert.equal(isExaminationOverdue({
    lessonDates: ['2026/08/24 09:00', '2026/08/25 12:00'],
    examinationResult: '',
    now,
  }), false);
  assert.equal(isExaminationOverdue({
    lessonDates: ['2026/08/23 18:00'],
    examinationResult: '延長',
    now,
  }), false);
  assert.equal(isExaminationOverdue({
    lessonDates: [],
    examinationResult: '',
    now,
  }), false);
});
