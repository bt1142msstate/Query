const FORM_MODE_CARD_SELECTORS = Object.freeze({
  addFieldBtn: '#form-mode-add-field',
  cleanCopyBtn: '#form-mode-copy-clean',
  copyBtn: '#form-mode-copy',
  fieldsWrap: '#form-mode-fields',
  resetBtn: '#form-mode-reset',
  resetMenu: '#form-mode-reset-options',
  resetMenuShell: '#form-mode-reset-menu',
  resetOriginalBtn: '#form-mode-reset-original',
  resetSharedBtn: '#form-mode-reset-shared',
  runBtn: '#form-mode-run',
  shareMenu: '#form-mode-share-options',
  shareMenuShell: '#form-mode-share-menu',
  shareResultsBtn: '#form-mode-share-results',
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
        <div id="form-mode-reset-menu" class="form-mode-reset-menu">
          <button type="button"
                  id="form-mode-reset"
                  class="form-mode-btn form-mode-reset-trigger"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-controls="form-mode-reset-options"
                  data-tooltip="Choose which saved form state to restore.">
            Reset
          </button>
          <div id="form-mode-reset-options"
               class="form-mode-reset-options hidden"
               role="menu"
               aria-labelledby="form-mode-reset">
            <button type="button" id="form-mode-reset-original" class="form-mode-reset-option" role="menuitem">
              <span>Original form</span>
              <small>Restore the form as it first opened, including its results when available.</small>
            </button>
            <button type="button" id="form-mode-reset-shared" class="form-mode-reset-option" role="menuitem">
              <span>Last shared link</span>
              <small>Restore the last link you copied, including shared results when that link had results.</small>
            </button>
          </div>
        </div>
        <div id="form-mode-share-menu" class="form-mode-share-menu">
          <button type="button"
                  id="form-mode-copy"
                  class="form-mode-btn form-mode-share-trigger"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-controls="form-mode-share-options"
                  data-tooltip="Choose whether to share the current results or the form only.">
            Share
          </button>
          <div id="form-mode-share-options"
               class="form-mode-share-options hidden"
               role="menu"
               aria-labelledby="form-mode-copy">
            <button type="button" id="form-mode-share-results" class="form-mode-share-option" role="menuitem">
              <span>Results link</span>
              <small>Open this form with the current result set and table view.</small>
            </button>
            <button type="button" id="form-mode-copy-clean" class="form-mode-share-option" role="menuitem">
              <span>Form link</span>
              <small>Open an editable form without loading the current results.</small>
            </button>
          </div>
        </div>
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
    cleanCopyBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.cleanCopyBtn),
    copyBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.copyBtn),
    fieldsWrap: card.querySelector(FORM_MODE_CARD_SELECTORS.fieldsWrap),
    host,
    resetBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetBtn),
    resetMenu: card.querySelector(FORM_MODE_CARD_SELECTORS.resetMenu),
    resetMenuShell: card.querySelector(FORM_MODE_CARD_SELECTORS.resetMenuShell),
    resetOriginalBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetOriginalBtn),
    resetSharedBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetSharedBtn),
    runBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.runBtn),
    shareMenu: card.querySelector(FORM_MODE_CARD_SELECTORS.shareMenu),
    shareMenuShell: card.querySelector(FORM_MODE_CARD_SELECTORS.shareMenuShell),
    shareResultsBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.shareResultsBtn),
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
