import { formatTimestamp } from './queryTemplateModels.js';

function buildCategoryFilterOptions(categories = []) {
  return [
    { value: '', label: 'All categories' },
    ...(Array.isArray(categories) ? categories : []).map(category => ({
      value: category.id,
      label: category.name
    }))
  ];
}

function buildTemplateFilterSummary({
  searchQuery = '',
  selectedCategoryFilter = '',
  categories = [],
  visibleCount = 0,
  totalCount = 0
} = {}) {
  const summaryBits = [];
  const normalizedSearch = String(searchQuery || '').trim();

  if (normalizedSearch) {
    summaryBits.push(`Search: "${normalizedSearch}"`);
  }

  if (selectedCategoryFilter) {
    const selectedCategory = categories.find(category => category.id === selectedCategoryFilter);
    summaryBits.push(`Category: ${selectedCategory ? selectedCategory.name : 'Filtered'}`);
  }

  summaryBits.push(`${visibleCount} of ${totalCount} templates`);
  return summaryBits.join(' • ');
}

function getCategoryUsageCount(categoryId, templates = []) {
  return (Array.isArray(templates) ? templates : []).filter(template => (
    Array.isArray(template.categories)
    && template.categories.some(category => category.id === categoryId)
  )).length;
}

function buildCategoryCardMeta(category, templates = []) {
  const usageCount = getCategoryUsageCount(category?.id, templates);
  const description = String(category?.description || '').trim();
  return `${usageCount} template${usageCount === 1 ? '' : 's'}${description ? ` • ${description}` : ''}`;
}

function getTemplateListSections(visibleTemplates = []) {
  const templates = Array.isArray(visibleTemplates) ? visibleTemplates : [];
  const pinnedTemplates = templates.filter(template => template.pinned);
  const otherTemplates = templates.filter(template => !template.pinned);
  const sections = [];

  if (pinnedTemplates.length) {
    sections.push({
      key: 'pinned',
      title: 'Pinned Templates',
      items: pinnedTemplates,
      draggable: pinnedTemplates.length > 1
    });
  }

  if (otherTemplates.length) {
    sections.push({
      key: 'other',
      title: pinnedTemplates.length ? 'All Other Templates' : 'Templates',
      items: otherTemplates,
      draggable: false
    });
  }

  return sections;
}

function getPinnedTemplatesForStrip(templates = []) {
  return (Array.isArray(templates) ? templates : [])
    .filter(template => template.pinned)
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left.pinOrder) ? left.pinOrder : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.pinOrder) ? right.pinOrder : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });
}

function buildTemplateDetailMeta({ selected, isNew = false, restricted = false } = {}) {
  if (!selected) {
    return '';
  }

  const metaParts = [];
  const timestamp = formatTimestamp(selected.updatedAt || selected.createdAt);
  const categories = Array.isArray(selected.categories) ? selected.categories : [];

  if (timestamp) {
    metaParts.push(`Last saved ${timestamp}`);
  }

  if (categories.length) {
    metaParts.push(`Categories: ${categories.map(category => category.name).join(', ')}`);
  }

  if (!restricted) {
    metaParts.push(isNew
      ? 'Saving will capture the current query columns and filters.'
      : 'Saving will update the query to your current columns and filters, or preserve the existing query if none is built.'
    );
  }

  return metaParts.join(' • ');
}

export {
  buildCategoryCardMeta,
  buildCategoryFilterOptions,
  buildTemplateDetailMeta,
  buildTemplateFilterSummary,
  getCategoryUsageCount,
  getPinnedTemplatesForStrip,
  getTemplateListSections
};
