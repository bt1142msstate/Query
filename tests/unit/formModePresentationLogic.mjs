import assert from 'node:assert/strict';
import {
  getFormModePresentationState,
  getModeTogglePresentation,
  getNextFormViewMode,
  refreshBubbleStageAfterModeSwitch,
  resolveRequestedFormViewMode
} from '../../ui/form-mode/formModePresentation.js';

assert.equal(resolveRequestedFormViewMode({ limitedView: true, nextMode: 'bubbles' }), 'form');
assert.equal(resolveRequestedFormViewMode({ limitedView: false, nextMode: 'bubbles' }), 'bubbles');
assert.equal(resolveRequestedFormViewMode({ limitedView: false, nextMode: 'anything-else' }), 'form');

assert.equal(getNextFormViewMode('form'), 'bubbles');
assert.equal(getNextFormViewMode('bubbles'), 'form');
assert.equal(getNextFormViewMode('unknown'), 'form');

assert.deepEqual(getModeTogglePresentation('form'), {
  tooltip: 'Switch to bubble builder',
  ariaLabel: 'Switch to bubble builder',
  mobileMenuLabel: 'Bubble Mode',
  formIconHidden: true,
  bubbleIconHidden: false
});

assert.deepEqual(getModeTogglePresentation('bubbles'), {
  tooltip: 'Switch to form mode',
  ariaLabel: 'Switch to form mode',
  mobileMenuLabel: 'Form Mode',
  formIconHidden: false,
  bubbleIconHidden: true
});

assert.deepEqual(getFormModePresentationState({
  active: true,
  limitedView: true,
  viewMode: 'bubbles'
}), {
  isFormMode: false,
  isLimitedView: true,
  modeToggle: getModeTogglePresentation('bubbles')
});

let animationFrameCalls = 0;
let rerenderCalls = 0;
refreshBubbleStageAfterModeSwitch({
  services: {
    bubble: {
      safeRenderBubbles() {}
    },
    rerenderBubbles() {
      rerenderCalls += 1;
    }
  },
  window: {
    requestAnimationFrame(callback) {
      animationFrameCalls += 1;
      callback();
    }
  }
});

assert.equal(animationFrameCalls, 2);
assert.equal(rerenderCalls, 1);

console.log('Form mode presentation logic tests passed');
