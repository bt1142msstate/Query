import assert from 'node:assert/strict';
import {
  getFieldPickerSearchRank,
  getRankedFieldPickerOptions
} from '../../ui/field-picker/fieldPickerSearch.js';

const options = [
  {
    name: 'Author',
    type: 'text',
    category: 'Bibliographic',
    desc: 'Author of the title record'
  },
  {
    name: 'Bibliographic Note',
    type: 'text',
    category: 'Bibliographic',
    description: 'Notes about the item title'
  },
  {
    name: 'Title Sort Key',
    type: 'text',
    category: 'Bibliographic',
    desc: ''
  },
  {
    name: 'Item Subtitle',
    type: 'text',
    category: 'Bibliographic',
    desc: ''
  },
  {
    name: 'Title',
    type: 'text',
    category: 'Bibliographic',
    desc: ''
  }
];

assert.equal(getFieldPickerSearchRank({ name: 'Title' }, 'title'), 0);
assert.equal(getFieldPickerSearchRank({ name: 'Title Sort Key' }, 'title'), 1);
assert.equal(getFieldPickerSearchRank({ name: 'Item Title' }, 'title'), 2);
assert.equal(getFieldPickerSearchRank({ name: 'Subtitle' }, 'title'), 3);
assert.equal(getFieldPickerSearchRank({ name: 'Author', desc: 'Title creator' }, 'title'), 6);

assert.deepEqual(
  getRankedFieldPickerOptions(options, { searchTerm: 'title' }).map(option => option.name),
  ['Title', 'Title Sort Key', 'Item Subtitle', 'Author', 'Bibliographic Note']
);

assert.deepEqual(
  getRankedFieldPickerOptions(options, { searchTerm: '', selectedCategory: 'Bibliographic' }).map(option => option.name),
  options.map(option => option.name)
);

assert.deepEqual(
  getRankedFieldPickerOptions([
    { name: 'Branch', category: 'Location', desc: '' },
    { name: 'Title', category: 'Bibliographic', desc: '' }
  ], {
    searchTerm: 'title',
    selectedCategory: 'Location'
  }),
  []
);

console.log('Field picker search logic tests passed');
