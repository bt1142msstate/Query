import assert from 'node:assert/strict';
import { getQueryTemplateElements, getTemplateElement } from '../../templates/queryTemplateElements.js';
import test from 'node:test';

test('query template elements', async () => {
  const requestedIds = [];
  const documentRef = {
    getElementById(id) {
      requestedIds.push(id);
      return { id };
    }
  };

  assert.deepEqual(getTemplateElement(documentRef, 'templates-panel'), { id: 'templates-panel' });

  const elements = getQueryTemplateElements(documentRef);

  assert.equal(elements.panel.id, 'templates-panel');
  assert.equal(elements.detailOverlay.id, 'templates-detail-overlay');
  assert.equal(elements.categoryNameInput.id, 'template-category-name-input');
  assert.equal(elements.pinnedMoreBtn.id, 'pinned-templates-more-btn');

  assert.deepEqual(
    Object.keys(elements),
    [
      'panel',
      'modeNote',
      'listStatus',
      'list',
      'newBtn',
      'refreshBtn',
      'manageCategoriesBtn',
      'emptyState',
      'detailOverlay',
      'detailBackdrop',
      'detail',
      'detailCloseBtn',
      'detailMode',
      'detailTitle',
      'nameInput',
      'descriptionInput',
      'svgInput',
      'svgPreview',
      'validation',
      'meta',
      'useBtn',
      'pinBtn',
      'saveBtn',
      'deleteBtn',
      'categoryFilter',
      'searchInput',
      'resultsSummary',
      'categoryList',
      'categoriesOverlay',
      'categoriesBackdrop',
      'categoriesCloseBtn',
      'categoryNameLabel',
      'categoryNameInput',
      'categoryDescriptionInput',
      'categorySaveBtn',
      'categoryCancelBtn',
      'categoryAssignment',
      'pinnedStrip',
      'pinnedList',
      'pinnedMoreBtn'
    ]
  );

  assert.equal(requestedIds.includes('templates-panel'), true);
  assert.equal(requestedIds.includes('pinned-templates-more-btn'), true);
});
