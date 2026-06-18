function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maxLength);
}

function getSiteUpdateDetails(manifest) {
  const update = manifest?.update && typeof manifest.update === 'object'
    ? manifest.update
    : {};
  const rawItems = update.items || manifest?.updateItems || [];

  return {
    title: cleanText(update.title || manifest?.updateTitle || manifest?.title, 140),
    summary: cleanText(update.summary || manifest?.updateSummary || manifest?.summary, 260),
    items: (Array.isArray(rawItems) ? rawItems : String(rawItems || '').split(/\r?\n|\|/u))
      .map(item => cleanText(item, 160))
      .filter(Boolean)
      .slice(0, 6)
  };
}

function isElement(node) {
  return Boolean(node && node.nodeType === 1);
}

function toggleDetails(event) {
  const button = event.currentTarget;
  const banner = button?.closest?.('[data-site-update-banner]');
  const details = banner?.querySelector?.('[data-site-update-details]');

  if (!details) {
    return;
  }

  const shouldOpen = details.hidden;
  details.hidden = !shouldOpen;
  button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

function createListItem(documentRef, text) {
  const listItem = documentRef.createElement('li');
  listItem.textContent = text;
  return listItem;
}

function renderSiteUpdateDetails(banner, manifest, options = {}) {
  const details = getSiteUpdateDetails(manifest);
  const hasDetails = Boolean(details.title || details.summary || details.items.length);
  const documentRef = options.document || banner?.ownerDocument || globalThis.document;
  const action = banner?.querySelector?.('[data-site-update-action]');
  const toggle = banner?.querySelector?.('[data-site-update-details-toggle]');
  const panel = banner?.querySelector?.('[data-site-update-details]');
  const title = banner?.querySelector?.('[data-site-update-details-title]');
  const summary = banner?.querySelector?.('[data-site-update-details-summary]');
  const list = banner?.querySelector?.('[data-site-update-details-list]');

  if (!isElement(toggle) || !panel || !documentRef?.createElement) {
    return details;
  }

  const keepOpen = hasDetails && !panel.hidden && toggle.getAttribute('aria-expanded') === 'true';
  toggle.hidden = !hasDetails;
  toggle.setAttribute('aria-expanded', keepOpen ? 'true' : 'false');
  panel.hidden = !keepOpen;

  if (!toggle.dataset.siteUpdateDetailsBound) {
    toggle.dataset.siteUpdateDetailsBound = 'true';
    toggle.addEventListener('click', toggleDetails);
  }

  if (isElement(title)) {
    title.textContent = details.title || 'App update';
    title.hidden = !details.title;
  }

  if (isElement(summary)) {
    summary.textContent = details.summary;
    summary.hidden = !details.summary;
  }

  if (isElement(list)) {
    list.replaceChildren(...details.items.map(item => createListItem(documentRef, item)));
    list.hidden = !details.items.length;
  }

  const label = details.title || details.summary || 'the latest app update';
  action?.setAttribute?.('aria-label', `Update now: ${label}`);
  return details;
}

export { getSiteUpdateDetails, renderSiteUpdateDetails };
