import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthenticatedFetch } from './authenticatedFetch.js';

const baseUrl = 'https://extension.example.test/';

test('same-origin mutating APIs receive credentials and the CSRF header without losing existing headers', async () => {
  let actual;
  const fetcher = createAuthenticatedFetch(async (input, init) => { actual = { input, init }; return new Response('{}'); }, { baseUrl });
  await fetcher('/api/students/fixture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(actual.init.headers.get('X-WannaV-Request'), '1');
  assert.equal(actual.init.headers.get('Content-Type'), 'application/json');
  assert.equal(actual.init.credentials, 'same-origin');
  assert.equal(actual.init.body, '{}');
});

test('cross-origin requests are left untouched', async () => {
  let actual;
  const options = { method: 'POST' };
  const fetcher = createAuthenticatedFetch(async (_input, init) => { actual = init; return new Response('{}'); }, { baseUrl });
  await fetcher('https://other.example.test/api/data', options);
  assert.equal(actual, options);
});

test('API requests using Request objects preserve their method and headers', async () => {
  let actual;
  const fetcher = createAuthenticatedFetch(async (_input, init) => { actual = init; return new Response('{}'); }, { baseUrl });
  await fetcher(new Request(baseUrl + 'api/students/fixture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(actual.headers.get('X-WannaV-Request'), '1');
  assert.equal(actual.headers.get('Content-Type'), 'application/json');
});

test('expired authentication triggers login handling without consuming the caller response', async () => {
  let error;
  const fetcher = createAuthenticatedFetch(async () => new Response(JSON.stringify({ error: 'expired', loginUrl: 'https://dashboard.example.test/' }), { status: 401 }), { baseUrl, onUnauthorized: detail => { error = detail; } });
  const response = await fetcher('/api/students');
  assert.equal(error.error, 'expired');
  assert.equal((await response.json()).error, 'expired');
});

test('permission errors trigger the blocked-state handler', async () => {
  let blocked = false;
  const fetcher = createAuthenticatedFetch(async () => new Response('{}', { status: 403 }), { baseUrl, onForbidden: () => { blocked = true; } });
  await fetcher('/api/students');
  assert.equal(blocked, true);
});
