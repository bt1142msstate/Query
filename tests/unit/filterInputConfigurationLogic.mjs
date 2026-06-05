import assert from 'node:assert/strict';
import {
  conditionAllowsNeverDateValue,
  configureConditionInputsForType
} from '../../filters/condition-editor/filterInputConfiguration.js';
import test from 'node:test';

test('filter input configuration', async () => {
  function createInput() {
    const attrs = new Map();
    return {
      type: '',
      placeholder: 'Enter value...',
      dataset: {},
      onkeypress: null,
      classList: {
        values: new Set(),
        toggle(name, enabled) {
          if (enabled) this.values.add(name);
          else this.values.delete(name);
        },
        contains(name) {
          return this.values.has(name);
        }
      },
      setAttribute(name, value) {
        attrs.set(name, String(value));
      },
      getAttribute(name) {
        return attrs.get(name) || null;
      },
      removeAttribute(name) {
        attrs.delete(name);
      },
      _attrs: attrs
    };
  }

  assert.equal(conditionAllowsNeverDateValue('equals'), true);
  assert.equal(conditionAllowsNeverDateValue('does_not_equal'), true);
  assert.equal(conditionAllowsNeverDateValue('never'), true);
  assert.equal(conditionAllowsNeverDateValue('before'), false);

  const decimalInput = createInput();
  let configuredMode = null;
  configureConditionInputsForType({
    type: 'number',
    inputs: [decimalInput],
    currentFieldName: 'Decimal Field',
    selectedCondition: 'equals',
    moneyUtils: {
      configureInputBehavior(_input, mode) {
        configuredMode = mode;
      }
    },
    valueFormatting: {
      getNumberFormat() {
        return 'decimal';
      }
    }
  });

  assert.equal(decimalInput.type, 'text');
  assert.equal(decimalInput.getAttribute('inputmode'), 'decimal');
  assert.equal(decimalInput.getAttribute('step'), '0.01');
  assert.equal(decimalInput.placeholder, '0.00');
  assert.deepEqual(configuredMode, { kind: 'decimal' });

  const dateInput = createInput();
  let datePickerOptions = null;
  configureConditionInputsForType({
    type: 'date',
    inputs: [dateInput],
    selectedCondition: 'never',
    customDatePicker: {
      inputPattern: 'DATE_PATTERN',
      enhanceInput(_input, options) {
        datePickerOptions = options;
      }
    },
    moneyUtils: {},
    valueFormatting: {}
  });

  assert.equal(dateInput.dataset.errorMsg, 'Enter a date or Never');
  assert.equal(dateInput.getAttribute('pattern'), 'DATE_PATTERN');
  assert.equal(datePickerOptions.allowNever, true);

  const textInput = createInput();
  let destroyed = false;
  textInput._customDatePickerApi = {
    destroy() {
      destroyed = true;
    }
  };
  textInput.placeholder = '0';
  textInput.dataset.errorMsg = 'Enter a date or Never';
  textInput.setAttribute('pattern', 'DATE_PATTERN');

  configureConditionInputsForType({
    type: 'string',
    inputs: [textInput],
    customDatePicker: {
      enhanceInput() {}
    },
    moneyUtils: {
      configureInputBehavior() {}
    },
    valueFormatting: {}
  });

  assert.equal(destroyed, true);
  assert.equal(textInput.getAttribute('inputmode'), null);
  assert.equal(textInput.getAttribute('pattern'), null);
  assert.equal(textInput.placeholder, 'Enter value...');
  assert.equal(textInput.dataset.errorMsg, undefined);
});
