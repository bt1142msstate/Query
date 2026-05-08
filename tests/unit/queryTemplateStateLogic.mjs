import assert from 'node:assert/strict';
import {
  createTemplateDraftFromConfig,
  filterVisibleTemplates,
  getAssignedCategoriesForPayload,
  getAssignedCategoryIds,
  removeCategoryFromTemplates,
  replaceCategoryInTemplates,
  sortTemplatesInDisplayOrder,
  validateCategoryName,
  validateTemplateDraft
} from '../../templates/queryTemplateState.js';

const categories = [
  { id: 'reports', name: 'Reports', description: 'Saved reports' },
  { id: 'audits', name: 'Audits', description: 'Review work' }
];

const templates = [
  { id: 'b', name: 'Beta', description: 'Audit list', categories: [categories[1]], pinned: true, pinOrder: 1 },
  { id: 'a', name: 'Alpha', description: 'Branch report', categories: [categories[0]], pinned: false, pinOrder: null },
  { id: 'c', name: 'Gamma', description: 'Pinned first', categories: [categories[0]], pinned: true, pinOrder: 0 }
];

assert.deepEqual(sortTemplatesInDisplayOrder([...templates]).map(template => template.id), ['c', 'b', 'a']);

assert.deepEqual(
  filterVisibleTemplates(templates, { selectedCategoryFilter: 'reports', searchQuery: 'branch' }).map(template => template.id),
  ['a']
);

assert.deepEqual(getAssignedCategoryIds({ categories }), ['reports', 'audits']);
assert.deepEqual(
  getAssignedCategoriesForPayload({ categories: [categories[1]] }, categories),
  [categories[1]]
);

assert.deepEqual(validateTemplateDraft({ id: '', name: '' }, {
  hasUsableCurrentQuery: false,
  templates
}), [
  'Template name is required.',
  'Build a query with at least one column or filter before saving a template.'
]);

assert.deepEqual(validateTemplateDraft({ id: '', name: 'Alpha' }, {
  hasUsableCurrentQuery: true,
  templates
}), ['Template names must be unique.']);

assert.equal(validateCategoryName('', { categories }), 'Category name is required.');
assert.equal(validateCategoryName('Reports', { categories }), 'Category names must be unique.');
assert.equal(validateCategoryName('Reports', { categories, currentCategoryId: 'reports' }), '');

const uiConfig = { DesiredColumnOrder: ['Title'], Filters: [] };
assert.deepEqual(createTemplateDraftFromConfig(uiConfig), {
  id: '',
  name: '',
  description: '',
  svg: '',
  categories: [],
  uiConfig,
  pinned: false,
  pinOrder: null,
  createdAt: '',
  updatedAt: ''
});

const renamedCategory = { id: 'reports', name: 'Reports Updated', description: 'Updated' };
assert.deepEqual(replaceCategoryInTemplates([templates[1]], renamedCategory)[0].categories, [renamedCategory]);
assert.deepEqual(removeCategoryFromTemplates([templates[1]], 'reports')[0].categories, []);

console.log('Query template state logic tests passed');
