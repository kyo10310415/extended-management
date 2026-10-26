import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { getDatabaseConfig } from './databaseConfig.js';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const url = 'postgresql://fixture:fixture-only@database.example/fixture';
function parameters(target, env) {
  // Real pg parsing, without connecting or sending credentials.
  return new pg.Client(getDatabaseConfig(target, env)).connectionParameters;
}

test('external DBs retain TLS certificate validation after pg parses URL flags', () => {
  for (const query of ['', '?sslmode=disable', '?sslmode=no-verify', '?ssl=false',
    '?ssl=0', '?sslmode=require&uselibpqcompat=true']) {
    const parsed = parameters(url + query, { RENDER: 'true' });
    assert.equal(parsed.ssl.rejectUnauthorized, true, query);
    assert.equal(parsed.ssl.checkServerIdentity, undefined, query);
    assert.equal(parsed.host, 'database.example');
  }
});

test('CA and mTLS file settings survive without replacing strict verification', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.db-tls-fixture-'));
  try {
    const target = new URL(url);
    for (const [parameter, value] of [['sslrootcert', 'SYNTHETIC_CA'], ['sslcert', 'SYNTHETIC_CERT'], ['sslkey', 'SYNTHETIC_KEY']]) {
      const file = join(directory, parameter);
      await writeFile(file, value);
      target.searchParams.set(parameter, file);
    }
    target.searchParams.set('sslmode', 'no-verify');
    const parsed = parameters(target.toString(), {});
    assert.equal(parsed.ssl.ca, 'SYNTHETIC_CA');
    assert.equal(parsed.ssl.cert, 'SYNTHETIC_CERT');
    assert.equal(parsed.ssl.key, 'SYNTHETIC_KEY');
    assert.equal(parsed.ssl.rejectUnauthorized, true);
    assert.equal(parsed.ssl.checkServerIdentity, undefined);
    assert.throws(() => getDatabaseConfig(url + '?sslrootcert=not-a-real-file', {}), { message: 'Invalid PostgreSQL TLS certificate configuration' });
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(process.cwd()));
    await rm(directory, { recursive: true, force: true });
  }
});

test('only Render short internal Postgres names permit self-signed certificates', () => {
  const internal = 'postgresql://fixture:fixture-only@dpg-fixture123-a/fixture';
  assert.equal(parameters(internal, { RENDER: 'true' }).ssl.rejectUnauthorized, false);
  assert.equal(parameters(internal, {}).ssl.rejectUnauthorized, true);
  for (const host of ['dpg-fixture123-a.example', 'dpg-fixture123-a.render.com', 'localhost', '127.0.0.1', 'other-internal']) {
    assert.equal(parameters(url.replace('database.example', host), { RENDER: 'true' }).ssl.rejectUnauthorized, true, host);
  }
});

test('Render internal TLS cannot be disabled by URL parameters', () => {
  const parsed = parameters('postgresql://fixture:fixture-only@dpg-fixture123-a/fixture?sslmode=disable&ssl=0', { RENDER: 'true' });
  assert.equal(typeof parsed.ssl, 'object');
  assert.equal(parsed.ssl.rejectUnauthorized, false);
});

test('query target overrides, invalid URLs and global bypass fail without disclosing input', () => {
  for (const target of ['SYNTHETIC_SECRET', 'https://fixture:fixture-only@database.example/', url + '?host=other.example']) {
    assert.throws(() => getDatabaseConfig(target, {}), { message: 'Invalid PostgreSQL connection configuration' });
  }
  assert.throws(() => getDatabaseConfig(url, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }), { message: 'Global TLS verification bypass is not supported' });
});

test('credentials, database, port and normal driver options remain intact', () => {
  const parsed = parameters('postgresql://fixture%40user:p%40ss%3Aword@database.example:5544/db%20name?application_name=fixture&connect_timeout=5', {});
  assert.equal(parsed.user, 'fixture@user');
  assert.equal(parsed.password, 'p@ss:word');
  assert.equal(parsed.database, 'db name');
  assert.equal(parsed.port, 5544);
  assert.equal(parsed.application_name, 'fixture');
  assert.equal(new URL(getDatabaseConfig('postgresql://database.example/fixture?connect_timeout=5', {}).connectionString).searchParams.get('connect_timeout'), '5');
});

