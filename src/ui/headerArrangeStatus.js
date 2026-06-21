const HEADER_ARRANGE_STATUS_ID = 'header-arrange-status';
const HEADER_ARRANGE_ACTIVE_BODY_CLASS = 'header-arrange-status-active';

function getHeaderArrangeStatusElement(documentRef = globalThis.document) {
  return documentRef?.getElementById?.(HEADER_ARRANGE_STATUS_ID) || null;
}

function normalizeStatusText(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

function showHeaderArrangeStatus(label, options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const status = getHeaderArrangeStatusElement(documentRef);
  if (!status) {
    return false;
  }

  const action = normalizeStatusText(options.action || 'Arranging');
  const normalizedLabel = normalizeStatusText(label);
  const text = normalizedLabel ? `${action}: ${normalizedLabel}` : action;
  status.textContent = text;
  status.title = text;
  status.classList.remove('hidden');
  status.removeAttribute('hidden');
  status.setAttribute('aria-label', text);
  status.dataset.arrangeAction = action.toLowerCase();
  documentRef.body?.classList?.add(HEADER_ARRANGE_ACTIVE_BODY_CLASS);
  return true;
}

function clearHeaderArrangeStatus(options = {}) {
  const documentRef = options.documentRef || globalThis.document;
  const status = getHeaderArrangeStatusElement(documentRef);
  if (!status) {
    return false;
  }

  status.textContent = '';
  status.title = '';
  status.classList.add('hidden');
  status.setAttribute('hidden', '');
  status.removeAttribute('aria-label');
  delete status.dataset.arrangeAction;
  documentRef.body?.classList?.remove(HEADER_ARRANGE_ACTIVE_BODY_CLASS);
  return true;
}

export { clearHeaderArrangeStatus, showHeaderArrangeStatus };
