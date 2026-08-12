import { fieldEvidenceSummary } from './fieldEvidenceReview.js';
import { bibliographicSource, sourceReviewCount } from './bibSource.js';

const STATUS_LABELS = {
  resolved: 'Matched',
  review: 'Review',
  not_found: 'Not found',
  failed: 'Failed'
};

const REVIEW_FIELDS = [
  'Input', 'Lookup Type',
  'Spreadsheet Row', 'Spreadsheet Title', 'Spreadsheet Creators', 'Spreadsheet ISBN',
  'Spreadsheet ISSN', 'Spreadsheet LCCN', 'Spreadsheet OCLC Number',
  'Spreadsheet Standard Numbers', 'Spreadsheet Edition', 'Spreadsheet Publisher',
  'Spreadsheet Publication Place', 'Spreadsheet Publication Years', 'Spreadsheet Languages',
  'Spreadsheet Format', 'Spreadsheet Physical Description', 'Spreadsheet Series',
  'Status', 'Local Record Key', 'Local Title', 'Local Creator', 'Local Edition',
  'Local Publication', 'Local Physical Description', 'Local ISBN', 'Source', 'Source Role',
  'Source Identifier', 'Source Title', 'Source Creator', 'Source Edition', 'Source Publication',
  'Source Physical Description', 'Source ISBN', 'Local MARC Tags', 'Source MARC Tags',
  'Changed MARC Tags', 'Local-only MARC Tags', 'Source-only MARC Tags', 'Selection Method',
  'Exact Edition Candidates', 'Selected Utility Score', 'Encoding Level', 'Authentication Codes',
  'Core Elements Present', 'Utility Score Breakdown', 'Match Confidence', 'Title Match',
  'Creator Match', 'Edition Match', 'Publication Year Match', 'Physical Description Match',
  'Exact Edition Verified', 'Local 521 Count', 'Local 526 Count', 'Source 521 Count',
  'Source 526 Count', 'Identity Conflict', 'Hydration Advice', 'Overall Confidence',
  'Record Identity Confidence', 'Requested Field Suitability', 'Requested Fields',
  'Missing Requested Fields', 'Blocked Requested Fields', 'Confidence Policy Version',
  'Field Evidence Summary', 'Field Evidence Ready', 'Fields Needing Review', 'Conflicting Fields',
  'Already-present Fields', 'Field Evidence Policy Version', 'Review Note'
];

function yesNo(value) {
  if (value === undefined || value === null) return '';
  return value ? 'Yes' : 'No';
}

function joinValues(values) {
  return Array.isArray(values) ? values.filter(Boolean).join('; ') : (values || '');
}

function formatTagCounts(counts) {
  if (!counts || typeof counts !== 'object') return '';
  return Object.entries(counts)
    .filter(([tag, count]) => /^\d{3}$/u.test(tag) && Number(count) > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, count]) => `${tag} (${Number(count).toLocaleString()})`)
    .join('; ');
}

function formatScoreParts(parts) {
  if (!parts || typeof parts !== 'object') return '';
  return Object.entries(parts)
    .filter(([, points]) => Number.isFinite(Number(points)))
    .map(([name, points]) => `${name.replaceAll('_', ' ')}: ${Number(points)}`)
    .join('; ');
}

function spreadsheetColumns(metadata) {
  return [
    metadata.row_label || '', metadata.title || '', joinValues(metadata.creators),
    joinValues(metadata.isbns), joinValues(metadata.issns), joinValues(metadata.lccns),
    joinValues(metadata.oclc_numbers), joinValues(metadata.standard_numbers), metadata.edition || '',
    metadata.publisher || '', metadata.publication_place || '', joinValues(metadata.years),
    joinValues(metadata.languages), metadata.format || '', metadata.physical_description || '',
    joinValues(metadata.series)
  ];
}

function recordColumns(local, source, external) {
  return [
    local.catalog_key || '', local.title || '', local.creator || '', local.edition || '',
    local.publication || '', local.physical_description || '', joinValues(local.isbn),
    source.label, source.role, source.identifier, external.title || '', external.creator || '',
    external.edition || '', external.publication || '', external.physical_description || '',
    joinValues(external.isbn)
  ];
}

function selectionColumns(selection, match, fieldSummary) {
  const differenceTags = fieldSummary.difference_tags || {};
  const utility = selection.utility || {};
  return [
    formatTagCounts(fieldSummary.local_tags), formatTagCounts(fieldSummary.worldcat_tags),
    formatTagCounts(differenceTags.changed), formatTagCounts(differenceTags.local_only),
    formatTagCounts(differenceTags.worldcat_only), selection.method || '',
    selection.exact_candidate_count ?? '', utility.score ?? '', utility.encoding_level || '',
    joinValues(utility.authentication_codes), joinValues(utility.core_elements),
    formatScoreParts(utility.parts), match.confidence || '', yesNo(match.title_match),
    yesNo(match.creator_match), yesNo(match.edition_match), yesNo(match.publication_year_match),
    yesNo(match.physical_description_match)
  ];
}

function reviewColumns(review) {
  const fieldEvidence = review.field_evidence || {};
  return [
    yesNo(review.hydration_ready), review.local_521_count ?? '', review.local_526_count ?? '',
    sourceReviewCount(review, '521'), sourceReviewCount(review, '526'),
    yesNo(review.identity_conflict), String(review.advice || '').replaceAll('_', ' '),
    review.overall_score ?? '', review.identity_score ?? '',
    review.mode === 'all_fields' ? 'General' : (review.target_field_score ?? ''),
    joinValues(review.requested_tags), joinValues(review.missing_tags),
    joinValues(review.blocked_tags), review.scoring_version || '', fieldEvidenceSummary(fieldEvidence),
    yesNo(fieldEvidence.ready_for_candidate_download), joinValues(fieldEvidence.needs_review_tags),
    joinValues(fieldEvidence.conflicting_tags), joinValues(fieldEvidence.already_present_tags),
    fieldEvidence.version || ''
  ];
}

function bulkResultToWorkbookRow(result) {
  const source = bibliographicSource(result);
  return [
    result.original || result.input || '',
    String(result.lookup_type || '').replaceAll('_', ' '),
    ...spreadsheetColumns(result.input_metadata || {}),
    STATUS_LABELS[result.status] || result.status || 'Review',
    ...recordColumns(result.local || {}, source, result.external || result.worldcat || {}),
    ...selectionColumns(result.selection || {}, result.match || {}, result.field_summary || {}),
    ...reviewColumns(result.review || {}),
    result.reason || ''
  ];
}

function buildBulkReviewWorkbookState(results) {
  const rows = (results || []).map(bulkResultToWorkbookRow);
  const columnMap = new Map(REVIEW_FIELDS.map((field, index) => [field, index]));
  return {
    groupingCandidates: [],
    rowCount: rows.length,
    sourceData: {
      dataRows: rows,
      displayedFields: [...REVIEW_FIELDS],
      fieldTypeMap: new Map(REVIEW_FIELDS.map(field => [
        field,
        field.endsWith(' Count') ? 'number' : 'string'
      ])),
      virtualData: { columnMap }
    },
    tableName: 'Hydration Review'
  };
}

export { buildBulkReviewWorkbookState };
