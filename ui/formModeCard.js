const FORM_MODE_CARD_SELECTORS = Object.freeze({
  addFieldBtn: '#form-mode-add-field',
  copyBtn: '#form-mode-copy',
  fieldsWrap: '#form-mode-fields',
  resetOriginalBtn: '#form-mode-reset-original',
  resetSharedBtn: '#form-mode-reset-shared',
  runBtn: '#form-mode-run',
  validationEl: '#form-mode-validation'
});

function getFormModeCardHtml() {
  return `
    <div class="form-mode-header">
      <div>
        <h2 class="form-mode-title" data-form-mode-title></h2>
        <p class="form-mode-description hidden" data-form-mode-description></p>
      </div>
      <div class="form-mode-actions">
        <button type="button" id="form-mode-add-field" class="form-mode-btn form-mode-btn-secondary">+ Add Field</button>
        <button type="button" id="form-mode-run" class="form-mode-btn form-mode-btn-primary">Run Form</button>
        <button type="button" id="form-mode-reset-original" class="form-mode-btn" data-tooltip="Restore the original form version.">Reset to Original</button>
        <button type="button" id="form-mode-reset-shared" class="form-mode-btn" data-tooltip="Share this form first to create a shared baseline.">Reset to Last Shared</button>
        <button type="button" id="form-mode-copy" class="form-mode-btn">Share</button>
      </div>
    </div>
    <div class="form-mode-body">
      <div id="form-mode-fields" class="form-mode-fields"></div>
      <p id="form-mode-validation" class="form-mode-validation hidden"></p>
    </div>
  `;
}

function getFormModeEmptyStateHtml() {
  return `
    <strong>No filters yet.</strong>
    <p>This form does not have any filter controls yet. Use "Add Filter" to add one.</p>
  `;
}

function getVisibleFormInputs(inputs = []) {
  return (Array.isArray(inputs) ? inputs : []).filter(inputSpec => !inputSpec.hidden);
}

function findFormModeStage(documentRef) {
  return documentRef.getElementById('bubble-container')?.closest('.flex.items-start.justify-center') || null;
}

function ensureFormModeHost(documentRef) {
  const bubbleStage = findFormModeStage(documentRef);
  if (!bubbleStage) {
    return null;
  }

  let host = documentRef.getElementById('form-mode-host');
  if (!host) {
    host = documentRef.createElement('div');
    host.id = 'form-mode-host';
    host.className = 'form-mode-host hidden';
    bubbleStage.insertBefore(host, bubbleStage.firstChild);
  }

  return host;
}

function createFormModeCard(documentRef) {
  const card = documentRef.createElement('section');
  card.id = 'form-mode-card';
  card.className = 'form-mode-card';
  card.innerHTML = getFormModeCardHtml();
  return card;
}

function createFormModeEmptyState(documentRef) {
  const emptyState = documentRef.createElement('div');
  emptyState.className = 'form-mode-empty-state';
  emptyState.innerHTML = getFormModeEmptyStateHtml();
  return emptyState;
}

function mountFormModeCard(documentRef) {
  const host = ensureFormModeHost(documentRef);
  if (!host) {
    return null;
  }

  const card = createFormModeCard(documentRef);
  host.replaceChildren(card);

  return {
    addFieldBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.addFieldBtn),
    card,
    copyBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.copyBtn),
    fieldsWrap: card.querySelector(FORM_MODE_CARD_SELECTORS.fieldsWrap),
    host,
    resetOriginalBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetOriginalBtn),
    resetSharedBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetSharedBtn),
    runBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.runBtn),
    validationEl: card.querySelector(FORM_MODE_CARD_SELECTORS.validationEl)
  };
}

export {
  FORM_MODE_CARD_SELECTORS,
  createFormModeEmptyState,
  getFormModeCardHtml,
  getFormModeEmptyStateHtml,
  getVisibleFormInputs,
  mountFormModeCard
};
