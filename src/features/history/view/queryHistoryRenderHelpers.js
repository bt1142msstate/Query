function captureHistoryViewState(dom) {
  const panelContainer = dom?.queriesContainer;
  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');

  return {
    panelScrollTop: panelContainer?.scrollTop || 0,
    panelScrollLeft: panelContainer?.scrollLeft || 0,
    monitorScrollTop: monitorShell?.scrollTop || 0,
    monitorScrollLeft: monitorShell?.scrollLeft || 0
  };
}

function restoreHistoryViewState(dom, viewState) {
  if (!viewState) return;

  const panelContainer = dom?.queriesContainer;
  if (panelContainer) {
    panelContainer.scrollTop = viewState.panelScrollTop;
    panelContainer.scrollLeft = viewState.panelScrollLeft;
  }

  const monitorShell = panelContainer?.querySelector('.history-monitor .history-table-shell');
  if (monitorShell) {
    monitorShell.scrollTop = viewState.monitorScrollTop;
    monitorShell.scrollLeft = viewState.monitorScrollLeft;
  }
}

function updateHistoryPollingMeta(dom, { isPollingActive, refreshedAt }) {
  const pollingValue = dom?.queriesList?.querySelector('.history-polling-value');
  const pollingDetail = dom?.queriesList?.querySelector('.history-polling-detail');
  if (pollingValue) {
    pollingValue.textContent = isPollingActive ? 'Auto refresh on' : 'Auto refresh paused';
    pollingValue.classList.toggle('active', !!isPollingActive);
    pollingValue.classList.toggle('idle', !isPollingActive);
  }
  if (pollingDetail) {
    pollingDetail.textContent = `Last refresh ${refreshedAt}`;
  }
}

function didProgressChange(oldProgress, newProgress) {
  return JSON.stringify(oldProgress || null) !== JSON.stringify(newProgress || null);
}

function didErrorDetailsChange(oldDetails, newDetails) {
  return JSON.stringify(oldDetails || null) !== JSON.stringify(newDetails || null);
}

export {
  captureHistoryViewState,
  didErrorDetailsChange,
  didProgressChange,
  restoreHistoryViewState,
  updateHistoryPollingMeta
};
