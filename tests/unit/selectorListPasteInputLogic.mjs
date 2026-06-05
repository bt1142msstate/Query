import assert from 'node:assert/strict';
import { parseListInputValues } from '../../ui/selectorListPasteInput.js';
import test from 'node:test';

test('selector list paste input', async () => {
  assert.deepEqual(parseListInputValues(''), []);
  assert.deepEqual(parseListInputValues('one\ntwo\r\nthree'), ['one', 'two', 'three']);
  assert.deepEqual(parseListInputValues('one, two,three'), ['one', 'two', 'three']);
  assert.deepEqual(parseListInputValues(' one ,, \n two \r\n '), ['one', 'two']);
  assert.deepEqual(parseListInputValues(123), ['123']);
});
