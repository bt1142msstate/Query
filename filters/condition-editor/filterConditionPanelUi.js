import { escapeHtml } from '../../core/formatting/html.js';

export function getPreferredCondition(conditions, fieldName, getFilterGroupForField) {
  const available = Array.isArray(conditions) ? conditions.filter(Boolean) : [];
  if (!available.length) return '';

  const activeFieldFilters = fieldName ? getFilterGroupForField(fieldName) : null;
  const filterConds = activeFieldFilters && Array.isArray(activeFieldFilters.filters)
    ? activeFieldFilters.filters.map(filter => String(filter.cond || '').trim().toLowerCase())
    : [];

  const preferredFromActive = filterConds.find(cond => available.includes(cond));
  if (preferredFromActive) {
    return preferredFromActive;
  }

  if (available.includes('equals')) {
    return 'equals';
  }

  return available[0];
}

export function removeConditionPanelNote(document) {
  const existingNote = document.getElementById('condition-panel-note');
  if (existingNote && existingNote.parentNode) {
    existingNote.parentNode.removeChild(existingNote);
  }
}

export function showConditionPanelNote({
  document,
  inputWrapper,
  options
}) {
  if (!inputWrapper) return;

  const config = typeof options === 'string'
    ? { body: options }
    : (options && typeof options === 'object' ? options : {});

  removeConditionPanelNote(document);

  const note = document.createElement('div');
  note.id = 'condition-panel-note';
  note.className = 'condition-panel-note';
  const kicker = config.kicker ? `<span class="condition-panel-note-kicker">${escapeHtml(config.kicker)}</span>` : '';
  const title = config.title ? `<strong class="condition-panel-note-title">${escapeHtml(config.title)}</strong>` : '';
  const body = config.body ? `<p class="condition-panel-note-body">${escapeHtml(config.body)}</p>` : '';
  const hint = config.hint ? `<p class="condition-panel-note-hint">${escapeHtml(config.hint)}</p>` : '';
  note.innerHTML = `${kicker}${title}${body}${hint}`;

  inputWrapper.appendChild(note);
  inputWrapper.style.display = 'flex';
  inputWrapper.classList.add('show');
}

export function showFilterError({
  errorLabel,
  inputElements = [],
  message,
  duration = 3000
}) {
  inputElements.forEach(input => {
    if (input) input.classList.add('error');
  });

  if (errorLabel) {
    errorLabel.textContent = message;
    errorLabel.style.display = 'block';
  }

  setTimeout(() => {
    if (errorLabel) errorLabel.style.display = 'none';
    inputElements.forEach(input => {
      if (input) input.classList.remove('error');
    });
  }, duration);

  return false;
}
