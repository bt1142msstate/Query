import { DOM } from '../../core/domCache.js';

function getFilterConditionPanelElement() {
  return DOM?.conditionPanel || document.getElementById('condition-panel');
}

function getFilterInputWrapperElement() {
  return DOM?.inputWrapper || document.getElementById('condition-input-wrapper');
}

function getFilterConditionInputElement() {
  return DOM?.conditionInput || document.getElementById('condition-input');
}

function getFilterConditionInput2Element() {
  return DOM?.conditionInput2 || document.getElementById('condition-input-2');
}

function getFilterBetweenLabelElement() {
  return DOM?.betweenLabel || document.getElementById('between-label');
}

function getFilterQueryInputElement() {
  return DOM?.queryInput || document.getElementById('query-input');
}

function getFilterErrorLabelElement() {
  return DOM?.filterError || document.getElementById('filter-error');
}

function getConditionOperatorSelect(conditionPanel = null) {
  const panel = conditionPanel || getFilterConditionPanelElement();
  return panel ? panel.querySelector('#condition-operator-select') : null;
}

function getConditionFromControl(control) {
  if (!control) return '';
  if (control.dataset && control.dataset.cond) {
    return String(control.dataset.cond).trim().toLowerCase();
  }
  if (typeof control.value === 'string') {
    return String(control.value).trim().toLowerCase();
  }
  return '';
}

function isControlVisible(control) {
  return Boolean(control && control.style.display !== 'none');
}

function isMobileFilterEditorViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 1180px), (hover: none) and (pointer: coarse)').matches;
}

export {
  getConditionFromControl,
  getConditionOperatorSelect,
  getFilterBetweenLabelElement,
  getFilterConditionInput2Element,
  getFilterConditionInputElement,
  getFilterConditionPanelElement,
  getFilterErrorLabelElement,
  getFilterInputWrapperElement,
  getFilterQueryInputElement,
  isControlVisible,
  isMobileFilterEditorViewport
};
