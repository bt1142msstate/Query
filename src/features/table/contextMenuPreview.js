export function createTableContextPreview({
  document,
  getFields,
  services
}) {
  let activePreviewColumnIndices = [];

  function clearTablePreviewClasses() {
    document.querySelectorAll('.tcm-preview-cell, .tcm-preview-row, .tcm-preview-column, .tcm-preview-column-header').forEach(node => {
      node.classList.remove('tcm-preview-cell', 'tcm-preview-row', 'tcm-preview-column', 'tcm-preview-column-header');
    });
  }

  function clearActiveColumnPreview() {
    activePreviewColumnIndices = [];
    clearTablePreviewClasses();
  }

  function applyColumnPreviewIndices(indices) {
    clearTablePreviewClasses();
    indices.forEach(index => {
      if (Number.isNaN(index)) {
        return;
      }

      document.querySelector(`#example-table thead th[data-col-index="${index}"]`)?.classList.add('tcm-preview-column-header');
      document.querySelectorAll(`#example-table tbody td[data-col-index="${index}"]`).forEach(td => {
        td.classList.add('tcm-preview-column');
      });
    });
  }

  function previewColumns(indices) {
    activePreviewColumnIndices = indices.filter(index => !Number.isNaN(index));
    applyColumnPreviewIndices(activePreviewColumnIndices);
    return clearActiveColumnPreview;
  }

  function previewCell(td) {
    activePreviewColumnIndices = [];
    clearTablePreviewClasses();
    td?.classList.add('tcm-preview-cell');
    return clearTablePreviewClasses;
  }

  function previewRow(tr) {
    activePreviewColumnIndices = [];
    clearTablePreviewClasses();
    tr?.classList.add('tcm-preview-row');
    tr?.querySelectorAll('td').forEach(td => td.classList.add('tcm-preview-row'));
    return clearTablePreviewClasses;
  }

  function previewColumn(colIndex) {
    if (Number.isNaN(colIndex)) {
      return clearTablePreviewClasses;
    }

    return previewColumns([colIndex]);
  }

  function previewColumnGroup(fieldName, fallbackColIndex) {
    const fields = getFields();
    const groupIndices = services.getDisplayedFieldMoveGroupIndices?.(fieldName, fields) || [];
    const previewIndices = groupIndices.length > 1 ? groupIndices : [fallbackColIndex];

    return previewColumns(previewIndices);
  }

  function reapplyColumnPreview() {
    if (activePreviewColumnIndices.length) {
      applyColumnPreviewIndices(activePreviewColumnIndices);
    }
  }

  return {
    previewCell,
    previewColumn,
    previewColumnGroup,
    previewRow,
    reapplyColumnPreview
  };
}
