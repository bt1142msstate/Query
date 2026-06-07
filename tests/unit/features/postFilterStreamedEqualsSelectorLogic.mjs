import assert from 'node:assert/strict';
import test from 'node:test';

test('post filter streamed equals selector', async () => {
  globalThis.HTMLInputElement = class HTMLInputElement {};
  globalThis.document = {
    readyState: 'complete',
    querySelectorAll() {
      return [];
    }
  };

  const { getNormalizedEqualsOptionValues } = await import('../../../src/features/table/post-filters/postFilterStreamedEqualsSelector.js');

  const blankValue = '__BLANK__';
  const getBlankSentinel = () => blankValue;
  const getFieldType = fieldName => {
    if (fieldName === 'Bill Count') return 'number';
    if (fieldName === 'Last Checkout') return 'date';
    return 'text';
  };

  assert.deepEqual(getNormalizedEqualsOptionValues({
    fieldName: 'Title',
    rawValue: undefined,
    getBlankSentinel,
    getFieldType
  }), [blankValue]);

  assert.deepEqual(getNormalizedEqualsOptionValues({
    fieldName: 'Title',
    rawValue: 'Alpha\x1FBeta\x1F ',
    getBlankSentinel,
    getFieldType
  }), ['Alpha', 'Beta']);

  assert.deepEqual(getNormalizedEqualsOptionValues({
    fieldName: 'Title',
    rawValue: '   ',
    getBlankSentinel,
    getFieldType
  }), [blankValue]);

  assert.deepEqual(getNormalizedEqualsOptionValues({
    fieldName: 'Bill Count',
    rawValue: 12,
    getBlankSentinel,
    getFieldType
  }), ['12']);

  assert.deepEqual(getNormalizedEqualsOptionValues({
    fieldName: 'Last Checkout',
    rawValue: '20240101',
    getBlankSentinel,
    getFieldType
  }), ['20240101']);
});
