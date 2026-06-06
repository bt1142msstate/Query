function resolveCurrentShareResultQueryId(queryStateReaders, options = {}) {
  if (options.includeResult === false) {
    return '';
  }

  const lifecycleState = queryStateReaders?.getLifecycleState?.();
  if (!lifecycleState?.hasLoadedResultSet) {
    return '';
  }

  return String(options.resultQueryId || lifecycleState.currentQueryId || '').trim();
}

function syncFormModeShareUi({
  getCurrentShareResultQueryId,
  isShareableFormSpec,
  state
}) {
  if (!state.copyBtn) {
    return;
  }

  const isShareable = isShareableFormSpec(state.spec);
  const cleanCopyBtn = state.formCard?.querySelector('#form-mode-copy-clean');
  const resultQueryId = getCurrentShareResultQueryId();
  state.copyBtn.disabled = !isShareable;
  state.copyBtn.textContent = resultQueryId ? 'Share Results' : 'Share';
  state.copyBtn.setAttribute('data-tooltip', isShareable
    ? (resultQueryId ? 'Copy a link that opens these results.' : 'Copy a shareable form link and save this as the reset baseline.')
    : 'Add a displayed field or filter control before sharing this form.');
  state.copyBtn.setAttribute('aria-label', isShareable ? 'Share form link' : 'Share unavailable until fields are added');

  if (cleanCopyBtn) {
    cleanCopyBtn.disabled = !isShareable;
    cleanCopyBtn.setAttribute('data-tooltip', isShareable
      ? 'Copy a clean editable form link without results.'
      : 'Add a displayed field or filter control before sharing this form.');
  }

  if (state.resetSharedBtn) {
    const hasSharedBaseline = Boolean(state.sharedBaselineSpec);
    state.resetSharedBtn.disabled = !hasSharedBaseline;
    state.resetSharedBtn.setAttribute('data-tooltip', hasSharedBaseline
      ? 'Restore the last version you shared.'
      : 'Share this form first to create a shared baseline.');
  }
}

export { resolveCurrentShareResultQueryId, syncFormModeShareUi };
