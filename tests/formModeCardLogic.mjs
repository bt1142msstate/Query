import assert from 'node:assert/strict';
import {
  FORM_MODE_CARD_SELECTORS,
  getFormModeCardHtml,
  getFormModeEmptyStateHtml,
  getVisibleFormInputs
} from '../ui/formModeCard.js';

const cardHtml = getFormModeCardHtml();
Object.values(FORM_MODE_CARD_SELECTORS).forEach(selector => {
  assert.equal(cardHtml.includes(selector.slice(1)), true, `${selector} should exist in the form card shell`);
});

assert.equal(cardHtml.includes('Run Form'), true);
assert.equal(cardHtml.includes('Reset to Last Shared'), true);
assert.equal(cardHtml.includes('data-form-mode-title'), true);

const emptyStateHtml = getFormModeEmptyStateHtml();
assert.equal(emptyStateHtml.includes('No filters yet.'), true);
assert.equal(emptyStateHtml.includes('Add Filter'), true);

const visibleInputs = getVisibleFormInputs([
  { key: 'visible-a', hidden: false },
  { key: 'hidden-b', hidden: true },
  { key: 'visible-c' }
]);

assert.deepEqual(visibleInputs.map(inputSpec => inputSpec.key), ['visible-a', 'visible-c']);
assert.deepEqual(getVisibleFormInputs(null), []);

console.log('Form mode card logic tests passed');
