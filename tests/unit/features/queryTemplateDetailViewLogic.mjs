import assert from 'node:assert/strict';
import { renderTemplateDetailView } from '../../../src/features/templates/view/queryTemplateDetailView.js';
import test from 'node:test';

test('query template detail view', async () => {
  function createClassList() {
    const values = new Set();
    return {
      add(value) {
        values.add(value);
      },
      remove(value) {
        values.delete(value);
      },
      toggle(value, force) {
        if (force === undefined ? !values.has(value) : force) {
          values.add(value);
        } else {
          values.delete(value);
        }
      },
      contains(value) {
        return values.has(value);
      }
    };
  }

  function el() {
    return {
      classList: createClassList(),
      disabled: false,
      innerHTML: '',
      readOnly: false,
      textContent: '',
      value: ''
    };
  }

  const elements = {
    deleteBtn: el(),
    descriptionInput: el(),
    detail: el(),
    detailMode: el(),
    detailTitle: el(),
    manageCategoriesBtn: el(),
    meta: el(),
    modeNote: el(),
    nameInput: el(),
    newBtn: el(),
    pinBtn: el(),
    refreshBtn: el(),
    saveBtn: el(),
    useBtn: el()
  };
  const state = {
    detailOverlayOpen: true,
    draft: {
      name: 'Draft Name',
      description: 'Draft Description'
    },
    loading: false,
    saving: false
  };
  let categoryAssignmentRendered = false;
  let validationCleared = false;

  renderTemplateDetailView({
    elements,
    state,
    selected: {
      name: 'Saved Name',
      pinned: false
    },
    restricted: false,
    isNew: false,
    buildTemplateDetailMeta: () => 'meta text',
    renderCategoryAssignment: () => {
      categoryAssignmentRendered = true;
    },
    renderValidation: errors => {
      validationCleared = Array.isArray(errors) && errors.length === 0;
    }
  });

  assert.equal(elements.detail.classList.contains('hidden'), false);
  assert.equal(elements.detailMode.textContent, 'Editable Template');
  assert.equal(elements.detailTitle.textContent, 'Saved Name');
  assert.equal(elements.nameInput.value, 'Draft Name');
  assert.equal(elements.meta.textContent, 'meta text');
  assert.equal(elements.pinBtn.textContent, 'Pin Template');
  assert.equal(elements.saveBtn.textContent, 'Save Changes');
  assert.equal(categoryAssignmentRendered, true);
  assert.equal(validationCleared, true);

  renderTemplateDetailView({
    elements,
    state: {
      ...state,
      draft: {
        ...state.draft,
        source: 'history'
      }
    },
    selected: {
      name: 'History Draft',
      pinned: false,
      source: 'history'
    },
    restricted: false,
    isNew: true,
    buildTemplateDetailMeta: () => 'new template meta',
    renderCategoryAssignment: () => {},
    renderValidation: () => {}
  });

  assert.equal(elements.detailTitle.textContent, 'Create Template From Query History');
  assert.equal(elements.saveBtn.textContent, 'Create Template');

  categoryAssignmentRendered = false;
  renderTemplateDetailView({
    elements,
    state: { ...state, detailOverlayOpen: false },
    selected: null,
    restricted: true,
    isNew: false,
    buildTemplateDetailMeta: () => '',
    renderCategoryAssignment: () => {
      categoryAssignmentRendered = true;
    },
    renderValidation: () => {}
  });

  assert.equal(elements.detail.classList.contains('hidden'), true);
  assert.equal(elements.newBtn.classList.contains('hidden'), true);
  assert.equal(categoryAssignmentRendered, true);
});
