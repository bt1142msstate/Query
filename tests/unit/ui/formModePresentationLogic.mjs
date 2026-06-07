import assert from 'node:assert/strict';
import {
  getFormModePresentationState,
  resolveRequestedFormViewMode
} from '../../../src/ui/form-mode/formModePresentation.js';
import test from 'node:test';

test('form mode presentation', async () => {
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
});
