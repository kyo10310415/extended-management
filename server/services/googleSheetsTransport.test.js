import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { google } from 'googleapis';
import http from 'node:http';
import https from 'node:https';

beforeEach(t => {
  for (const module of [http, https]) {
    t.mock.method(module, 'request', () => { throw new Error('Unexpected external request'); });
    t.mock.method(module, 'get', () => { throw new Error('Unexpected external request'); });
  }
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected external fetch'); });
});

// All credentials, IDs and rows are synthetic. Unexpected transport requests fail.
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = JSON.stringify({ client_email: 'fixture@example.invalid' });
process.env.PAYMENT_STATUS_SPREADSHEET_ID = 'fixture-payment';
process.env.MONTHLY_REPORT_SPREADSHEET_ID = 'fixture-monthly';
const { applySuspensionPaymentStatus } = await import('./sheetsService.js');
const { writeMonthlyReport } = await import('./monthlyReportService.js');

async function withTransport(t, adapter, operation) {
  const client = new google.auth.OAuth2();
  client.setCredentials({ access_token: 'fixture-token', expiry_date: Date.now() + 3600000 });
  t.mock.method(google.auth.GoogleAuth.prototype, 'getClient', async () => client);
  google.options({ adapter });
  try { return await operation(); }
  finally { google.options({}); }
}

function response(config, data) {
  return { config, data, status: 200, statusText: 'OK', headers: {} };
}

test('real Sheets transport preserves suspension lookup, USER_ENTERED update and readback', async t => {
  const requests = [];
  let updated = false;
  const result = await withTransport(t, async config => {
    const url = new URL(config.url);
    assert.equal(url.hostname, 'sheets.googleapis.com');
    assert.match(url.pathname, /^\/v4\/spreadsheets\/fixture-payment\/values\//);
    const range = decodeURIComponent(url.pathname.split('/values/')[1]);
    requests.push({ method: config.method, range });
    if (range.endsWith('D14:D')) return response(config, { values: [['FIXTURE-001']] });
    if (range.endsWith('N13:BP13')) return response(config, { values: [['2026/08', '2026/09']] });
    assert.equal(range, "'RAW_支払い状況'!N14:O14");
    if (config.method === 'PUT') {
      assert.equal(url.searchParams.get('valueInputOption'), 'USER_ENTERED');
      assert.deepEqual(JSON.parse(config.body), { values: [['休会', '休会']] });
      updated = true;
      return response(config, { updatedCells: 2 });
    }
    assert.equal(config.method, 'GET');
    return response(config, { values: [updated ? ['休会', '休会'] : ['', '']] });
  }, () => applySuspensionPaymentStatus({ studentId: 'FIXTURE-001', startYearMonth: '2026-09', endYearMonth: '2026-10' }));
  assert.equal(result.rowNumber, 14);
  assert.equal(requests.filter(item => item.method === 'PUT').length, 1);
  assert.equal(requests.length, 5);
});

test('real Sheets transport preserves monthly report resource alias and RAW numeric formatting', async t => {
  const writes = [];
  const result = await withTransport(t, async config => {
    const url = new URL(config.url);
    assert.equal(url.hostname, 'sheets.googleapis.com');
    assert.match(url.pathname, /^\/v4\/spreadsheets\/fixture-monthly\/values\//);
    if (config.method === 'GET') return response(config, { values: [['項目名', '既存月']] });
    assert.equal(config.method, 'PUT');
    assert.equal(decodeURIComponent(url.pathname.split('/values/')[1]), 'C1:C8');
    assert.equal(url.searchParams.get('valueInputOption'), 'RAW');
    writes.push(JSON.parse(config.body).values);
    return response(config, { updatedCells: 8 });
  }, () => writeMonthlyReport({ exam1stTargetCount: 4, exam1stExtensionCount: 3, exam1stExtensionRate: 75, exam2ndTargetCount: 2, exam2ndExtensionCount: 1, exam2ndExtensionRate: 50, proPlanRate: 12.5 }));
  assert.equal(result.success, true);
  assert.deepEqual(writes[0].slice(1), [[4], [3], ['75.00'], [2], [1], ['50.00'], ['12.50']]);
});
