import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsToYearMonth,
  buildSalesForecastExtensionPlan,
  columnNumberToLetter,
  parseSalesForecastMonthHeader,
} from './sheetsService.js';
import {
  buildExtensionAgreementDiscordMessage,
  parseDiscordChannelUrl,
} from './discordService.js';
import { isValidExecutiveCheck } from './examinationAutomationService.js';

test('売上予測の月ヘッダーはYYYY/MとYYYY-MMを正規化する', () => {
  assert.equal(parseSalesForecastMonthHeader('2026/6'), '2026-06');
  assert.equal(parseSalesForecastMonthHeader('2026-12'), '2026-12');
  assert.equal(parseSalesForecastMonthHeader('2026/13'), null);
  assert.equal(parseSalesForecastMonthHeader('合計'), null);
});

test('最後の有効月の次から6か月を年またぎで計画する', () => {
  const headerValues = [
    '2026/1', '2026/2', '2026/3', '2026/4', '2026/5', '2026/6',
    '2026/7', '2026/8', '2026/9', '2026/10', '2026/11', '2026/12',
    '2027/1',
  ];
  const studentRowValues = ['22,000', '22,000', '22,000', '22,000', '22,000', '22,000'];

  assert.deepEqual(
    buildSalesForecastExtensionPlan({ headerValues, studentRowValues }),
    {
      startYearMonth: '2026-07',
      endYearMonth: '2026-12',
      startColumn: 'Q',
      endColumn: 'V',
    }
  );
});

test('月次列の直後6列に年月の飛びがある場合は書き込まない', () => {
  assert.throws(
    () => buildSalesForecastExtensionPlan({
      headerValues: ['2026/6', '2026/8', '2026/9', '2026/10', '2026/11', '2026/12', '2027/1'],
      studentRowValues: ['22,000'],
      firstColumnNumber: 49,
    }),
    /年月列が連続していません/
  );
});

test('年月ヘッダーがない末尾の補助数式は最終月の判定から除外する', () => {
  const plan = buildSalesForecastExtensionPlan({
    headerValues: [
      '2026/6', '2026/7', '2026/8', '2026/9', '2026/10', '2026/11', '2026/12', '補助',
    ],
    studentRowValues: ['0', '', '', '', '', '', '', '数式の結果'],
    firstColumnNumber: 49,
  });

  assert.deepEqual(plan, {
    startYearMonth: '2026-07',
    endYearMonth: '2026-12',
    startColumn: 'AX',
    endColumn: 'BC',
  });
});

test('シート列番号はZ以降も正しくA1表記に変換する', () => {
  assert.equal(columnNumberToLetter(26), 'Z');
  assert.equal(columnNumberToLetter(27), 'AA');
  assert.equal(columnNumberToLetter(50), 'AX');
  assert.equal(columnNumberToLetter(55), 'BC');
});

test('年月加算は12月から翌年1月へ進む', () => {
  assert.equal(addMonthsToYearMonth('2026-12', 1), '2027-01');
  assert.equal(addMonthsToYearMonth('2026-07', 5), '2026-12');
});

test('統括チェックは空白・未確認・確認済だけを許可する', () => {
  assert.equal(isValidExecutiveCheck(''), true);
  assert.equal(isValidExecutiveCheck('未確認'), true);
  assert.equal(isValidExecutiveCheck('確認済'), true);
  assert.equal(isValidExecutiveCheck('完了'), false);
});

test('DiscordチャットURLからサーバーIDとチャンネルIDを取得する', () => {
  assert.deepEqual(
    parseDiscordChannelUrl(
      'https://discord.com/channels/123456789012345678/234567890123456789'
    ),
    {
      guildId: '123456789012345678',
      channelId: '234567890123456789',
    }
  );
  assert.equal(
    parseDiscordChannelUrl(
      'https://discord.com.example.com/channels/123456789012345678/234567890123456789'
    ),
    null
  );
});

test('契約延長メッセージは追記した最終月を日本語で含む', () => {
  const message = buildExtensionAgreementDiscordMessage('2026-12');

  assert.match(message.content, /^# 契約延長の妥結について/);
  assert.match(message.content, /2026年12月末（レッスンの最終月）までとする。/);
  assert.deepEqual(message.allowed_mentions, { parse: [] });
  assert.ok(message.content.length <= 2000);
});
