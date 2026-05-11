/**
 * Shared query-history presentation helpers.
 * Status/view metadata is isolated from polling and DOM wiring.
 */
function classifyQueryStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'running') return 'running';
  if (normalized === 'complete') return 'complete';
  if (normalized === 'canceled') return 'canceled';
  if (normalized === 'failed') return 'failed';
  return normalized || 'unknown';
}

function getQueryStatusMeta(status) {
  const bucket = classifyQueryStatus(status);

  if (bucket === 'running') {
    return { label: 'Running', rowClass: 'history-row-running', badgeClass: 'history-status-badge status-running' };
  }
  if (bucket === 'complete') {
    return { label: 'Completed', rowClass: 'history-row-complete', badgeClass: 'history-status-badge status-complete' };
  }
  if (bucket === 'canceled') {
    return { label: 'Cancelled', rowClass: 'history-row-canceled', badgeClass: 'history-status-badge status-canceled' };
  }
  if (bucket === 'failed') {
    return { label: 'Failed', rowClass: 'history-row-failed', badgeClass: 'history-status-badge status-failed' };
  }

  return { label: 'Interrupted', rowClass: 'history-row-failed', badgeClass: 'history-status-badge status-failed' };
}

function getHistorySectionMeta(sectionKey) {
  return {
    running: {
      title: 'Running',
      subtitle: 'Queries currently executing on the backend.',
      detailsClass: 'history-book running',
      summaryClass: 'history-book-summary running'
    },
    complete: {
      title: 'Completed',
      subtitle: 'Finished results ready to inspect or reload.',
      detailsClass: 'history-book complete',
      summaryClass: 'history-book-summary complete'
    },
    failed: {
      title: 'Failed / Interrupted',
      subtitle: 'Queries that errored, were abandoned, or quit unexpectedly.',
      detailsClass: 'history-book failed',
      summaryClass: 'history-book-summary failed'
    },
    canceled: {
      title: 'Cancelled',
      subtitle: 'Queries stopped intentionally before they completed.',
      detailsClass: 'history-book canceled',
      summaryClass: 'history-book-summary canceled'
    }
  }[sectionKey];
}

function buildHistorySection(sectionKey, count, isOpen = false) {
  const meta = getHistorySectionMeta(sectionKey);

  const openAttr = isOpen ? ' open' : '';
  const statusLabel = count === 0
    ? 'Empty'
    : isOpen
      ? 'Open'
      : 'Standby';
  const openHint = isOpen ? 'Close list' : 'Open list';

  return `
    <details class="${meta.detailsClass}" data-history-book="${sectionKey}"${openAttr}>
      <summary class="${meta.summaryClass}">
        <span class="history-book-spine" aria-hidden="true"></span>
        <span class="history-book-cover">
          <span class="history-book-summary-main">
            <span class="history-book-title">${meta.title}</span>
            <span class="history-book-subtitle">${meta.subtitle}</span>
          </span>
          <span class="history-book-summary-side">
            <span class="history-book-count">${count}</span>
            <span class="history-book-state">${statusLabel}</span>
            <span class="history-book-open-hint">${openHint}</span>
          </span>
        </span>
      </summary>
    </details>
  `;
}

function buildHistoryMonitor(openSection, sections) {
  if (!openSection) {
    return '';
  }

  const activeSection = sections.find(section => section.key === openSection);
  if (!activeSection) {
    return '';
  }

  const meta = getHistorySectionMeta(activeSection.key);
  const bodyContent = activeSection.rows
    ? `<div class="history-table-shell"><table class="min-w-full text-sm history-table">${activeSection.tableHead}<tbody>${activeSection.rows}</tbody></table></div>`
    : `<div class="history-empty-state history-monitor-empty">${activeSection.emptyMessage}</div>`;
  const tabs = sections.map(section => {
    const tabMeta = getHistorySectionMeta(section.key);
    const isActive = section.key === activeSection.key;
    const countLabel = `${section.count} ${section.count === 1 ? 'entry' : 'entries'}`;

    return `
      <button
        type="button"
        class="history-monitor-tab${isActive ? ' is-active' : ''} ${section.key}"
        data-history-monitor-tab="${section.key}"
        aria-pressed="${isActive ? 'true' : 'false'}"
      >
        <span class="history-monitor-tab-label">${tabMeta.title}</span>
        <span class="history-monitor-tab-count">${countLabel}</span>
      </button>
    `;
  }).join('');

  return `
    <section class="history-monitor ${activeSection.key}" data-history-monitor>
      <div class="history-monitor-header">
        <div class="history-monitor-copy">
          <span class="history-monitor-kicker">History feed</span>
          <h4 class="history-monitor-title">${meta.title}</h4>
          <p class="history-monitor-subtitle">${meta.subtitle}</p>
        </div>
        <div class="history-monitor-actions">
          <div class="history-monitor-status">
            <span class="history-monitor-status-label">Channel load</span>
            <span class="history-monitor-status-value">${activeSection.count}</span>
          </div>
          <button type="button" class="history-monitor-close" data-history-monitor-close aria-label="Close projected monitor">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </div>
      <div class="history-monitor-tabs" role="tablist" aria-label="Query history feeds">
        ${tabs}
      </div>
      <div class="history-monitor-stage">
        ${bodyContent}
      </div>
    </section>
  `;
}

function getPreferredHistorySection(counts, activeSection = 'none') {
  const orderedSections = ['running', 'complete', 'failed', 'canceled'];

  if (activeSection === 'none') {
    return null;
  }

  if (activeSection && counts[activeSection] > 0) {
    return activeSection;
  }

  return orderedSections.find(section => counts[section] > 0) || null;
}

const queryHistoryViewHelpers = Object.freeze({
  classifyQueryStatus,
  getQueryStatusMeta,
  getHistorySectionMeta,
  buildHistorySection,
  buildHistoryMonitor,
  getPreferredHistorySection
});

export {
  buildHistoryMonitor,
  buildHistorySection,
  classifyQueryStatus,
  getHistorySectionMeta,
  getPreferredHistorySection,
  getQueryStatusMeta,
  queryHistoryViewHelpers
};
