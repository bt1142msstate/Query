function candidateNumber(candidate) {
  return String(candidate?.oclc_number || '').trim();
}

function selectedCandidateNumber(payload) {
  return String(
    payload?.selection?.oclc_number
      || payload?.worldcat?.summary?.oclc_number
      || ''
  ).trim();
}

function selectedCandidateSummary(payload, oclcNumber = selectedCandidateNumber(payload)) {
  if (!oclcNumber) return null;
  const summary = payload?.worldcat?.summary || {};
  return {
    oclc_number: oclcNumber,
    title: summary.title || '',
    creator: summary.creator || '',
    date: summary.date || summary.publication_date || '',
    edition: summary.edition || '',
    specific_format: summary.specific_format || summary.format || '',
    isbn: Array.isArray(summary.isbn) ? summary.isbn : []
  };
}

function mergeCandidateRecords(...candidateLists) {
  const candidates = new Map();
  candidateLists.flat().forEach(candidate => {
    const number = candidateNumber(candidate);
    if (!number) return;
    candidates.set(number, {
      ...(candidates.get(number) || {}),
      ...candidate,
      oclc_number: number
    });
  });
  return [...candidates.values()];
}

export {
  candidateNumber,
  mergeCandidateRecords,
  selectedCandidateNumber,
  selectedCandidateSummary
};
