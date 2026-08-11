import { formatIdentifierList } from './bibCompareFormat.js';
import {
  candidateConfidenceBand,
  candidateScore,
  mergeCandidateRecords,
  selectedCandidateNumber,
  selectedCandidateSummary
} from './bibCandidateNavigation.js';

function candidateOption(candidate) {
  const option = document.createElement('option');
  option.value = candidate.oclc_number || '';
  const parts = [
    `OCLC ${candidate.oclc_number || 'unknown'}`,
    candidate.title,
    candidate.creator,
    candidate.date,
    candidate.edition,
    candidate.specific_format || candidate.format,
    formatIdentifierList(candidate.isbn) === 'Not present' ? '' : `ISBN ${formatIdentifierList(candidate.isbn)}`
  ].map(value => String(value || '').trim()).filter(Boolean);
  option.textContent = parts.join(' | ');
  return option;
}

function scoreLabel(candidate) {
  const score = candidateScore(candidate);
  if (score.value === null) return 'Not scored';
  return `${Math.round(score.value)}% ${score.kind === 'overall' ? 'overall' : 'match'}`;
}

function candidateListOption(candidate, selected) {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'bib-candidate-option';
  option.dataset.bibCandidateOption = candidate.oclc_number || '';
  option.dataset.confidence = candidateConfidenceBand(candidate);
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', selected ? 'true' : 'false');
  option.tabIndex = selected ? 0 : -1;

  const heading = document.createElement('span');
  heading.className = 'bib-candidate-option-heading';
  const title = document.createElement('strong');
  title.textContent = candidate.title || `OCLC ${candidate.oclc_number || 'record'}`;
  const score = document.createElement('span');
  score.className = 'bib-candidate-score';
  score.textContent = scoreLabel(candidate);
  heading.append(title, score);

  const metadata = [
    `OCLC ${candidate.oclc_number || 'unknown'}`,
    candidate.creator,
    candidate.date,
    candidate.edition,
    candidate.specific_format || candidate.format
  ].map(value => String(value || '').trim()).filter(Boolean);
  const details = document.createElement('span');
  details.className = 'bib-candidate-option-details';
  details.textContent = metadata.join(' · ');

  const note = document.createElement('span');
  note.className = 'bib-candidate-option-note';
  note.textContent = candidate.score_reason
    || candidate.match_reason
    || (candidate.validation_rejected
      ? 'Low-confidence candidate. Review the record before using it.'
      : 'Select to calculate the complete hydration score.');
  option.append(heading, details, note);
  return option;
}

function setCandidateMenuOpen(root, open, { focusOption = false } = {}) {
  const trigger = root.querySelector('[data-bib-candidate-trigger]');
  const menu = root.querySelector('[data-bib-candidate-menu]');
  if (!trigger || !menu) return;
  menu.hidden = !open;
  menu.classList.toggle('hidden', !open);
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open && focusOption) {
    (menu.querySelector('[aria-selected="true"]') || menu.querySelector('[data-bib-candidate-option]'))?.focus();
  }
}

function updateCandidateTrigger(root, candidate) {
  const title = root.querySelector('[data-bib-candidate-selected-title]');
  const meta = root.querySelector('[data-bib-candidate-selected-meta]');
  if (!title || !meta) return;
  if (!candidate) {
    title.textContent = 'Select a WorldCat match';
    meta.textContent = 'All confidence levels are available';
    return;
  }
  title.textContent = candidate.title || `OCLC ${candidate.oclc_number}`;
  meta.textContent = `OCLC ${candidate.oclc_number} · ${scoreLabel(candidate)}`;
}

function bindCandidateNavigation({ root, onSelect }) {
  const select = root.querySelector('[data-bib-candidate-select]');
  const trigger = root.querySelector('[data-bib-candidate-trigger]');
  const menu = root.querySelector('[data-bib-candidate-menu]');
  select?.addEventListener('change', event => {
    if (event.target.value) onSelect?.(event.target.value);
  });
  trigger?.addEventListener('click', () => {
    const open = trigger.getAttribute('aria-expanded') !== 'true';
    setCandidateMenuOpen(root, open, { focusOption: open });
  });
  menu?.addEventListener('click', event => {
    const option = event.target.closest?.('[data-bib-candidate-option]');
    if (!select || !option?.dataset.bibCandidateOption) return;
    select.value = option.dataset.bibCandidateOption;
    setCandidateMenuOpen(root, false);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  menu?.addEventListener('keydown', event => {
    const options = [...menu.querySelectorAll('[data-bib-candidate-option]')];
    const index = options.indexOf(document.activeElement);
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(options.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'Escape') {
      setCandidateMenuOpen(root, false);
      trigger?.focus();
      event.preventDefault();
      return;
    } else if (event.key === 'Enter' || event.key === ' ') {
      document.activeElement?.click();
      event.preventDefault();
      return;
    } else return;
    options[next]?.focus();
    event.preventDefault();
  });
  root.addEventListener('click', event => {
    if (!event.target.closest?.('[data-bib-candidate-picker]')) setCandidateMenuOpen(root, false);
  });
}

function renderCandidateNavigation({ payload, catalogKey, candidateSets, root = document }) {
  const band = root.querySelector('[data-bib-candidate-band]');
  const select = root.querySelector('[data-bib-candidate-select]');
  const menu = root.querySelector('[data-bib-candidate-menu]');
  const description = root.querySelector('[data-bib-candidate-description]');
  const key = String(catalogKey || '');
  const incoming = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const selected = selectedCandidateNumber(payload);
  const cached = candidateSets.get(key) || [];
  const selectedSummary = selectedCandidateSummary(payload, selected);
  const candidates = mergeCandidateRecords(cached, incoming, selectedSummary ? [selectedSummary] : []);
  if (key && candidates.length) candidateSets.set(key, candidates);
  const shouldShow = Boolean(payload?.needs_selection || candidates.length > 1 || (cached.length && selected));
  band?.classList.toggle('hidden', !shouldShow);
  if (!select || !menu || !shouldShow) return;

  select.replaceChildren();
  menu.replaceChildren();
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = candidates.length ? 'Select a WorldCat match' : 'No automatic candidates found';
  select.appendChild(prompt);
  candidates.forEach(candidate => {
    select.appendChild(candidateOption(candidate));
    menu.appendChild(candidateListOption(candidate, candidate.oclc_number === selected));
  });
  if (selected && Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  updateCandidateTrigger(root, candidates.find(candidate => candidate.oclc_number === selected));
  setCandidateMenuOpen(root, false);
  if (description) {
    description.textContent = candidates.length > 1
      ? `${candidates.length} possible records are ranked highest first, including low-confidence matches. Match scores are preliminary until you select a record for full review.`
      : 'This record remains available while you review the comparison.';
  }
}

export { bindCandidateNavigation, renderCandidateNavigation, setCandidateMenuOpen, updateCandidateTrigger };
