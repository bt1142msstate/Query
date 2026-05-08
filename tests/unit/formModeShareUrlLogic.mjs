import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { decodeSpec } from '../../ui/form-mode/formModeSpec.js';
import {
  buildClearedBrowserUrl,
  buildFormShareUrl,
  isShareableFormSpec
} from '../../ui/form-mode/formModeShareUrl.js';

globalThis.btoa = globalThis.btoa || (value => Buffer.from(value, 'binary').toString('base64'));
globalThis.atob = globalThis.atob || (value => Buffer.from(value, 'base64').toString('binary'));

assert.equal(isShareableFormSpec(null), false);
assert.equal(isShareableFormSpec({ columns: [], inputs: [], lockedFilters: [] }), false);
assert.equal(isShareableFormSpec({ columns: ['Title'], inputs: [], lockedFilters: [] }), true);
assert.equal(isShareableFormSpec({ columns: [], inputs: [{ key: 'branch' }], lockedFilters: [] }), true);
assert.equal(isShareableFormSpec({ columns: [], inputs: [], lockedFilters: [{ field: 'Branch' }] }), true);

assert.equal(
  buildClearedBrowserUrl('https://example.test/index.html?form=old&branch=Main#results'),
  'https://example.test/index.html#results'
);

const spec = {
  title: 'Saved Report',
  queryName: 'Saved Report',
  description: '',
  columns: ['Title'],
  lockedFilters: [],
  inputs: [
    { key: 'branch', field: 'Branch', operator: 'equals', multiple: true },
    { key: 'created', keys: ['created-start', 'created-end'], field: 'Created Date', operator: 'between' },
    { key: 'title', field: 'Title', operator: 'contains' },
    { key: 'empty', field: 'Empty', operator: 'equals' }
  ]
};

const fieldDefs = new Map([
  ['Branch', { name: 'Branch', multiSelect: true }],
  ['Created Date', { name: 'Created Date', type: 'date' }]
]);
const valuesByKey = new Map([
  ['branch', ['Main', 'East']],
  ['created', ['1/1/2026', '1/5/2026']],
  ['title', ['Alpha']],
  ['empty', ['']]
]);

const shareUrl = buildFormShareUrl('https://example.test/index.html?old=1#results', spec, {
  fieldDefs,
  getInputValues: inputSpec => valuesByKey.get(inputSpec.key) || [],
  supportsMultipleValues: (inputSpec, fieldDef) => Boolean(inputSpec.multiple || fieldDef?.multiSelect),
  tableName: 'Shared Table'
});
const parsedUrl = new URL(shareUrl);

assert.equal(parsedUrl.origin + parsedUrl.pathname + parsedUrl.hash, 'https://example.test/index.html#results');
assert.equal(parsedUrl.searchParams.get('limited'), '1');
assert.equal(parsedUrl.searchParams.get('branch'), 'Main,East');
assert.equal(parsedUrl.searchParams.get('created-start'), '1/1/2026');
assert.equal(parsedUrl.searchParams.get('created-end'), '1/5/2026');
assert.equal(parsedUrl.searchParams.get('title'), 'Alpha');
assert.equal(parsedUrl.searchParams.has('empty'), false);
assert.equal(parsedUrl.searchParams.get('tableName'), 'Shared Table');
assert.deepEqual(decodeSpec(parsedUrl.searchParams.get('form')).columns, ['Title']);

assert.equal(buildFormShareUrl('https://example.test/index.html?old=1', {
  columns: [],
  inputs: [],
  lockedFilters: []
}), '');

console.log('Form mode share URL logic tests passed');
