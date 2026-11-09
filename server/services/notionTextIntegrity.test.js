import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('Notion text retains every formatted segment, spaces and mentions', async () => {
  const source = await readFile(new URL('./notionService.js', import.meta.url), 'utf8');
  const start = source.indexOf('function getPropertyValue(');
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
  for (const type of ['title', 'rich_text']) {
    assert.equal(context.getPropertyValue({ type, [type]: [{ plain_text: 'nare_' }, { plain_text: 'ta_' }] }), 'nare_ta_');
    assert.equal(context.getPropertyValue({ type, [type]: [{ plain_text: ' ' }, { type: 'mention', plain_text: '人物' }] }), ' 人物');
    assert.equal(context.getPropertyValue({ type, [type]: [] }), null);
  }
  assert.equal(context.getPropertyValue(null), null);
});
