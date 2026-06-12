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
  state.copyBtn.textContent = 'Share';
  state.copyBtn.setAttribute('data-tooltip', isShareable
    ? 'Choose whether to share results or the form only.'
    : 'Add a displayed field or filter control before sharing this form.');
  state.copyBtn.setAttribute('aria-label', isShareable ? 'Open share options' : 'Share unavailable until fields are added');

  if (state.shareResultsBtn) {
    state.shareResultsBtn.disabled = !isShareable || !resultQueryId;
    state.shareResultsBtn.setAttribute('data-tooltip', resultQueryId
      ? 'Copy a link that opens these results.'
      : 'Run or load results before sharing a results link.');
  }

  if (cleanCopyBtn) {
    cleanCopyBtn.disabled = !isShareable;
    cleanCopyBtn.setAttribute('data-tooltip', isShareable
      ? 'Copy an editable form link without results.'
      : 'Add a displayed field or filter control before sharing this form.');
  }

  const hasSharedBaseline = Boolean(state.sharedBaselineSpec);

  if (state.resetBtn) {
    state.resetBtn.disabled = !isShareable;
    state.resetBtn.setAttribute('data-tooltip', isShareable
      ? 'Choose the original form or your last shared link.'
      : 'Add a displayed field or filter control before reset options are available.');
  }

  if (state.resetOriginalBtn) {
    state.resetOriginalBtn.disabled = !isShareable;
    state.resetOriginalBtn.setAttribute('data-tooltip', isShareable
      ? 'Restore the form as it first opened, including results when available.'
      : 'Add a displayed field or filter control before reset options are available.');
  }

  if (state.resetSharedBtn) {
    state.resetSharedBtn.disabled = !hasSharedBaseline;
    state.resetSharedBtn.setAttribute('data-tooltip', hasSharedBaseline
      ? 'Restore the last link you copied, including results when available.'
      : 'Share this form first to create a shared reset point.');
  }
}

export { resolveCurrentShareResultQueryId, syncFormModeShareUi };
