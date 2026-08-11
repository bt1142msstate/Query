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
  const review = payload?.review || {};
  return {
    oclc_number: oclcNumber,
    title: summary.title || '',
    creator: summary.creator || '',
    date: summary.date || summary.publication_date || '',
    edition: summary.edition || '',
    specific_format: summary.specific_format || summary.format || '',
    isbn: Array.isArray(summary.isbn) ? summary.isbn : [],
    overall_score: review.overall_score !== null && review.overall_score !== undefined
      && Number.isFinite(Number(review.overall_score)) ? Number(review.overall_score) : null,
    identity_score: review.identity_score !== null && review.identity_score !== undefined
      && Number.isFinite(Number(review.identity_score)) ? Number(review.identity_score) : null,
    confidence_band: review.confidence_band || '',
    advice: review.advice || '',
    score_reason: review.reason || ''
  };
}

function candidateScore(candidate) {
  const overall = candidate?.overall_score;
  if (overall !== null && overall !== undefined && Number.isFinite(Number(overall))) {
    return { value: Number(overall), kind: 'overall' };
  }
  const match = candidate?.match_score;
  if (match !== null && match !== undefined && Number.isFinite(Number(match))) {
    return { value: Number(match), kind: 'match' };
  }
  return { value: null, kind: 'unscored' };
}

function candidateConfidenceBand(candidate) {
  return candidate?.confidence_band
    || candidate?.match_confidence_band
    || (candidate?.validation_rejected ? 'low' : 'review');
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
  return [...candidates.values()].sort((left, right) => {
    const leftScore = candidateScore(left);
    const rightScore = candidateScore(right);
    return (rightScore.value ?? -1) - (leftScore.value ?? -1)
      || Number(rightScore.kind === 'overall') - Number(leftScore.kind === 'overall')
      || candidateNumber(left).localeCompare(candidateNumber(right), undefined, { numeric: true });
  });
}

export {
  candidateConfidenceBand,
  candidateNumber,
  candidateScore,
  mergeCandidateRecords,
  selectedCandidateNumber,
  selectedCandidateSummary
};
