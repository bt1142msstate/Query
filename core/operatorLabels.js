const LABELS = Object.freeze({
  contains: 'Contains',
  starts: 'Starts with',
  starts_with: 'Starts with',
  equals: 'Equals',
  does_not_equal: 'Does not equal',
  greater: 'Greater than',
  greater_or_equal: 'Greater than or equal',
  less: 'Less than',
  less_or_equal: 'Less than or equal',
  between: 'Between',
  before: 'Before',
  after: 'After',
  doesnotcontain: 'Does not contain',
  does_not_contain: 'Does not contain',
  on_or_after: 'On or after',
  on_or_before: 'On or before',
  show: 'Show',
  hide: 'Hide'
});

function get(operator, fallback = 'Equals') {
  const normalized = String(operator || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (LABELS[normalized]) {
    return LABELS[normalized];
  }

  return normalized
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const OperatorLabels = Object.freeze({ get });

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'OperatorLabels', {
    configurable: false,
    enumerable: true,
    value: OperatorLabels,
    writable: false
  });
}

export { OperatorLabels, get };
