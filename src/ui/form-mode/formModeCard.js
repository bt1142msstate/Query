const FORM_MODE_CARD_SELECTORS = Object.freeze({
  addFieldBtn: '#form-mode-add-field',
  cleanCopyBtn: '#form-mode-copy-clean',
  copyBtn: '#form-mode-copy',
  fieldsWrap: '#form-mode-fields',
  focusFormBtn: '#form-mode-focus-form',
  nameInput: '[data-form-mode-name-input]',
  resetBtn: '#form-mode-reset',
  resetMenu: '#form-mode-reset-options',
  resetMenuShell: '#form-mode-reset-menu',
  resetOriginalBtn: '#form-mode-reset-original',
  resetSharedBtn: '#form-mode-reset-shared',
  runBtn: '#form-mode-run',
  shareMenu: '#form-mode-share-options',
  shareMenuShell: '#form-mode-share-menu',
  shareResultsBtn: '#form-mode-share-results',
  showTableBtn: '#form-mode-show-table',
  validationEl: '#form-mode-validation'
});

function getFormModeCardHtml() {
  return `
    <div class="form-mode-header">
      <div class="form-mode-header-copy">
        <h2 class="sr-only" data-form-mode-title-heading></h2>
        <label class="form-mode-name-shell">
          <span class="sr-only">Form name</span>
          <input type="text"
                 class="form-mode-title-input"
                 data-form-mode-name-input
                 aria-label="Form name"
                 placeholder="No name"
                 maxlength="120"
                 autocomplete="off"
                 spellcheck="false">
        </label>
        <p class="form-mode-description hidden" data-form-mode-description></p>
      </div>
      <div class="form-mode-header-tools">
        <div class="form-mode-workspace-toggle" role="group" aria-label="Workspace view">
          <button type="button"
                  id="form-mode-focus-form"
                  class="form-mode-workspace-option"
                  aria-pressed="false"
                  data-tooltip="Give the form the full workspace and hide the results table.">
            Form only
          </button>
          <button type="button"
                  id="form-mode-show-table"
                  class="form-mode-workspace-option"
                  aria-pressed="true"
                  data-tooltip="Show the form and results table together.">
            Form + table
          </button>
        </div>
      </div>
    </div>
    <div class="form-mode-command-bar">
      <button type="button" id="form-mode-add-field" class="form-mode-btn form-mode-btn-secondary">+ Add Field</button>
      <div class="form-mode-actions">
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

function getFormModeFixedCriteriaStateHtml(count) {
  const criteriaLabel = count === 1 ? 'criterion' : 'criteria';
  return `
    <strong>Ready to run.</strong>
    <p>This saved report uses ${count} fixed ${criteriaLabel} shown in the Filters panel. Click "Run Form" to refresh the results.</p>
  `;
}

function getVisibleFormInputs(inputs = []) {
  return (Array.isArray(inputs) ? inputs : []).filter(inputSpec => !inputSpec.hidden);
}

function ensureFormModeHost(documentRef) {
  const formStage = documentRef.getElementById('form-mode-stage');
  if (!formStage) {
    return null;
  }

  let host = documentRef.getElementById('form-mode-host');
  if (!host) {
    host = documentRef.createElement('div');
    host.id = 'form-mode-host';
    host.className = 'form-mode-host hidden';
    formStage.insertBefore(host, formStage.firstChild);
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

function createFormModeFixedCriteriaState(documentRef, count) {
  const fixedState = documentRef.createElement('div');
  fixedState.className = 'form-mode-empty-state';
  fixedState.innerHTML = getFormModeFixedCriteriaStateHtml(count);
  return fixedState;
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
    focusFormBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.focusFormBtn),
    host,
    nameInput: card.querySelector(FORM_MODE_CARD_SELECTORS.nameInput),
    resetBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetBtn),
    resetMenu: card.querySelector(FORM_MODE_CARD_SELECTORS.resetMenu),
    resetMenuShell: card.querySelector(FORM_MODE_CARD_SELECTORS.resetMenuShell),
    resetOriginalBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetOriginalBtn),
    resetSharedBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.resetSharedBtn),
    runBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.runBtn),
    shareMenu: card.querySelector(FORM_MODE_CARD_SELECTORS.shareMenu),
    shareMenuShell: card.querySelector(FORM_MODE_CARD_SELECTORS.shareMenuShell),
    shareResultsBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.shareResultsBtn),
    showTableBtn: card.querySelector(FORM_MODE_CARD_SELECTORS.showTableBtn),
    validationEl: card.querySelector(FORM_MODE_CARD_SELECTORS.validationEl)
  };
}

export {
  FORM_MODE_CARD_SELECTORS,
  createFormModeEmptyState,
  createFormModeFixedCriteriaState,
  getFormModeCardHtml,
  getFormModeEmptyStateHtml,
  getFormModeFixedCriteriaStateHtml,
  getVisibleFormInputs,
  mountFormModeCard
};
