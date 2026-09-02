function normalizeReason(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function formatEstimatedShare(value) {
  const share = Number(value);
  if (!Number.isFinite(share) || share < 0 || share > 1) return '';
  if (share === 0) return 'fewer than 0.1% of records';
  const percent = share * 100;
  if (percent < 0.1) return 'fewer than 0.1% of records';
  if (percent < 10) return `about ${percent.toFixed(1).replace(/\.0$/u, '')}% of records`;
  return `about ${Math.round(percent)}% of records`;
}

function explainEvidence(reason, estimatedShare) {
  const normalizedReason = normalizeReason(reason);
  const share = formatEstimatedShare(estimatedShare);

  if (normalizedReason.includes('bounded record identifier')) {
    return 'An exact record key can narrow the search to one record or a very small set.';
  }
  if (normalizedReason.includes('exact private categorical count')) {
    return share
      ? `Current collection counts estimate that this filter matches ${share}.`
      : 'Current collection counts give the planner a reliable estimate for this filter.';
  }
  if (normalizedReason.includes('equi-depth private histogram')) {
    return share
      ? `The current value distribution estimates that this range matches ${share}.`
      : 'The current value distribution gives the planner an estimate for this range.';
  }
  if (normalizedReason.includes('joint stratified private sample')) {
    return share
      ? `A representative sample, including how this field relates to the other filters, estimates that it matches ${share}.`
      : 'A representative sample includes how this field relates to the other filters.';
  }
  if (normalizedReason.includes('stratified private sample')) {
    return share
      ? `A representative sample estimates that this filter matches ${share}.`
      : 'A representative sample gives the planner an estimate for this filter.';
  }
  if (normalizedReason.includes('conservative wildcard prior')) {
    return 'Wildcard searches usually scan more broadly, so more selective work is placed ahead of this filter when possible.';
  }
  if (normalizedReason.includes('conservative field-class prior')) {
    return share
      ? `No exact count was available, so the planner used a cautious estimate of ${share}.`
      : 'No exact count was available, so the planner used a cautious estimate for this kind of field.';
  }
  return share
    ? `The planner estimates that this filter matches ${share}.`
    : 'The complete route is estimated to finish fastest with this filter in this position.';
}

function buildOrderExplanation(plan = {}) {
  if (!Array.isArray(plan?.order) || plan.order.length === 0) return null;

  if (plan.strategy === 'manual_order_v2') {
    return {
      title: 'Manual filter order',
      summary: 'Smart ordering is off, so the filters stay in the order you chose.',
      items: []
    };
  }

  const orderedEntries = plan.order
    .map((entry, index) => ({
      ...entry,
      sourceIndex: index,
      position: Number(entry?.planned_position)
    }))
    .sort((left, right) => {
      const leftPosition = Number.isFinite(left.position) ? left.position : left.sourceIndex + 1;
      const rightPosition = Number.isFinite(right.position) ? right.position : right.sourceIndex + 1;
      return leftPosition - rightPosition || left.sourceIndex - right.sourceIndex;
    });

  const seen = new Set();
  const items = [];
  orderedEntries.forEach(entry => {
    const field = String(entry?.field || '').trim();
    const key = field.toLocaleLowerCase();
    if (!field || seen.has(key)) return;
    seen.add(key);
    items.push({
      field,
      detail: explainEvidence(entry.reason, entry.estimated_share)
    });
  });

  if (!items.length) return null;
  return {
    title: 'Why this order?',
    summary: 'The planner compared the complete valid routes—including scanning, lookups, enrichment, and output work—and chose the order with the lowest estimated total time.',
    items
  };
}

export { buildOrderExplanation, explainEvidence, formatEstimatedShare };
