import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routeSource = await readFile(new URL('./students.js', import.meta.url), 'utf8');

test('売上予測金額はDBのINTEGER型を明示して保存する', () => {
  const revenueAmountCasts = routeSource.match(/\$12::INTEGER/g) || [];

  assert.equal(revenueAmountCasts.length, 2);
  assert.doesNotMatch(routeSource, /THEN \$12(?:\s|$)/);
});
