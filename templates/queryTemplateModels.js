function getTemplateId(template) {
  return String(
    template?.id
    || template?.template_id
    || template?.templateId
    || template?.name
    || template?.template_name
    || ''
  ).trim();
}

function normalizeCategory(rawCategory, index) {
  const id = String(
    rawCategory?.id
    || rawCategory?.category_id
    || rawCategory?.categoryId
    || rawCategory?.name
    || `category-${index}`
  ).trim();
  const name = String(rawCategory?.name || rawCategory?.category_name || '').trim();
  const description = String(rawCategory?.description || rawCategory?.category_description || '').trim();

  return {
    id,
    name,
    description
  };
}

function normalizeCategoryList(rawCategories) {
  if (!Array.isArray(rawCategories)) {
    return [];
  }

  return rawCategories
    .map(normalizeCategory)
    .filter(category => category.id && category.name)
    .sort((left, right) => left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true
    }));
}

function normalizeTemplate(rawTemplate, index) {
  const uiConfig = rawTemplate?.ui_config || rawTemplate?.jsonConfig || rawTemplate?.config || null;
  const name = String(rawTemplate?.name || rawTemplate?.template_name || '').trim();
  const description = String(rawTemplate?.description || '').trim();
  const svg = String(rawTemplate?.svg || rawTemplate?.bubble_svg || '').trim();
  const id = getTemplateId(rawTemplate) || `template-${index}`;
  const categories = Array.isArray(rawTemplate?.categories)
    ? normalizeCategoryList(rawTemplate.categories)
    : [];

  return {
    id,
    name,
    description,
    svg,
    categories,
    uiConfig,
    pinned: Boolean(rawTemplate?.pinned),
    pinOrder: Number.isFinite(Number(rawTemplate?.pin_order)) ? Number(rawTemplate?.pin_order) : null,
    createdAt: rawTemplate?.created_at || rawTemplate?.createdAt || '',
    updatedAt: rawTemplate?.updated_at || rawTemplate?.updatedAt || rawTemplate?.modified_at || ''
  };
}

function cloneTemplate(template) {
  if (!template) {
    return null;
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    svg: template.svg,
    categories: template.categories ? JSON.parse(JSON.stringify(template.categories)) : [],
    uiConfig: template.uiConfig ? JSON.parse(JSON.stringify(template.uiConfig)) : null,
    pinned: Boolean(template.pinned),
    pinOrder: Number.isFinite(Number(template.pinOrder)) ? Number(template.pinOrder) : null,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt
  };
}

function sanitizeSvgMarkup(rawSvg) {
  const normalized = String(rawSvg || '').trim();
  if (!normalized) {
    return '';
  }

  const withoutHeader = normalized
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  if (!/^<svg[\s\S]*<\/svg>$/i.test(withoutHeader)) {
    return '';
  }

  return withoutHeader
    .replace(/\son\w+=(["']).*?\1/gi, '')
    .replace(/\son\w+=([^\s>]+)/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

function formatTimestamp(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

export {
  cloneTemplate,
  formatTimestamp,
  getTemplateId,
  normalizeCategory,
  normalizeCategoryList,
  normalizeTemplate,
  sanitizeSvgMarkup
};
