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
    clipboardUtils,
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

  state.resetOriginalBtn.addEventListener('click', () => {
    resetFormToBaseline('original');
  });

  state.resetSharedBtn.addEventListener('click', () => {
    if (!state.sharedBaselineSpec) {
      showToastMessage('Share this form first to create a shared baseline.', 'warning');
      return;
    }
    resetFormToBaseline('shared');
  });

  state.copyBtn.addEventListener('click', async () => {
    const saved = saveCurrentFormAsSharedBaseline();
    if (!saved) {
      showToastMessage('No form link is available to share.', 'warning');
      return;
    }

    await clipboardUtils.copyFromSource(() => buildCurrentShareUrl(), {
      successMessage: 'Shared link copied. Reset to Last Shared now returns to this form version.',
      errorMessage: 'Failed to copy form link.',
      emptyMessage: 'No form link is available to share.'
    });
  });

  mountedCard.cleanCopyBtn?.addEventListener('click', async () => {
    const saved = saveCurrentFormAsSharedBaseline();
    if (!saved) {
      showToastMessage('No form link is available to share.', 'warning');
      return;
    }

    await clipboardUtils.copyFromSource(() => buildCurrentShareUrl({ includeResult: false, limited: false }), {
      successMessage: 'Editable form link copied.',
      errorMessage: 'Failed to copy form link.',
      emptyMessage: 'No form link is available to share.'
    });
  });

  syncShareUi();
  return mountedCard;
}

export { buildInteractiveFormModeCard };
