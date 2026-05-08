import assert from 'node:assert/strict';
import {
  buildCategoryCardMeta,
  buildCategoryFilterOptions,
  buildTemplateDetailMeta,
  buildTemplateFilterSummary,
  getCategoryUsageCount,
  getPinnedTemplatesForStrip,
  getTemplateListSections
} from '../../templates/queryTemplateViewState.js';

const categories = [
  { id: 'reports', name: 'Reports', description: 'Saved reports' },
  { id: 'audits', name: 'Audits', description: '' }
];

const templates = [
  { id: 'a', name: 'Alpha', pinned: false, categories: [categories[0]] },
  { id: 'b', name: 'Beta', pinned: true, pinOrder: 2, categories: [categories[0], categories[1]] },
  { id: 'c', name: 'Gamma', pinned: true, pinOrder: 1, categories: [] }
];

assert.deepEqual(buildCategoryFilterOptions(categories), [
  { value: '', label: 'All categories' },
  { value: 'reports', label: 'Reports' },
  { value: 'audits', label: 'Audits' }
]);

assert.equal(buildTemplateFilterSummary({
  searchQuery: ' branch ',
  selectedCategoryFilter: 'reports',
  categories,
  visibleCount: 1,
  totalCount: 3
}), 'Search: "branch" • Category: Reports • 1 of 3 templates');

assert.equal(buildTemplateFilterSummary({
  selectedCategoryFilter: 'missing',
  categories,
  visibleCount: 0,
  totalCount: 3
}), 'Category: Filtered • 0 of 3 templates');

assert.equal(getCategoryUsageCount('reports', templates), 2);
assert.equal(buildCategoryCardMeta(categories[0], templates), '2 templates • Saved reports');
assert.equal(buildCategoryCardMeta(categories[1], templates), '1 template');

assert.deepEqual(getTemplateListSections(templates).map(section => ({
  key: section.key,
  title: section.title,
  ids: section.items.map(template => template.id),
  draggable: section.draggable
})), [
  { key: 'pinned', title: 'Pinned Templates', ids: ['b', 'c'], draggable: true },
  { key: 'other', title: 'All Other Templates', ids: ['a'], draggable: false }
]);

assert.deepEqual(getTemplateListSections([templates[0]]).map(section => ({
  key: section.key,
  title: section.title,
  ids: section.items.map(template => template.id)
})), [
  { key: 'other', title: 'Templates', ids: ['a'] }
]);

assert.deepEqual(getPinnedTemplatesForStrip(templates).map(template => template.id), ['c', 'b']);

assert.equal(buildTemplateDetailMeta({
  selected: {
    updatedAt: '',
    createdAt: '',
    categories: categories.slice(0, 1)
  },
  isNew: true,
  restricted: false
}), 'Categories: Reports • Saving will capture the current query columns and filters.');

assert.equal(buildTemplateDetailMeta({
  selected: {
    updatedAt: '',
    createdAt: '',
    categories: []
  },
  isNew: false,
  restricted: true
}), '');

console.log('Query template view state logic tests passed');
