import assert from 'node:assert/strict';
import {
  getBaselineResultSearchParams,
  mergeBaselineResultSearchParams
} from '../../../src/ui/form-mode/formModeReset.js';
import test from 'node:test';

test('form mode reset result params merge into existing form baseline', () => {
  const formBaseline = new URLSearchParams('form=encoded-form&branch=MAIN&tableName=Report');
  const resultParams = new URLSearchParams('result=query-123&resultView=encoded-view');
  const merged = mergeBaselineResultSearchParams(formBaseline, resultParams);

  assert.equal(merged.get('form'), 'encoded-form');
  assert.equal(merged.get('branch'), 'MAIN');
  assert.equal(merged.get('tableName'), 'Report');
  assert.deepEqual(getBaselineResultSearchParams(merged), {
    resultQueryId: 'query-123',
    resultViewParam: 'encoded-view'
  });
  assert.equal(formBaseline.has('result'), false);
});

test('form mode reset result params leave baseline untouched without a result id', () => {
  const formBaseline = new URLSearchParams('form=encoded-form&branch=MAIN&result=existing');
  const merged = mergeBaselineResultSearchParams(formBaseline, new URLSearchParams('resultView=ignored'));

  assert.equal(merged.toString(), formBaseline.toString());
});
