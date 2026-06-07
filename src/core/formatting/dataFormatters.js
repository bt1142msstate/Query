function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} sec`);

  return parts.join(' ');
}

export {
  escapeRegExp,
  formatDuration
};
