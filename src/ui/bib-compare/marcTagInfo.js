function marcTagTooltip(field = {}) {
  const tag = String(field.tag || '---');
  const label = String(field.label || 'Bibliographic Field');
  const description = String(field.description || 'No field description is available.');
  const standard = String(field.standard || '').trim();
  return `${tag} - ${label}. ${description}${standard ? ` Definition: ${standard}.` : ''}`;
}

function createMarcTagInfo(field = {}, className = 'bib-marc-tag-info') {
  const element = document.createElement('span');
  element.className = className;
  element.tabIndex = 0;
  element.setAttribute('data-tooltip', marcTagTooltip(field));
  element.setAttribute('data-tooltip-intent', 'instant');
  element.setAttribute('aria-label', marcTagTooltip(field));

  const tag = document.createElement('strong');
  tag.textContent = String(field.tag || '---');
  const label = document.createElement('span');
  label.textContent = String(field.label || 'Bibliographic Field');
  element.append(tag, label);
  return element;
}

export { createMarcTagInfo, marcTagTooltip };
