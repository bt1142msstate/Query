import { ClipboardUtils } from '../../core/clipboard.js';

function buildInteractiveFormModeCard(options) {
  const {
    document,
    state,
    fieldDefs,
    mountFormModeCard,
    createFormModeEmptyState,
    getVisibleFormInputs,
    normalizeOperatorForField,
    createFormControl,
    resolveFormInputInitialValues,
    getInputParamKeys,
    splitListValues,
    createFormFieldRow,
    scheduleApply,
    removeSpecInputByKey,
    rebuildFormCardFromSpec,
    captureCurrentControlDefaults,
    openFieldPicker,
    resetFormToBaseline,
    saveCurrentFormAsSharedBaseline,
    buildCurrentShareUrl,
    syncShareUi,
    showToastMessage,
    clipboardUtils = ClipboardUtils,
    cleanupControls
  } = options;

  if (typeof cleanupControls === 'function') {
    cleanupControls();
  }

  const mountedCard = mountFormModeCard(document);
  if (!mountedCard) return null;

  state.formHost = mountedCard.host;
  state.formCard = mountedCard.card;
  state.validationEl = mountedCard.validationEl;
  state.runBtn = mountedCard.runBtn;
  state.copyBtn = mountedCard.copyBtn;
  state.shareMenu = mountedCard.shareMenu;
  state.shareMenuShell = mountedCard.shareMenuShell;
  state.shareResultsBtn = mountedCard.shareResultsBtn;
  state.resetBtn = mountedCard.resetBtn;
  state.resetMenu = mountedCard.resetMenu;
  state.resetMenuShell = mountedCard.resetMenuShell;
  state.resetOriginalBtn = mountedCard.resetOriginalBtn;
  state.resetSharedBtn = mountedCard.resetSharedBtn;

  const fieldsWrap = mountedCard.fieldsWrap;
  const visibleInputs = getVisibleFormInputs(state.spec.inputs);

  if (visibleInputs.length === 0) {
    fieldsWrap.appendChild(createFormModeEmptyState(document));
  }

  visibleInputs.forEach(inputSpec => {
    const fieldDef = fieldDefs ? fieldDefs.get(inputSpec.field) : null;
    inputSpec.operator = normalizeOperatorForField(fieldDef, inputSpec.operator);
    const control = createFormControl(
      fieldDef,
      inputSpec,
      resolveFormInputInitialValues(inputSpec, state.searchParams, getInputParamKeys, splitListValues),
      inputSpec.operator,
      normalizeOperatorForField
    );
    control.addEventListener('change', scheduleApply);
    control.addEventListener('input', scheduleApply);
    state.controls.set(inputSpec.key, control);
    fieldsWrap.appendChild(createFormFieldRow({
      inputSpec,
      fieldDef,
      control,
      normalizeOperatorForField,
      removeSpecInputByKey,
      rebuildFormCardFromSpec,
      captureCurrentControlDefaults
    }));
  });

  state.runBtn.addEventListener('click', () => {
    const error = options.syncValidationUi();
    if (error) {
      showToastMessage(error, 'warning');
      return;
    }
    options.runQuery();
  });

  mountedCard.addFieldBtn.addEventListener('click', () => {
    openFieldPicker().catch(error => {
      console.error('Failed to open field picker:', error);
      showToastMessage('Failed to open the field picker.', 'error');
    });
  });

  function hideOpenTooltips() {
    const windowRef = document?.defaultView;
    if (!windowRef || typeof windowRef.dispatchEvent !== 'function') {
      return;
    }
    windowRef.dispatchEvent(new windowRef.CustomEvent('query-app:hide-tooltips'));
  }

  function setResetMenuOpen(open) {
    if (!state.resetBtn || !state.resetMenu) {
      return;
    }

    state.resetMenu.classList.toggle('hidden', !open);
    state.resetBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    hideOpenTooltips();
  }

  state.resetBtn?.addEventListener('click', event => {
    event.stopPropagation();
    const isOpen = state.resetBtn.getAttribute('aria-expanded') === 'true';
    setResetMenuOpen(!isOpen);
  });

  state.resetMenuShell?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setResetMenuOpen(false);
      state.resetBtn?.focus();
    }
  });

  state.resetMenuShell?.addEventListener('focusout', event => {
    if (!event.relatedTarget || !state.resetMenuShell?.contains(event.relatedTarget)) {
      setResetMenuOpen(false);
    }
  });

  state.resetOriginalBtn.addEventListener('click', () => {
    setResetMenuOpen(false);
    resetFormToBaseline('original');
  });

  state.resetSharedBtn.addEventListener('click', () => {
    if (!state.sharedBaselineSpec) {
      showToastMessage('Share this form first to create a shared baseline.', 'warning');
      return;
    }
    setResetMenuOpen(false);
    resetFormToBaseline('shared');
  });

  function setShareMenuOpen(open) {
    if (!state.copyBtn || !state.shareMenu) {
      return;
    }

    state.shareMenu.classList.toggle('hidden', !open);
    state.copyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    hideOpenTooltips();
  }

  state.copyBtn.addEventListener('click', event => {
    event.stopPropagation();
    const isOpen = state.copyBtn.getAttribute('aria-expanded') === 'true';
    setShareMenuOpen(!isOpen);
  });

  state.shareMenuShell?.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setShareMenuOpen(false);
      state.copyBtn?.focus();
    }
  });

  state.shareMenuShell?.addEventListener('focusout', event => {
    if (!event.relatedTarget || !state.shareMenuShell?.contains(event.relatedTarget)) {
      setShareMenuOpen(false);
    }
  });

  mountedCard.shareResultsBtn?.addEventListener('click', async () => {
    const saved = saveCurrentFormAsSharedBaseline({ includeResult: true });
    if (!saved) {
      showToastMessage('No form link is available to share.', 'warning');
      return;
    }
    setShareMenuOpen(false);

    await clipboardUtils.copyFromSource(() => buildCurrentShareUrl(), {
      successMessage: 'Results link copied. Reset can return to this shared version.',
      errorMessage: 'Failed to copy form link.',
      emptyMessage: 'No form link is available to share.'
    });
  });

  mountedCard.cleanCopyBtn?.addEventListener('click', async () => {
    const saved = saveCurrentFormAsSharedBaseline({ includeResult: false });
    if (!saved) {
      showToastMessage('No form link is available to share.', 'warning');
      return;
    }
    setShareMenuOpen(false);

    await clipboardUtils.copyFromSource(() => buildCurrentShareUrl({ includeResult: false, limited: false }), {
      successMessage: 'Form link copied.',
      errorMessage: 'Failed to copy form link.',
      emptyMessage: 'No form link is available to share.'
    });
  });

  syncShareUi();
  return mountedCard;
}

export { buildInteractiveFormModeCard };
