import test from 'node:test'
import assert from 'node:assert/strict'
import { requestStudentUpdate } from './studentUpdate.js'

test('crew saves only hearing fields and reloads the selected cycle without automation', async () => {
  const calls = []
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return Response.json({ success: true, data: { examination_result: '延長' } }) }
  const response = await requestStudentUpdate(true, 'test-1', { cycle: 4, extension_certainty: '高', hearing_status: true, notes: 'fixture', examination_result: '退会', executive_check: '確認済', send_discord_notification: true }, fakeFetch)
  assert.deepEqual(JSON.parse(calls[0].init.body), { cycle: 4, extension_certainty: '高', hearing_status: true, notes: 'fixture' })
  assert.equal(calls[0].url, '/api/students/test-1/hearing')
  assert.equal(calls[1].url, '/api/students/test-1?cycle=4')
  assert.equal((await response.json()).data.examination_result, '延長')
})
test('admin retains examination save contract and failed crew saves do not reload', async () => {
  const calls = []
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return Response.json({ success: false }, { status: 400 }) }
  await requestStudentUpdate(false, 'test-1', { cycle: 1, examination_result: '延長' }, fakeFetch)
  assert.equal(calls[0].url, '/api/students/test-1')
  assert.equal(JSON.parse(calls[0].init.body).examination_result, '延長')
  await requestStudentUpdate(true, 'test-1', { cycle: 1 }, fakeFetch)
  assert.equal(calls.length, 2)
})
