import { downloadHydrationReviewWorkbook } from './oclcBibBulk.js';

function tagCounts(record) {
  return (record?.fields || []).reduce((counts, field) => {
    const tag = String(field?.tag || '');
    if (/^\d{3}$/u.test(tag)) counts[tag] = (counts[tag] || 0) + 1;
    return counts;
  }, {});
}

function singleReviewResult(payload) {
  const differenceTags = { changed: {}, local_only: {}, worldcat_only: {} };
  (payload?.comparison?.rows || []).forEach(row => {
    if (!differenceTags[row.status] || !/^\d{3}$/u.test(String(row.tag || ''))) return;
    differenceTags[row.status][row.tag] = (differenceTags[row.status][row.tag] || 0) + 1;
  });
  return {
    input: payload?.local?.summary?.catalog_key || '',
    lookup_type: 'catalog_key',
    status: payload?.review?.recommended ? 'resolved' : 'review',
    local: payload?.local?.summary || {},
    worldcat: payload?.worldcat?.summary || {},
    selection: payload?.selection || {},
    match: payload?.match || {},
    review: payload?.review || {},
    field_summary: {
      local_tags: tagCounts(payload?.local?.record),
      worldcat_tags: tagCounts(payload?.worldcat?.record),
      difference_tags: differenceTags
    }
  };
}

function bindSingleHydrationExcel({ workspace, getPayload, notify }) {
  workspace.querySelector('[data-bib-excel-download]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const payload = getPayload();
    if (button.disabled || !payload) return;
    button.disabled = true;
    try {
      await downloadHydrationReviewWorkbook([singleReviewResult(payload)]);
      notify('Hydration review workbook downloaded.', 'success');
    } catch (error) {
      notify(error.message || 'The review workbook could not be created.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}

export { bindSingleHydrationExcel, singleReviewResult, tagCounts };
