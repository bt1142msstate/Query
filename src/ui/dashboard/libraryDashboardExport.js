function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function seriesRows(section, series, metrics) {
  return (Array.isArray(series) ? series : []).flatMap(entry => metrics
    .filter(metric => Object.prototype.hasOwnProperty.call(entry || {}, metric))
    .map(metric => [section, entry.label || entry.code || entry.month || 'Unknown', metric, entry[metric]]));
}

function buildLibraryDashboardExportRows(data, view = 'overview') {
  const rows = [['Section', 'Label', 'Metric', 'Value']];
  rows.push(
    ['Scope', 'Library', 'value', data.scope?.library_label || data.scope?.library || 'all'],
    ['Scope', 'Item type', 'value', data.scope?.item_type_label || data.scope?.item_type || 'all'],
    ['Scope', 'Reporting period', 'value', data.circulation?.period_label || `${data.scope?.active_window_days || 365} days`],
    ['Freshness', 'Generated', 'timestamp', data.generatedAt || '']
  );
  const groups = view === 'collection' ? ['collection', 'circulation']
    : view === 'patrons' ? ['patrons'] : ['circulation', 'collection', 'patrons'];
  groups.forEach(group => Object.entries(data[group] || {}).forEach(([metric, value]) => {
    rows.push([group, group, metric, value]);
  }));
  const series = view === 'collection'
    ? [['Use bands', data.useBands, ['items']], ['Age bands', data.ageBands, ['items']]]
    : view === 'patrons'
      ? [['Home library', data.patronLibraryBreakdown, ['patrons']], ['Profile', data.patronProfileBreakdown, ['patrons']], ['Age groups', data.patronAgeBands, ['patrons']], ['ZIP3 geography', data.patronGeoBreakdown, ['patrons']], ['City geography', data.patronCityBreakdown, ['patrons']], ['State geography', data.patronStateBreakdown, ['patrons']]]
      : [['Circulation trend', data.circulationTrend, ['checkouts', 'renewals']], ['Library demand', data.libraryBreakdown, ['items', 'checkouts', 'renewals', 'patrons']], ['Item type demand', data.itemTypeBreakdown, ['items', 'checkouts', 'renewals']], ['Patron ZIP3', data.patronGeoBreakdown, ['patrons']], ['Patron cities', data.patronCityBreakdown, ['patrons']], ['Patron states', data.patronStateBreakdown, ['patrons']]];
  series.forEach(([section, values, metrics]) => rows.push(...seriesRows(section, values, metrics)));
  (data.sources || []).forEach(source => rows.push(['Source', source.label || source.name || 'Source', 'detail', source.detail || '']));
  (data.notes || []).forEach((note, index) => rows.push(['Note', `Note ${index + 1}`, 'detail', note]));
  return rows;
}

function downloadLibraryDashboardCsv(data, view = 'overview') {
  const rows = buildLibraryDashboardExportRows(data, view);
  const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const scope = String(data.scope?.library || 'all').replace(/[^A-Za-z0-9_-]+/g, '-');
  link.href = url;
  link.download = `MLP-KPI-${view}-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return link.download;
}

export { buildLibraryDashboardExportRows, downloadLibraryDashboardCsv };
