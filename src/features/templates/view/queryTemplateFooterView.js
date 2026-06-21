function buildTemplateWorkbenchStatus(state = {}, now = Date.now()) {
  if (state.loading) {
    return 'Loading templates...';
  }

  if (state.saving) {
    return 'Saving template changes...';
  }

  if (!state.lastLoadedAt) {
    return state.loaded ? 'Last updated: Just now' : 'Last updated: Not loaded';
  }

  const elapsedMs = Math.max(0, now - state.lastLoadedAt);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) {
    return 'Last updated: Just now';
  }

  if (elapsedMinutes < 60) {
    return `Last updated: ${elapsedMinutes}m ago`;
  }

  return `Last updated: ${new Date(state.lastLoadedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}

function renderTemplateWorkbenchFooter({ elements, state, now } = {}) {
  if (!elements?.updatedStatus) {
    return;
  }

  elements.updatedStatus.textContent = buildTemplateWorkbenchStatus(state, now);
}

export {
  buildTemplateWorkbenchStatus,
  renderTemplateWorkbenchFooter
};
