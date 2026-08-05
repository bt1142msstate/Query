const STATUS = Object.freeze({
  strong: { label: 'Strong evidence', tone: 'strong' },
  supported: { label: 'Supported', tone: 'supported' },
  needs_review: { label: 'Needs review', tone: 'review' },
  conflicting: { label: 'Conflicting', tone: 'conflict' },
  already_present: { label: 'Already present', tone: 'present' },
  not_appropriate: { label: 'Not appropriate', tone: 'blocked' }
});

const RELATIONSHIP = Object.freeze({
  missing_locally: 'Not currently present locally',
  already_present: 'Same complete value is local',
  partially_present: 'Some values already exist locally',
  different_existing_value: 'Different local value exists'
});

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function fieldEvidenceStatus(status) {
  return STATUS[status] || { label: 'Needs review', tone: 'review' };
}

function fieldEvidenceDownloadReady(review) {
  return Boolean(review?.applicable && review?.ready_for_candidate_download);
}

function fieldEvidenceSummary(review) {
  const fields = Array.isArray(review?.fields) ? review.fields : [];
  if (!fields.length) return '';
  const counts = fields.reduce((result, field) => {
    result[field.status] = (result[field.status] || 0) + 1;
    return result;
  }, {});
  return Object.entries(STATUS)
    .filter(([status]) => counts[status])
    .map(([status, metadata]) => `${counts[status]} ${metadata.label.toLowerCase()}`)
    .join('; ');
}

function appendMetadata(item, label, values) {
  const entries = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);
  if (!entries.length) return;
  const row = createElement('div', 'bib-field-evidence-metadata');
  row.append(
    createElement('span', '', label),
    createElement('strong', '', entries.join(', '))
  );
  item.appendChild(row);
}

function buildEvidenceItem(field, recordProvenance) {
  const metadata = fieldEvidenceStatus(field?.status);
  const item = createElement('article', 'bib-field-evidence-item');
  item.dataset.tone = metadata.tone;
  const heading = createElement('div', 'bib-field-evidence-item-heading');
  const title = createElement('div', 'bib-field-evidence-title');
  title.append(
    createElement('strong', '', String(field?.tag || '---')),
    createElement('span', '', field?.label || 'Bibliographic field')
  );
  heading.append(title, createElement('span', 'bib-field-evidence-status', metadata.label));
  item.append(heading, createElement('p', 'bib-field-evidence-reason', field?.reason || 'Review this field before use.'));

  const details = createElement('details', 'bib-field-evidence-details');
  details.appendChild(createElement('summary', '', 'Evidence details'));
  appendMetadata(details, 'Selection path', field?.source_path_label);
  appendMetadata(details, 'Local comparison', RELATIONSHIP[field?.local_relationship] || field?.local_relationship);
  appendMetadata(details, 'Field attribution', field?.field_attribution);
  appendMetadata(details, 'Cataloging agencies', recordProvenance?.cataloging_agencies);
  appendMetadata(details, 'Authentication', recordProvenance?.authentication_codes);
  if (Array.isArray(field?.structure?.issues) && field.structure.issues.length) {
    appendMetadata(details, 'Structural findings', field.structure.issues);
  }
  item.appendChild(details);
  return item;
}

function renderFieldEvidenceReview(container, review) {
  if (!container) return;
  const fields = Array.isArray(review?.fields) ? review.fields : [];
  container.replaceChildren();
  container.classList.toggle('hidden', !review?.applicable || !fields.length);
  if (!review?.applicable || !fields.length) return;

  const header = createElement('div', 'bib-field-evidence-header');
  const heading = createElement('div');
  heading.append(
    createElement('h3', '', 'Field evidence review'),
    createElement('p', '', 'Checks each requested value independently. This does not change the identity or confidence scores.')
  );
  const overall = createElement(
    'span',
    'bib-field-evidence-overall',
    fieldEvidenceDownloadReady(review) ? 'Fields ready' : 'Review needed'
  );
  overall.dataset.ready = fieldEvidenceDownloadReady(review) ? 'true' : 'false';
  header.append(heading, overall);

  const list = createElement('div', 'bib-field-evidence-list');
  fields.forEach(field => list.appendChild(buildEvidenceItem(field, review.record_provenance)));
  container.append(header, list);
}

export {
  fieldEvidenceDownloadReady,
  fieldEvidenceStatus,
  fieldEvidenceSummary,
  renderFieldEvidenceReview
};
