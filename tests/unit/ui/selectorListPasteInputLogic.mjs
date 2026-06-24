import assert from 'node:assert/strict';
import {
  buildListDownloadFilename,
  parseListInputValues,
  serializeListInputValues
} from '../../../src/ui/controls/selectorListPasteInput.js';
import test from 'node:test';

test('selector list paste input', async () => {
  assert.deepEqual(parseListInputValues(''), []);
  assert.deepEqual(parseListInputValues('one\ntwo\r\nthree'), ['one', 'two', 'three']);
  assert.deepEqual(parseListInputValues('one, two,three'), ['one', 'two', 'three']);
  assert.deepEqual(parseListInputValues(' one ,, \n two \r\n '), ['one', 'two']);
  assert.deepEqual(parseListInputValues(123), ['123']);
});

test('selector list paste actions serialize and name text downloads', async () => {
  assert.equal(serializeListInputValues(['  one ', '', 'two', null, 'three']), 'one\ntwo\nthree');
  assert.equal(buildListDownloadFilename('Catalog Key Equals'), 'catalog-key-equals.txt');
  assert.equal(buildListDownloadFilename(''), 'filter-values.txt');
});
