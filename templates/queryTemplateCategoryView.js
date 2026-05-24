import { escapeHtml } from '../core/html.js';
import { getAssignedCategoryIds } from './queryTemplateState.js';
import {
  buildCategoryCardMeta,
  buildCategoryFilterOptions,
  buildTemplateFilterSummary
} from './queryTemplateViewState.js';

export function renderTemplateCategoryFilter({
  elements,
  state,
  visibleCount
}) {
  if (!elements.categoryFilter || !elements.searchInput || !elements.resultsSummary) {
    return;
  }

  const options = buildCategoryFilterOptions(state.categories)
    .map(option => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`);
  elements.categoryFilter.innerHTML = options.join('');
  elements.categoryFilter.value = state.selectedCategoryFilter;
  elements.categoryFilter.disabled = state.loading || state.saving;
  elements.searchInput.value = state.searchQuery;
  elements.searchInput.disabled = state.loading || state.saving;

  elements.resultsSummary.textContent = buildTemplateFilterSummary({
    searchQuery: state.searchQuery,
    selectedCategoryFilter: state.selectedCategoryFilter,
    categories: state.categories,
    visibleCount,
    totalCount: state.templates.length
  });
}

export function renderTemplateCategoryList({
  elements,
  state,
  restricted,
  onToggleCategoryFilter,
  onStartCategoryEdit,
  onDeleteCategory
}) {
  if (!elements.categoryList || !elements.categoryNameInput || !elements.categoryDescriptionInput || !elements.categorySaveBtn || !elements.categoryCancelBtn || !elements.categoryNameLabel) {
    return;
  }

  if (!state.categories.length) {
    const empty = document.createElement('div');
    empty.className = 'templates-category-empty-state';
    empty.innerHTML = restricted
      ? '<h4>No categories yet</h4><p>Categories have not been created yet. You can still browse and use templates.</p>'
      : '<h4>No categories yet</h4><p>Create a category to group related templates and speed up browsing.</p>';
    elements.categoryList.replaceChildren(empty);
  } else {
    elements.categoryList.replaceChildren(...state.categories.map(category => {
      const card = document.createElement('article');
      card.className = 'templates-category-card';
      card.classList.toggle('is-filter-active', category.id === state.selectedCategoryFilter);

      const infoButton = document.createElement('button');
      infoButton.type = 'button';
      infoButton.className = 'templates-category-card__main';
      infoButton.addEventListener('click', () => onToggleCategoryFilter(category.id));

      const name = document.createElement('div');
      name.className = 'templates-category-card__name';
      name.textContent = category.name;

      const meta = document.createElement('div');
      meta.className = 'templates-category-card__meta';
      meta.textContent = buildCategoryCardMeta(category, state.templates);

      infoButton.append(name, meta);
      card.appendChild(infoButton);

      if (!restricted) {
        const actions = document.createElement('div');
        actions.className = 'templates-category-card__actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'templates-category-card__btn';
        editBtn.textContent = 'Edit';
        editBtn.title = `Edit ${category.name}`;
        editBtn.addEventListener('click', event => {
          event.stopPropagation();
          onStartCategoryEdit(category.id);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'templates-category-card__btn templates-category-card__btn--danger';
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = `Delete ${category.name}`;
        deleteBtn.addEventListener('click', event => {
          event.stopPropagation();
          onDeleteCategory(category.id);
        });
        actions.appendChild(deleteBtn);

        card.appendChild(actions);
      }

      return card;
    }));
  }

  elements.categoryNameInput.disabled = restricted || state.saving;
  elements.categoryDescriptionInput.disabled = restricted || state.saving;
  elements.categorySaveBtn.disabled = restricted || state.saving;
  elements.categoryCancelBtn.disabled = restricted || state.saving;
  elements.categorySaveBtn.classList.toggle('hidden', restricted);
  elements.categoryCancelBtn.classList.toggle('hidden', restricted || !state.editingCategoryId);
  elements.categorySaveBtn.textContent = state.editingCategoryId ? 'Save Category' : 'Add Category';
  elements.categoryNameLabel.textContent = state.editingCategoryId ? 'Edit Category' : 'New Category';
}

export function renderTemplateCategoryAssignment({
  elements,
  state,
  restricted,
  selected,
  onDraftCategoriesChange,
  onClearValidation
}) {
  if (!elements.categoryAssignment) {
    return;
  }

  if (!selected) {
    elements.categoryAssignment.replaceChildren();
    return;
  }

  if (!state.categories.length) {
    const empty = document.createElement('div');
    empty.className = 'template-category-empty';
    empty.textContent = restricted
      ? 'No categories have been created yet.'
      : 'No categories yet. Add categories in the sidebar to organize templates.';
    elements.categoryAssignment.replaceChildren(empty);
    return;
  }

  const assignedIds = new Set(getAssignedCategoryIds(selected));
  elements.categoryAssignment.replaceChildren(...state.categories.map(category => {
    const label = document.createElement('label');
    label.className = 'template-category-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = category.id;
    input.checked = assignedIds.has(category.id);
    input.disabled = restricted || state.saving;
    input.addEventListener('change', () => {
      onDraftCategoriesChange();
      onClearValidation();
    });

    const text = document.createElement('span');
    text.textContent = category.name;

    label.append(input, text);
    return label;
  }));
}
