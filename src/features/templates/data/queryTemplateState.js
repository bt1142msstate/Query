function compareTemplateDisplayOrder(left, right) {
  const leftPinned = left.pinned ? 1 : 0;
  const rightPinned = right.pinned ? 1 : 0;
  if (leftPinned !== rightPinned) {
    return rightPinned - leftPinned;
  }

  if (leftPinned && rightPinned) {
    const leftOrder = Number.isFinite(left.pinOrder) ? left.pinOrder : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.pinOrder) ? right.pinOrder : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
  }

  return left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
    numeric: true
  });
}

function sortTemplatesInDisplayOrder(templates) {
  return templates.sort(compareTemplateDisplayOrder);
}

function getAssignedCategoryIds(draft) {
  if (!draft || !Array.isArray(draft.categories)) {
    return [];
  }

  return draft.categories.map(category => category.id);
}

function getAssignedCategoriesForPayload(draft, categories) {
  if (!draft) {
    return [];
  }

  const categoryList = Array.isArray(categories) ? categories : [];
  const assignedIds = new Set(getAssignedCategoryIds(draft));
  return categoryList.filter(category => assignedIds.has(category.id));
}

function filterVisibleTemplates(templates, options = {}) {
  const selectedCategoryFilter = String(options.selectedCategoryFilter || '').trim();
  const searchNeedle = String(options.searchQuery || '').trim().toLowerCase();

  return templates.filter(template => {
    const matchesCategory = !selectedCategoryFilter || (
      Array.isArray(template.categories)
      && template.categories.some(category => category.id === selectedCategoryFilter)
    );

    if (!matchesCategory) {
      return false;
    }

    if (!searchNeedle) {
      return true;
    }

    const haystack = [
      template.name,
      template.description,
      ...template.categories.map(category => category.name),
      ...template.categories.map(category => category.description || '')
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(searchNeedle);
  });
}

function validateTemplateDraft(draft, options = {}) {
  const validationErrors = [];
  const trimmedName = String(draft?.name || '').trim();
  const templates = Array.isArray(options.templates) ? options.templates : [];

  if (!trimmedName) {
    validationErrors.push('Template name is required.');
  }

  const duplicate = templates.find(template =>
    template.name.toLowerCase() === trimmedName.toLowerCase()
    && template.id !== options.currentTemplateId
  );
  if (duplicate) {
    validationErrors.push('Template names must be unique.');
  }

  if (!options.currentTemplateId && !options.hasUsableCurrentQuery) {
    validationErrors.push('Build a query with at least one column or filter before saving a template.');
  }

  return validationErrors;
}

function validateCategoryName(name, options = {}) {
  const trimmedName = String(name || '').trim();
  const categories = Array.isArray(options.categories) ? options.categories : [];
  if (!trimmedName) {
    return 'Category name is required.';
  }

  const duplicate = categories.find(category =>
    category.name.toLowerCase() === trimmedName.toLowerCase()
    && category.id !== options.currentCategoryId
  );

  if (duplicate) {
    return 'Category names must be unique.';
  }

  return '';
}

function createTemplateDraftFromConfig(uiConfig) {
  return {
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
  };
}

function replaceCategoryInTemplates(templates, renamedCategory) {
  if (!renamedCategory) {
    return templates;
  }

  return templates.map(template => ({
    ...template,
    categories: (Array.isArray(template.categories) ? template.categories : []).map(category =>
      category.id === renamedCategory.id ? renamedCategory : category
    )
  }));
}

function removeCategoryFromTemplates(templates, categoryId) {
  return templates.map(template => ({
    ...template,
    categories: (Array.isArray(template.categories) ? template.categories : []).filter(item => item.id !== categoryId)
  }));
}

export {
  createTemplateDraftFromConfig,
  filterVisibleTemplates,
  getAssignedCategoriesForPayload,
  getAssignedCategoryIds,
  removeCategoryFromTemplates,
  replaceCategoryInTemplates,
  sortTemplatesInDisplayOrder,
  validateCategoryName,
  validateTemplateDraft
};
