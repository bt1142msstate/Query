import { formatIdentifierList } from './bibCompareFormat.js';
import { mergeCandidateRecords, selectedCandidateNumber, selectedCandidateSummary } from './bibCandidateNavigation.js';

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

function renderCandidateNavigation({ payload, catalogKey, candidateSets, root = document }) {
  const band = root.querySelector('[data-bib-candidate-band]');
  const select = root.querySelector('[data-bib-candidate-select]');
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
  if (!select || !shouldShow) return;

  select.replaceChildren();
  const prompt = document.createElement('option');
  prompt.value = '';
  prompt.textContent = candidates.length ? 'Select a WorldCat match' : 'No automatic candidates found';
  select.appendChild(prompt);
  candidates.forEach(candidate => select.appendChild(candidateOption(candidate)));
  if (selected && Array.from(select.options).some(option => option.value === selected)) select.value = selected;
  if (description) {
    description.textContent = candidates.length > 1
      ? `${candidates.length} possible records are available. Switching the selection updates the comparison below.`
      : 'This record remains available while you review the comparison.';
  }
}

export { renderCandidateNavigation };
