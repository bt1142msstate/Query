import { escapeHtml } from '../../core/formatting/html.js';
import { classifyRunStatus, getDurationSeconds, getRunRows } from './kpiDashboardModel.js';

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatPercent(value) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatDuration(seconds) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDate(value, includeTime = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';
  return date.toLocaleDateString([], includeTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function kpiCard(label, value, detail, tone = '') {
  return `<article class="kpi-card ${tone ? `kpi-card--${tone}` : ''}">
    <span class="kpi-card__label">${escapeHtml(label)}</span>
    <strong class="kpi-card__value">${escapeHtml(value)}</strong>
    <span class="kpi-card__detail">${escapeHtml(detail)}</span>
  </article>`;
}

function renderTrendChart(trend) {
  const maximum = Math.max(1, ...trend.buckets.map(bucket => bucket.total));
  const bars = trend.buckets.map(bucket => {
    const completeHeight = (bucket.complete / maximum) * 100;
    const otherHeight = (bucket.other / maximum) * 100;
    const label = `${bucket.label}: ${bucket.total} run${bucket.total === 1 ? '' : 's'}, ${bucket.complete} completed`;
    return `<div class="kpi-trend__column" aria-label="${escapeHtml(label)}">
      <span class="kpi-trend__value">${bucket.total || ''}</span>
      <span class="kpi-trend__bar" aria-hidden="true">
        <span class="kpi-trend__segment kpi-trend__segment--other" style="height:${otherHeight}%"></span>
        <span class="kpi-trend__segment kpi-trend__segment--complete" style="height:${completeHeight}%"></span>
      </span>
      <span class="kpi-trend__label">${escapeHtml(bucket.label)}</span>
    </div>`;
  }).join('');
  return `<div class="kpi-trend" style="--kpi-trend-columns:${trend.buckets.length}" role="img" aria-label="Report runs over time">${bars}</div>`;
}

function renderComposition(counts, labels) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  if (!total) return '<p class="kpi-chart-empty">No matching activity for this view.</p>';
  const segments = Object.entries(counts).map(([key, value]) => value
    ? `<span class="kpi-composition__segment kpi-tone--${key}" style="width:${(value / total) * 100}%" aria-label="${escapeHtml(labels[key])}: ${value}"></span>`
    : '').join('');
  const legend = Object.entries(counts).map(([key, value]) => `<li><span class="kpi-legend-dot kpi-tone--${key}"></span><span>${escapeHtml(labels[key])}</span><strong>${formatNumber(value)}</strong></li>`).join('');
  return `<div class="kpi-composition" role="img" aria-label="Activity composition">${segments}</div><ul class="kpi-legend">${legend}</ul>`;
}

function renderRanking(items, valueLabel = 'runs') {
  if (!items.length) return '<p class="kpi-chart-empty">No matching activity for this view.</p>';
  const maximum = Math.max(1, ...items.map(item => item.value));
  return `<ol class="kpi-ranking">${items.map(item => `<li>
    <span class="kpi-ranking__label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
    <span class="kpi-ranking__track"><span style="width:${(item.value / maximum) * 100}%"></span></span>
    <strong>${formatNumber(item.value)} <span class="sr-only">${escapeHtml(valueLabel)}</span></strong>
  </li>`).join('')}</ol>`;
}

function renderRecentRuns(runs, now) {
  if (!runs.length) return '<p class="kpi-chart-empty">No recent activity matches these filters.</p>';
  return `<div class="kpi-recent-table-wrap"><table class="kpi-recent-table">
    <thead><tr><th>Report</th><th>Status</th><th>Staff</th><th>Started</th><th>Rows</th><th>Duration</th></tr></thead>
    <tbody>${runs.map(run => {
      const status = classifyRunStatus(run.status);
      return `<tr>
        <td>${escapeHtml(run.name || run.request?.name || 'Untitled report')}</td>
        <td><span class="kpi-status kpi-status--${status}">${escapeHtml(status)}</span></td>
        <td>${escapeHtml(run.created_by || 'Unknown')}</td>
        <td>${escapeHtml(formatDate(run.start_time, true))}</td>
        <td>${formatNumber(getRunRows(run))}</td>
        <td>${escapeHtml(formatDuration(getDurationSeconds(run, now)))}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function renderDashboard(summary, options = {}) {
  const finalized = summary.statusCounts.complete + summary.statusCounts.failed + summary.statusCounts.canceled;
  const rangeLabel = options.range === 'all' ? 'All retained activity' : `Last ${options.range} days`;
  const hydrationTotal = Object.values(summary.hydration).reduce((sum, value) => sum + value, 0);
  const coverage = summary.coverage.first
    ? `${formatDate(summary.coverage.first)}–${formatDate(summary.coverage.last)}`
    : 'No matching dates';
  return `<div class="kpi-dashboard__summary">
    <section class="kpi-dashboard__intro" aria-labelledby="kpi-dashboard-title">
      <div>
        <span class="kpi-dashboard__eyebrow">Operations overview</span>${options.isSampleData ? '<span class="kpi-dashboard__sample">Sample data</span>' : ''}
        <h3 id="kpi-dashboard-title">Library reporting at a glance</h3>
        <p>Monitor report demand, reliability, turnaround, and Hydration work from the activity retained by this Query backend.</p>
      </div>
      <div class="kpi-dashboard__freshness">
        <span>Updated ${escapeHtml(formatDate(options.refreshedAt, true))}</span>
        <strong>${escapeHtml(rangeLabel)}</strong>
        <small>${escapeHtml(coverage)}</small>
      </div>
    </section>

    <section class="kpi-cards" aria-label="Key performance indicators">
      ${kpiCard('Report runs', formatNumber(summary.totalRuns), 'Queries and Hydration runs in view')}
      ${kpiCard('Rows processed', formatNumber(summary.totalRows), 'Returned query rows and completed Hydration records')}
      ${kpiCard('Completion rate', formatPercent(summary.completionRate), finalized ? `${formatNumber(summary.statusCounts.complete)} of ${formatNumber(finalized)} finished runs completed` : 'No finished runs in view', 'success')}
      ${kpiCard('Median turnaround', formatDuration(summary.medianDurationSeconds), 'Middle duration among finished runs')}
      ${kpiCard('Active now', formatNumber(summary.activeRuns), 'Running or queued work', summary.activeRuns ? 'active' : '')}
    </section>

    <section class="kpi-dashboard__grid">
      <article class="kpi-chart-card kpi-chart-card--wide">
        <div class="kpi-chart-card__heading"><div><h4>Report activity</h4><p>Run volume by ${escapeHtml(summary.trend.unit)}; blue marks completed work.</p></div></div>
        ${renderTrendChart(summary.trend)}
      </article>
      <article class="kpi-chart-card">
        <div class="kpi-chart-card__heading"><div><h4>Run outcomes</h4><p>Share of all matching report and Hydration runs.</p></div></div>
        ${renderComposition(summary.statusCounts, { complete: 'Completed', running: 'Running', failed: 'Failed', canceled: 'Canceled' })}
      </article>
      <article class="kpi-chart-card">
        <div class="kpi-chart-card__heading"><div><h4>Most-used reports</h4><p>Top report names by number of runs.</p></div></div>
        ${renderRanking(summary.topReports)}
      </article>
      <article class="kpi-chart-card">
        <div class="kpi-chart-card__heading"><div><h4>Staff activity</h4><p>Runs started by each visible staff account.</p></div></div>
        ${renderRanking(summary.staffActivity)}
      </article>
      <article class="kpi-chart-card">
        <div class="kpi-chart-card__heading"><div><h4>Hydration outcomes</h4><p>${hydrationTotal ? `${formatNumber(hydrationTotal)} saved record decisions.` : 'Available when saved Hydration runs include outcome counts.'}</p></div></div>
        ${renderComposition(summary.hydration, { resolved: 'Resolved', review: 'Needs review', not_found: 'Not found', failed: 'Failed' })}
      </article>
      <article class="kpi-chart-card kpi-chart-card--full">
        <div class="kpi-chart-card__heading"><div><h4>Recent activity</h4><p>Exact runs behind the overview, newest first.</p></div></div>
        ${renderRecentRuns(summary.recentRuns, options.now)}
      </article>
    </section>
  </div>`;
}

export { renderDashboard };
