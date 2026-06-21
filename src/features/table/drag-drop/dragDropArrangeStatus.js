import { getBaseFieldName } from '../../../core/queryState.js';
import { clearHeaderArrangeStatus, showHeaderArrangeStatus } from '../../../ui/headerArrangeStatus.js';

function getHeaderFieldLabel(th) {
  return String(
    th?.getAttribute?.('data-sort-field')
    || th?.querySelector?.('.th-text')?.textContent
    || th?.textContent
    || ''
  ).replace(/\s+/gu, ' ').trim();
}

function getColumnDragStatusLabel(fieldName, relatedIndices = []) {
  const normalizedField = String(fieldName || '').trim();
  if (!normalizedField) {
    return 'field';
  }

  if (Array.isArray(relatedIndices) && relatedIndices.length > 1) {
    return `${getBaseFieldName(normalizedField)} (${relatedIndices.length} fields)`;
  }

  return normalizedField;
}

function showColumnDragArrangeStatus(th, fieldName, relatedIndices = []) {
  const label = getColumnDragStatusLabel(fieldName || getHeaderFieldLabel(th), relatedIndices);
  showHeaderArrangeStatus(label, { action: 'Dragging' });
}

export { clearHeaderArrangeStatus as clearColumnDragArrangeStatus, showColumnDragArrangeStatus };
