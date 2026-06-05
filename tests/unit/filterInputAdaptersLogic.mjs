import assert from 'node:assert/strict';
import {
  configureFilterInputsForType,
  getComparableDateValue,
  isConditionInputVisible,
  setConditionInputVisible,
  syncDatePickerNeverAvailability
} from '../../filters/filterInputAdapters.js';
import test from 'node:test';

test('filter input adapters', async () => {
  function createFakeInput() {
    const attributes = new Map();
    const classes = new Set();
    return {
      dataset: {},
      placeholder: '',
      style: {},
      type: '',
      classList: {
        contains(name) {
          return classes.has(name);
        },
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        }
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      removeAttribute(name) {
        attributes.delete(name);
      },
      getAttribute(name) {
        return attributes.get(name);
      }
    };
  }

  {
    const input = createFakeInput();
    setConditionInputVisible(input, false);
    assert.equal(input.style.display, 'none');
    setConditionInputVisible(input, true);
    assert.equal(input.style.display, '');
    assert.equal(isConditionInputVisible(input), true);
    input.style.display = 'none';
    assert.equal(isConditionInputVisible(input), false);
  }

  {
    const calls = [];
    const customDatePicker = {
      setInputVisibility(input, visible) {
        calls.push({ input, visible });
      },
      isInputVisible() {
        return true;
      },
      getComparableValue(value) {
        return Number(value);
      }
    };
    const input = createFakeInput();
    setConditionInputVisible(input, false, customDatePicker);
    assert.deepEqual(calls, [{ input, visible: false }]);
    assert.equal(isConditionInputVisible(input, customDatePicker), true);
    assert.equal(getComparableDateValue('20240131', customDatePicker), 20240131);
  }

  {
    const inputA = { _customDatePickerApi: { allowNever: false } };
    const inputB = { _customDatePickerApi: { allowNever: false } };
    syncDatePickerNeverAvailability([inputA, inputB], 'equals');
    assert.equal(inputA._customDatePickerApi.allowNever, true);
    assert.equal(inputB._customDatePickerApi.allowNever, true);
    syncDatePickerNeverAvailability([inputA, inputB], 'before');
    assert.equal(inputA._customDatePickerApi.allowNever, false);
    assert.equal(inputB._customDatePickerApi.allowNever, false);
  }

  {
    const moneyCalls = [];
    const input = createFakeInput();
    configureFilterInputsForType({
      type: 'money',
      inputs: [input],
      currentFieldName: 'Price',
      selectedCondition: 'equals',
      moneyUtils: {
        configureInputBehavior(target, mode) {
          moneyCalls.push({ target, mode });
        }
      },
      valueFormatting: {
        getNumberFormat() {
          return 'currency';
        }
      }
    });

    assert.equal(input.type, 'text');
    assert.equal(input.getAttribute('inputmode'), 'decimal');
    assert.equal(input.getAttribute('step'), '0.01');
    assert.equal(input.placeholder, '0.00');
    assert.equal(input.classList.contains('condition-field-money'), true);
    assert.deepEqual(moneyCalls, [{ target: input, mode: true }]);
  }
});