test('only explicitly permitted loopback development can use the previous plaintext mode', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const target = url.replace('database.example', host);
    const options = { allowLocalPlaintext: true };
    assert.equal(getDatabaseConfig(target, {}, options).ssl, false);
    assert.equal(getDatabaseConfig(target, {}).ssl.rejectUnauthorized, true);
    for (const env of [{ NODE_ENV: 'production' }, { RENDER: 'true' }, { PGSSLMODE: 'require' }]) {
      assert.equal(getDatabaseConfig(target, env, options).ssl.rejectUnauthorized, true);
    }
    assert.equal(getDatabaseConfig(target + '?sslmode=disable', {}, options).ssl.rejectUnauthorized, true);
  }
  assert.equal(getDatabaseConfig(url, {}, { allowLocalPlaintext: true }).ssl.rejectUnauthorized, true);
});

test('main, cache and migration constructors receive the policy before any query runs', async () => {
  for (const file of ['../index.js', '../services/databaseCacheService.js', '../../run-migration.js']) {
    const raw = await readFile(new URL(file, import.meta.url), 'utf8');
    const start = raw.indexOf('new Pool(');
    const end = raw.indexOf('\n', start);
    assert.ok(start > 0 && end > start, file);
    const allocation = raw.slice(start, end).replace(/;$/, '');
    for (const [host, expected] of [['database.example', true], ['dpg-fixture123-a', false]]) {
      const env = { DATABASE_URL: url.replace('database.example', host) + '?sslmode=disable', RENDER: 'true' };
      const captures = [];
      class Pool { constructor(config) { captures.push(new pg.Client(config).connectionParameters); } }
      vm.runInNewContext(allocation, { process: { env }, Pool, getDatabaseConfig });
      assert.equal(captures.length, 1);
      assert.equal(captures[0].ssl.rejectUnauthorized, expected);
    }
  }
});

test('external service and diagnostic route retain pool limits with enforced TLS', async () => {
  let source = await readFile(new URL('../services/proPlanExternalService.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*\r?\n/gm, '').replace(/export /g, '');
  for (const [host, expected] of [['database.example', true], ['dpg-fixture123-a', false]]) {
    const env = { EXTERNAL_DB_URL: url.replace('database.example', host) + '?sslmode=disable', RENDER: 'true' };
    const captures = [];
    class Pool {
      constructor(config) { captures.push({ options: config, parsed: new pg.Client(config).connectionParameters }); }
      on() {}
      async query() { return { rows: [{ total_students: '0', with_pro_start: '0' }] }; }
      async end() {}
    }
    const scope = { process: { env }, pkg: { Pool }, getDatabaseConfig: target => getDatabaseConfig(target, env), console: { log() {}, error() {} } };
    await vm.runInNewContext(`(async () => { ${source}; await fetchProStartDates(['fixture']); })()`, scope);
    assert.equal(captures[0].parsed.ssl.rejectUnauthorized, expected);
    assert.equal(captures[0].options.max, 5);
    assert.equal(captures[0].options.connectionTimeoutMillis, 10000);
    let handler;
    let route = await readFile(new URL('../routes/pro-plan.js', import.meta.url), 'utf8');
    route = route.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '').replace('export default router;', '')
      .replace("await import('pg')", 'fixturePg');
    const router = { get(path, fn) { if (path === '/external-db/test') handler = fn; }, post() {} };
    vm.runInNewContext(route, { ...scope, express: { Router: () => router }, fixturePg: { default: { Pool } } });
    let response;
    await handler({}, { json(value) { response = value; }, status() { return this; } });
    assert.equal(response.success, true);
    assert.equal(captures[1].parsed.ssl.rejectUnauthorized, expected);
    assert.equal(captures[1].options.max, 1);
    assert.equal(captures[1].options.connectionTimeoutMillis, 8000);
  }
});


