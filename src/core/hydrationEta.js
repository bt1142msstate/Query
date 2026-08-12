function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseHydrationTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const source = String(value || '').trim();
  if (!source) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(source)
    ? source.replace(' ', 'T')
    : source;
  const epoch = new Date(normalized).getTime();
  return Number.isFinite(epoch) ? epoch : null;
}

function formatHydrationRemaining(milliseconds) {
  const seconds = Math.max(1, Math.ceil(Number(milliseconds || 0) / 1000));
  if (seconds < 60) return 'under 1 min';

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = Math.ceil((minutes % 60) / 5) * 5;
  if (hours < 24) {
    return remainderMinutes >= 60
      ? `about ${hours + 1} hr`
      : `about ${hours} hr${remainderMinutes ? ` ${remainderMinutes} min` : ''}`;
  }

  const days = Math.floor(hours / 24);
  const remainderHours = hours % 24;
  return `about ${days} day${days === 1 ? '' : 's'}${remainderHours ? ` ${remainderHours} hr` : ''}`;
}

function formatHydrationCompletionTime(epoch) {
  return new Date(epoch).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function estimateHydrationEta({ completed, total, startedAt, now = Date.now() } = {}) {
  const completedCount = normalizeCount(completed);
  const totalCount = normalizeCount(total);
  const startedEpoch = parseHydrationTimestamp(startedAt);
  const nowEpoch = parseHydrationTimestamp(now);

  if (totalCount === null || totalCount <= 0 || completedCount === null) {
    return { state: 'unavailable', text: '' };
  }
  if (completedCount >= totalCount) {
    return { state: 'complete', text: 'Complete', remainingMs: 0, completesAt: nowEpoch };
  }
  if (!completedCount || startedEpoch === null || nowEpoch === null || nowEpoch <= startedEpoch) {
    return { state: 'estimating', text: 'ETA: calculating after first batch' };
  }

  const elapsedMs = nowEpoch - startedEpoch;
  const ratePerMs = completedCount / elapsedMs;
  if (!Number.isFinite(ratePerMs) || ratePerMs <= 0) {
    return { state: 'estimating', text: 'ETA: calculating after first batch' };
  }

  const remainingMs = Math.max(1000, Math.ceil((totalCount - completedCount) / ratePerMs));
  const completesAt = nowEpoch + remainingMs;
  return {
    state: 'estimated',
    remainingMs,
    completesAt,
    text: `ETA: ${formatHydrationRemaining(remainingMs)} remaining · around ${formatHydrationCompletionTime(completesAt)}`
  };
}

export {
  estimateHydrationEta,
  formatHydrationRemaining,
  parseHydrationTimestamp
};
