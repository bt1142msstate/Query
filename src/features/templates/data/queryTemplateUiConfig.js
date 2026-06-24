function cloneUiConfig(uiConfig) {
  return uiConfig && typeof uiConfig === 'object'
    ? JSON.parse(JSON.stringify(uiConfig))
    : null;
}

function hasUsableUiConfig(uiConfig) {
  if (!uiConfig) {
    return false;
  }

  return Boolean(
    (Array.isArray(uiConfig.DesiredColumnOrder) && uiConfig.DesiredColumnOrder.length)
    || (Array.isArray(uiConfig.Filters) && uiConfig.Filters.length)
    || (Array.isArray(uiConfig.SpecialFields) && uiConfig.SpecialFields.length)
  );
}

function getUniqueTemplateName(baseName, templates = []) {
  const fallbackName = 'History query template';
  const base = String(baseName || '').trim() || fallbackName;
  const existingNames = new Set(templates.map(template => String(template.name || '').toLowerCase()));
  if (!existingNames.has(base.toLowerCase())) {
    return base;
  }

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${base} ${Date.now()}`;
}

export {
  cloneUiConfig,
  getUniqueTemplateName,
  hasUsableUiConfig
};
