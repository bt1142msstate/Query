import assert from 'node:assert/strict';
import {
  appendTemplateToCollection,
  applyPinnedTemplateOrder,
  getPinnedTemplateCountExcluding,
  removeTemplateFromCollection,
  renumberPinnedTemplateOrder,
  replaceTemplateInCollection,
  sortTemplateCollection
} from '../../templates/queryTemplateCollection.js';

const templates = [
  { id: 'b', name: 'Beta', pinned: true, pinOrder: 1 },
  { id: 'a', name: 'Alpha', pinned: false, pinOrder: null },
  { id: 'c', name: 'Gamma', pinned: true, pinOrder: 0 }
];

assert.deepEqual(sortTemplateCollection(templates).map(template => template.id), ['c', 'b', 'a']);

assert.deepEqual(appendTemplateToCollection(templates, {
  id: 'd',
  name: 'Delta',
  pinned: false,
  pinOrder: null
}).map(template => template.id), ['c', 'b', 'a', 'd']);

assert.deepEqual(replaceTemplateInCollection(templates, 'a', {
  id: 'a',
  name: 'Alpha',
  pinned: true,
  pinOrder: 2
}).map(template => `${template.id}:${template.pinOrder ?? '-'}`), ['c:0', 'b:1', 'a:2']);

assert.deepEqual(removeTemplateFromCollection(templates, 'b').map(template => template.id), ['a', 'c']);
assert.equal(getPinnedTemplateCountExcluding(templates, 'b'), 1);

assert.deepEqual(renumberPinnedTemplateOrder([
  { id: 'a', name: 'Alpha', pinned: true, pinOrder: 4 },
  { id: 'b', name: 'Beta', pinned: true, pinOrder: 1 },
  { id: 'c', name: 'Gamma', pinned: false, pinOrder: null }
]).filter(template => template.pinned).map(template => `${template.id}:${template.pinOrder}`), ['a:1', 'b:0']);

assert.deepEqual(applyPinnedTemplateOrder(templates, ['b', 'c']).map(template => `${template.id}:${template.pinOrder ?? '-'}`), [
  'b:0',
  'c:1',
  'a:-'
]);

const originalTemplate = { id: 'x', name: 'Original', pinned: true, pinOrder: 4 };
const renumbered = renumberPinnedTemplateOrder([originalTemplate]);
assert.notEqual(renumbered[0], originalTemplate);
assert.equal(originalTemplate.pinOrder, 4);
assert.equal(renumbered[0].pinOrder, 0);

console.log('Query template collection logic tests passed');
