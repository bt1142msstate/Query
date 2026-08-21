import { escapeHtml } from '../../core/formatting/html.js';

const numberFormatter = new Intl.NumberFormat();
const compactFormatter = new Intl.NumberFormat([], { notation: 'compact', maximumFractionDigits: 1 });
const moneyFormatter = new Intl.NumberFormat([], { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function formatNumber(value, compact = false) {
  return (compact ? compactFormatter : numberFormatter).format(Number(value || 0));
}

function formatPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '—';
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Not available';
}

function metricCard(label, value, detail, tone = '') {
  return `<article class="kpi-card ${tone ? `kpi-card--${tone}` : ''}">
    <span class="kpi-card__label">${escapeHtml(label)}</span>
    <strong class="kpi-card__value">${escapeHtml(value)}</strong>
    <span class="kpi-card__detail">${escapeHtml(detail)}</span>
  </article>`;
}

function rankedBars(items, key, emptyText = 'No data is available for this breakdown.') {
  if (!items.length) return `<p class="kpi-chart-empty">${escapeHtml(emptyText)}</p>`;
  const maximum = Math.max(1, ...items.map(item => Number(item[key] || item.value || 0)));
  return `<ol class="kpi-ranking">${items.slice(0, 10).map(item => {
    const value = Number(item[key] || item.value || 0);
    return `<li>
      <span class="kpi-ranking__label" title="${escapeHtml(item.label || item.code || 'Unknown')}">${escapeHtml(item.label || item.code || 'Unknown')}</span>
      <span class="kpi-ranking__track"><span style="width:${(value / maximum) * 100}%"></span></span>
      <strong>${formatNumber(value)}</strong>
    </li>`;
  }).join('')}</ol>`;
}

function stackedTrend(items) {
  if (!items.length) return '<p class="kpi-chart-empty">Period circulation data is not available for this scope.</p>';
  const maximum = Math.max(1, ...items.map(item => Number(item.checkouts || 0) + Number(item.renewals || 0)));
  return `<div class="kpi-circ-trend" style="--kpi-trend-columns:${items.length}" role="img" aria-label="Checkouts and renewals by reporting period">${items.map(item => {
    const checkoutHeight = (Number(item.checkouts || 0) / maximum) * 100;
    const renewalHeight = (Number(item.renewals || 0) / maximum) * 100;
    return `<div class="kpi-circ-trend__column" aria-label="${escapeHtml(item.label)}: ${formatNumber(item.checkouts)} checkouts and ${formatNumber(item.renewals)} renewals">
      <span class="kpi-circ-trend__total">${formatNumber(Number(item.checkouts || 0) + Number(item.renewals || 0), true)}</span>
      <span class="kpi-circ-trend__bar" aria-hidden="true"><i class="kpi-circ-trend__renewals" style="height:${renewalHeight}%"></i><i class="kpi-circ-trend__checkouts" style="height:${checkoutHeight}%"></i></span>
      <span class="kpi-circ-trend__label">${escapeHtml(item.label)}</span>
    </div>`;
  }).join('')}</div><ul class="kpi-inline-legend"><li><span class="kpi-legend-dot kpi-legend-dot--checkouts"></span>Checkouts</li><li><span class="kpi-legend-dot kpi-legend-dot--renewals"></span>Renewals</li></ul>`;
}

function opportunityTable(items) {
  if (!items.length) return '<p class="kpi-chart-empty">No collection opportunities are available for this scope.</p>';
  return `<div class="kpi-recent-table-wrap"><table class="kpi-recent-table kpi-opportunity-table"><thead><tr><th>Opportunity</th><th>Items</th><th>Why it matters</th><th></th></tr></thead><tbody>${items.map(item => `<tr>
    <td><strong>${escapeHtml(item.label || 'Review items')}</strong></td>
    <td>${formatNumber(item.count)}</td>
    <td>${escapeHtml(item.detail || '')}</td>
    <td>${item.query && Number(item.count) > 0 ? `<button type="button" class="kpi-drilldown" data-kpi-query="${escapeHtml(JSON.stringify(item.query))}">Open report</button>` : ''}</td>
  </tr>`).join('')}</tbody></table></div>`;
}

function dashboardIntro(data, title, description) {
  const libraryCode = data.scope?.library || 'all';
  const itemTypeCode = data.scope?.item_type || 'all';
  const scope = data.scope?.library_label || (libraryCode === 'all' ? 'All MLP libraries' : libraryCode);
  const itemType = data.scope?.item_type_label || (itemTypeCode === 'all' ? 'All item types' : itemTypeCode);
  const freshnessLabel = data.freshness?.stale ? 'Snapshot is older than expected' : 'Verified aggregate snapshot';
  return `<section class="kpi-dashboard__intro" aria-labelledby="kpi-dashboard-title"><div>
    <span class="kpi-dashboard__eyebrow">Library intelligence</span>${data.isSampleData ? '<span class="kpi-dashboard__sample">Sample data</span>' : ''}
    <h3 id="kpi-dashboard-title">${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>
  </div><div class="kpi-dashboard__freshness${data.freshness?.stale ? ' kpi-dashboard__freshness--stale' : ''}"><span>Updated ${escapeHtml(formatDate(data.generatedAt))}</span><strong>${escapeHtml(scope)}</strong><small>${escapeHtml(itemType)}</small><small>${escapeHtml(freshnessLabel)}</small></div></section>`;
}

function sourceNotes(data) {
  if (!data.sources.length && !data.notes.length) return '';
  return `<details class="kpi-methodology"><summary>Definitions, sources, and privacy</summary><div>${data.sources.map(source => `<p><strong>${escapeHtml(source.label || source.name || 'Source')}:</strong> ${escapeHtml(source.detail || '')}</p>`).join('')}${data.notes.map(note => `<p>${escapeHtml(note)}</p>`).join('')}${data.privacy?.suppression_threshold ? `<p>Patron groups smaller than ${formatNumber(data.privacy.suppression_threshold)} are suppressed.</p>` : ''}</div></details>`;
}

function renderOverview(data) {
  const circ = data.circulation;
  const collection = data.collection;
  const patrons = data.patrons;
  const hasCirculation = data.availability?.circulation;
  const hasCollection = data.availability?.collection;
  const hasPatrons = data.availability?.patrons;
  const circulationUnavailable = '<p class="kpi-chart-empty">Period circulation data is not available for this scope.</p>';
  return `${dashboardIntro(data, 'What is being used—and where to act', 'A combined view of circulation demand, collection performance, and community reach. Every number keeps its source and time basis visible.')}
    <section class="kpi-cards kpi-cards--six" aria-label="Key library indicators">
      ${metricCard('Checkouts', hasCirculation ? formatNumber(circ.checkouts) : '—', circ.period_label || (hasCirculation ? 'Selected reporting period' : 'Period transaction feed not available'), hasCirculation ? 'success' : '')}
      ${metricCard('Renewals', hasCirculation ? formatNumber(circ.renewals) : '—', hasCirculation ? `${formatPercent(circ.renewal_share)} of circulation activity` : 'Period transaction feed not available')}
      ${metricCard('Current items', hasCollection ? formatNumber(collection.items) : '—', hasCollection ? (collection.titles ? `${formatNumber(collection.titles)} titles represented` : 'Actual current item records') : 'Current item snapshot not available')}
      ${metricCard('Used recently', hasCollection ? formatPercent(collection.recent_use_rate) : '—', hasCollection ? `${formatNumber(collection.used_recently)} items used in the selected window` : 'Current item snapshot not available', hasCollection ? 'success' : '')}
      ${metricCard('Active patrons', hasPatrons ? formatNumber(patrons.active) : '—', hasPatrons ? `${formatPercent(patrons.active_rate)} of current patrons` : 'Patron aggregate not available')}
      ${metricCard('New patrons', hasPatrons ? formatNumber(patrons.new) : '—', hasPatrons ? (patrons.new_period_label || 'Created in the selected period') : 'Patron aggregate not available')}
    </section>
    <section class="kpi-dashboard__grid">
      <article class="kpi-chart-card kpi-chart-card--wide"><div class="kpi-chart-card__heading"><div><h4>Circulation trend</h4><p>Transactions by period; checkout and renewal definitions match the Analytics circulation contract.</p></div></div>${stackedTrend(data.circulationTrend)}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Demand by library</h4><p>Checkouts for the highest-use libraries in scope.</p></div></div>${hasCirculation ? rankedBars(data.libraryBreakdown, 'checkouts') : circulationUnavailable}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Demand by item type</h4><p>Checkout volume reveals which formats patrons are choosing.</p></div></div>${hasCirculation ? rankedBars(data.itemTypeBreakdown, 'checkouts') : circulationUnavailable}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Patrons by home library</h4><p>Aggregated patron reach; small groups are suppressed.</p></div></div>${rankedBars(data.patronLibraryBreakdown, 'patrons')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Collection use</h4><p>Items grouped by recorded use, including never-used and high-use material.</p></div></div>${rankedBars(data.useBands, 'items')}</article>
      <article class="kpi-chart-card kpi-chart-card--full"><div class="kpi-chart-card__heading"><div><h4>Recommended follow-up</h4><p>Actionable groups that can open as an exact Query report.</p></div></div>${opportunityTable(data.opportunities)}</article>
    </section>${sourceNotes(data)}`;
}

function renderCollection(data) {
  const collection = data.collection;
  const circ = data.circulation;
  const titleDetail = Object.prototype.hasOwnProperty.call(collection, 'titles')
    ? `${formatNumber(collection.titles)} distinct titles`
    : 'Distinct-title aggregate not available';
  return `${dashboardIntro(data, 'Collection performance', 'Actual current holdings, lifetime item use, recent use, demand, age, and collection-development opportunities—not item-creation transactions mislabeled as holdings.')}
    <section class="kpi-cards kpi-cards--six" aria-label="Collection indicators">
      ${metricCard('Items', formatNumber(collection.items), titleDetail)}
      ${metricCard('Lifetime checkouts', formatNumber(collection.lifetime_checkouts), `${Number(collection.checkouts_per_item || 0).toFixed(1)} per current item`, 'success')}
      ${metricCard('Lifetime renewals', formatNumber(collection.lifetime_renewals), 'Stored on current item records')}
      ${metricCard('In-house uses', formatNumber(collection.in_house_uses), 'Recorded use without checkout')}
      ${metricCard('Never used', formatNumber(collection.never_used), `${formatPercent(collection.never_used_rate)} of current items`, collection.never_used_rate > 0.35 ? 'active' : '')}
      ${metricCard('Collection value', formatMoney(collection.total_value), `${formatPercent(collection.price_coverage)} of items have a usable price`)}
    </section>
    <section class="kpi-dashboard__grid">
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Use distribution</h4><p>Lifetime checkout bands across current items.</p></div></div>${rankedBars(data.useBands, 'items')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Collection age</h4><p>Current items by creation-date band.</p></div></div>${rankedBars(data.ageBands, 'items')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Hold pressure</h4><p>Demand indicators for copies and titles currently in scope.</p></div></div>${metricCard('Open holds', formatNumber(circ.holds), `${Number(circ.holds_per_100_items || 0).toFixed(1)} per 100 items`)}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Recently used</h4><p>Items with a recorded last-use date inside the selected activity window.</p></div></div>${metricCard('Recent-use rate', formatPercent(collection.recent_use_rate), `${formatNumber(collection.used_recently)} of ${formatNumber(collection.items)} items`)}</article>
      <article class="kpi-chart-card kpi-chart-card--full"><div class="kpi-chart-card__heading"><div><h4>Collection-development queue</h4><p>Open the underlying records to review, sort, or export them.</p></div></div>${opportunityTable(data.opportunities)}</article>
    </section>${sourceNotes(data)}`;
}

function renderPatrons(data) {
  const patrons = data.patrons;
  const available = data.availability?.patrons;
  const patronData = { ...data, scope: { ...data.scope, item_type_label: 'Item type does not apply to patrons' } };
  return `${dashboardIntro(patronData, 'Patron reach and engagement', 'Understand who the libraries serve, where registered users are based, and how recently they have interacted—using aggregated, privacy-protected measures.')}
    <section class="kpi-cards kpi-cards--six" aria-label="Patron indicators">
      ${metricCard('Current patrons', available ? formatNumber(patrons.total) : '—', available ? 'User records in the selected library scope' : 'Patron aggregate not available')}
      ${metricCard('Active patrons', available ? formatNumber(patrons.active) : '—', available ? `${formatPercent(patrons.active_rate)} active in the selected window` : 'Patron aggregate not available', available ? 'success' : '')}
      ${metricCard('New registrations', available ? formatNumber(patrons.new) : '—', available ? (patrons.new_period_label || 'Selected period') : 'Patron aggregate not available')}
      ${metricCard('Patrons with loans', available ? formatNumber(patrons.with_charges) : '—', available ? 'Currently have one or more charged items' : 'Patron aggregate not available')}
      ${metricCard('Patrons with holds', available ? formatNumber(patrons.with_holds) : '—', available ? 'Currently have one or more holds' : 'Patron aggregate not available')}
      ${metricCard('Expiring soon', available ? formatNumber(patrons.expiring_soon) : '—', available ? 'Privileges expire in the next 90 days' : 'Patron aggregate not available')}
    </section>
    <section class="kpi-dashboard__grid">
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Home library</h4><p>Registered patrons by assigned library.</p></div></div>${rankedBars(data.patronLibraryBreakdown, 'patrons')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>User profile</h4><p>Aggregated patron profile distribution.</p></div></div>${rankedBars(data.patronProfileBreakdown, 'patrons')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Age groups</h4><p>Derived from usable birth dates; unknown values remain visible.</p></div></div>${rankedBars(data.patronAgeBands, 'patrons')}</article>
      <article class="kpi-chart-card"><div class="kpi-chart-card__heading"><div><h4>Geographic reach</h4><p>Top ZIP or service-area groups after privacy suppression.</p></div></div>${rankedBars(data.patronGeoBreakdown, 'patrons')}</article>
    </section>${sourceNotes(data)}`;
}

function renderLibraryDashboard(data, view = 'overview') {
  if (view === 'collection') return `<div class="kpi-dashboard__summary">${renderCollection(data)}</div>`;
  if (view === 'patrons') return `<div class="kpi-dashboard__summary">${renderPatrons(data)}</div>`;
  return `<div class="kpi-dashboard__summary">${renderOverview(data)}</div>`;
}

export { renderLibraryDashboard };
