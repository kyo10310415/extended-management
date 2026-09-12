import test from 'node:test';
import assert from 'node:assert/strict';
import { saveHearingExtensionData } from './studentExtensionService.js';

test('ヒアリング保存は対象サイクルの備考・確度・チェックだけを更新する', async () => {
  let capturedQuery;
  let capturedParams;
  const queryable = {
    async query(query, params) {
      capturedQuery = query;
      capturedParams = params;
      return {
        rows: [{
          student_id: 'OLTS-TEST',
          extension_certainty_2: '高',
          hearing_status_2: true,
          notes_2: '次回確認事項',
          updated_at: '2026-09-12T00:00:00.000Z',
          created_at: '2026-09-01T00:00:00.000Z',
        }],
      };
    },
  };

  const saved = await saveHearingExtensionData({
    queryable,
    studentId: 'OLTS-TEST',
    cycle: 2,
    extensionCertainty: '高',
    hearingStatus: true,
    notes: '次回確認事項',
  });

  assert.match(capturedQuery, /extension_certainty_2/);
  assert.match(capturedQuery, /hearing_status_2/);
  assert.match(capturedQuery, /notes_2 = EXCLUDED\.notes_2/);
  assert.doesNotMatch(capturedQuery, /examination_result/);
  assert.deepEqual(capturedParams, ['OLTS-TEST', '高', true, '次回確認事項']);
  assert.deepEqual(saved, {
    student_id: 'OLTS-TEST',
    extension_certainty: '高',
    hearing_status: true,
    notes: '次回確認事項',
    updated_at: '2026-09-12T00:00:00.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
  });
});

test('ヒアリング保存は範囲外のサイクルを拒否する', async () => {
  await assert.rejects(
    saveHearingExtensionData({
      queryable: { query: async () => ({ rows: [] }) },
      studentId: 'OLTS-TEST',
      cycle: 11,
      extensionCertainty: '',
      hearingStatus: false,
      notes: '',
    }),
    /cycle must be between 1 and 10/
  );
});
