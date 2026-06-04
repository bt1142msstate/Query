import assert from 'node:assert/strict';
import {
  getFormModePresentationState,
  resolveRequestedFormViewMode
} from '../../ui/form-mode/formModePresentation.js';

assert.equal(resolveRequestedFormViewMode({ limitedView: true, nextMode: 'bubbles' }), 'form');
assert.equal(resolveRequestedFormViewMode({ limitedView: false, nextMode: 'bubbles' }), 'form');
assert.equal(resolveRequestedFormViewMode({ limitedView: false, nextMode: 'anything-else' }), 'form');

assert.deepEqual(getFormModePresentationState({
  active: true,
  limitedView: true,
  viewMode: 'bubbles'
}), {
  isFormMode: true,
  isLimitedView: true
});

assert.deepEqual(getFormModePresentationState({
  active: true,
  limitedView: false,
  viewMode: 'bubbles'
}), {
  isFormMode: true,
  isLimitedView: false
});

console.log('Form mode presentation logic tests passed');
