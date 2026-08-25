import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForcedWithdrawalDiscordMessage } from './discordService.js';
import {
  FORCED_WITHDRAWAL_REASONS,
  calculateForcedWithdrawalMonth,
  isValidIsoDate,
  normalizeStudentId,
} from '../utils/forcedWithdrawalUtils.js';

test('学籍番号は前後空白・大文字・OLST表記を正規化する', () => {
  assert.equal(normalizeStudentId(' olst240001-aa '), 'OLTS240001-AA');
  assert.equal(normalizeStudentId('olts240002-bb'), 'OLTS240002-BB');
});

test('実在するISO日付だけを許可する', () => {
  assert.equal(isValidIsoDate('2026-08-25'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026/08/25'), false);
});

test('レッスン開始月を1か月目として強制退会月を計算する', () => {
  assert.equal(calculateForcedWithdrawalMonth('2025-10-01', '2025-10-31'), 1);
  assert.equal(calculateForcedWithdrawalMonth('2025-10-01', '2026-08-25'), 11);
  assert.equal(calculateForcedWithdrawalMonth('2026-08-25', '2026-08-24'), null);
});

test('強制退会理由は指定の3種類に限定する', () => {
  assert.deepEqual(FORCED_WITHDRAWAL_REASONS, [
    '音信不通',
    '生徒様希望で途中退会',
    'コンプライアンス違反',
  ]);
});

test('Discord通知は指定3ユーザーへのメンションと申請内容を含む', () => {
  const message = buildForcedWithdrawalDiscordMessage({
    name: '山田太郎',
    studentId: 'OLTS240001-AA',
    forcedWithdrawalDate: '2026-08-25',
    withdrawalReason: '音信不通',
  });

  assert.match(message.content, /<@766666980086120470>/);
  assert.match(message.content, /<@703557224814870568>/);
  assert.match(message.content, /<@1423132417744441445>/);
  assert.match(message.content, /生徒名：山田太郎/);
  assert.match(message.content, /学籍番号：OLTS240001-AA/);
  assert.match(message.content, /強制退会日：2026-08-25/);
  assert.match(message.content, /退会理由：音信不通/);
  assert.deepEqual(message.allowed_mentions, {
    parse: [],
    users: ['766666980086120470', '703557224814870568', '1423132417744441445'],
  });
});
