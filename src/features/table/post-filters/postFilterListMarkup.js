function getPostFilterEntries(snapshot) {
  return Object.entries(snapshot)
    .filter(([, data]) => Array.isArray(data?.filters) && data.filters.length > 0)
    .map(([field, data]) => ({
      field,
      logic: String(data?.logic || 'all').toLowerCase() === 'any' ? 'any' : 'all',
      showLogic: data.filters.length > 1,
      filters: data.filters.map((filter, index) => ({ filter, index }))
    }));
}

function buildPostFilterListMarkup(snapshot, {
  escapeHtml,
  formatFilterValue,
  getOperatorLabel
}) {
  const entries = getPostFilterEntries(snapshot);
  const html = entries.map(entry => {
    const safeField = escapeHtml(entry.field);
    const ruleLabel = entry.logic === 'any' ? 'Rows can match any rule below' : 'Rows must match every rule below';
    const safeRuleLabel = escapeHtml(ruleLabel);
    const filterMarkup = entry.filters.map(({ filter, index }) => {
      const valueLabel = formatFilterValue(filter, entry.field);
      const label = valueLabel ? `${getOperatorLabel(filter.cond)} ${valueLabel}` : getOperatorLabel(filter.cond);
      const safeLabel = escapeHtml(label);
      return `
        <div class="post-filter-pill">
          <span class="post-filter-pill__text">${safeLabel}</span>
          <button type="button" class="post-filter-pill__remove" data-field="${entry.field}" data-index="${index}" aria-label="Remove post filter">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4 pointer-events-none">
              <line x1="5" y1="5" x2="15" y2="15"></line>
              <line x1="15" y1="5" x2="5" y2="15"></line>
            </svg>
          </button>
        </div>`;
    }).join('');

    return `
      <section class="post-filter-group" data-field="${entry.field}">
        <div class="post-filter-group__header">
          <div>
            <h4 class="post-filter-group__title">${safeField}</h4>
            <p class="post-filter-group__meta">${entry.filters.length} ${entry.filters.length === 1 ? 'rule' : 'rules'}</p>
          </div>
          ${entry.showLogic ? `
          <label class="post-filter-group__logic">
            <span class="post-filter-group__logic-label">${safeRuleLabel}</span>
            <select class="post-filter-group__logic-select" data-field-logic="${entry.field}" aria-label="Change logic for ${safeField}">
              <option value="all" ${entry.logic === 'all' ? 'selected' : ''}>Require all</option>
              <option value="any" ${entry.logic === 'any' ? 'selected' : ''}>Allow any</option>
            </select>
          </label>` : ''}
        </div>
        <div class="post-filter-group__rules">${filterMarkup}</div>
      </section>`;
  }).join('');

  return { hasEntries: entries.length > 0, html };
}

export { buildPostFilterListMarkup };
