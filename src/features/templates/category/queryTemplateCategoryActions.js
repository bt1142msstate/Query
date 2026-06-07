import { normalizeCategory, normalizeCategoryList } from '../data/queryTemplateModels.js';
import {
  removeCategoryFromTemplates,
  replaceCategoryInTemplates,
  validateCategoryName
} from '../data/queryTemplateState.js';

export function createQueryTemplateCategoryActions({
  getElements,
  isRestrictedMode,
  render,
  renderValidation,
  showToastMessage,
  state,
  templateRepository,
  window
}) {
  function startCategoryEdit(categoryId) {
    if (isRestrictedMode()) {
      return;
    }

    const category = state.categories.find(item => item.id === categoryId);
    if (!category) {
      return;
    }

    state.editingCategoryId = category.id;
    const elements = getElements();
    if (elements.categoryNameLabel) {
      elements.categoryNameLabel.textContent = 'Edit Category';
    }
    if (elements.categoryNameInput) {
      elements.categoryNameInput.value = category.name;
      elements.categoryNameInput.focus();
    }
    if (elements.categoryDescriptionInput) {
      elements.categoryDescriptionInput.value = category.description || '';
    }
    render();
  }

  function resetCategoryEditor() {
    state.editingCategoryId = '';
    const elements = getElements();
    if (elements.categoryNameLabel) {
      elements.categoryNameLabel.textContent = 'New Category';
    }
    if (elements.categoryNameInput) {
      elements.categoryNameInput.value = '';
    }
    if (elements.categoryDescriptionInput) {
      elements.categoryDescriptionInput.value = '';
    }
  }

  async function saveCategory() {
    if (isRestrictedMode()) {
      return;
    }

    const elements = getElements();
    const rawName = String(elements.categoryNameInput?.value || '').trim();
    const validationError = validateCategoryName(rawName, {
      categories: state.categories,
      currentCategoryId: state.editingCategoryId
    });
    if (validationError) {
      renderValidation([validationError]);
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.saveCategory({
        categoryId: state.editingCategoryId,
        name: rawName,
        description: String(elements.categoryDescriptionInput?.value || '').trim()
      });

      state.categories = normalizeCategoryList(payload.categories);
      const renamedCategory = payload.category ? normalizeCategory(payload.category, 0) : null;
      if (renamedCategory) {
        state.templates = replaceCategoryInTemplates(state.templates, renamedCategory);

        if (state.draft?.categories) {
          state.draft.categories = replaceCategoryInTemplates([state.draft], renamedCategory)[0].categories;
        }
      }
      resetCategoryEditor();
      renderValidation([]);

      showToastMessage(`Category "${rawName}" saved.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  async function deleteCategory(categoryId) {
    if (isRestrictedMode()) {
      return;
    }

    const category = state.categories.find(item => item.id === categoryId);
    if (!category) {
      return;
    }

    if (!window.confirm(`Delete category "${category.name}" from all templates?`)) {
      return;
    }

    state.saving = true;
    render();

    try {
      const payload = await templateRepository.deleteCategory(categoryId);

      state.categories = normalizeCategoryList(payload.categories);
      state.templates = removeCategoryFromTemplates(state.templates, categoryId);
      if (state.draft?.categories) {
        state.draft.categories = removeCategoryFromTemplates([state.draft], categoryId)[0].categories;
      }
      if (state.selectedCategoryFilter === categoryId) {
        state.selectedCategoryFilter = '';
      }
      if (state.editingCategoryId === categoryId) {
        resetCategoryEditor();
      }
      renderValidation([]);

      showToastMessage(`Category "${category.name}" deleted.`, 'success');
    } catch (error) {
      if (error?.isRateLimited) {
        return;
      }
      renderValidation([error.message]);
    } finally {
      state.saving = false;
      render();
    }
  }

  return {
    deleteCategory,
    resetCategoryEditor,
    saveCategory,
    startCategoryEdit
  };
}
