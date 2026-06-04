import assert from 'node:assert/strict';
import {
  buildDynamicFieldDefinition,
  collectBuilderInputValues,
  isOptionalBuilderInput
} from '../../filters/buildableFilterFields.js';

const fieldDef = {
  name: 'MARC Field',
  builder: {
    outputFieldIdTemplate: 'MARC {tag}${subfield}',
    displayLabelTemplate: 'MARC {tag}${subfield}',
    inputs: [
      { id: 'tag', pattern: '^\\d{3}$' },
      { id: 'subfield', pattern: '^[0-9A-Za-z]$', optional: true }
    ]
  }
};

assert.deepEqual(buildDynamicFieldDefinition(fieldDef, {
  tag: '590',
  subfield: ''
}), {
  dynamicFieldName: 'MARC 590',
  displayLabel: 'MARC 590'
});

assert.deepEqual(buildDynamicFieldDefinition(fieldDef, {
  tag: '590',
  subfield: 'a'
}), {
  dynamicFieldName: 'MARC 590$a',
  displayLabel: 'MARC 590$a'
});

function makeInput({ value, pattern = '', inputId = 'tag', errorMsg = 'Bad value', optional = false }) {
  return {
    value,
    dataset: {
      inputId,
      errorMsg,
      optional: optional ? 'true' : 'false'
    },
    getAttribute(name) {
      return name === 'pattern' ? pattern : '';
    }
  };
}

const validResult = collectBuilderInputValues([
  makeInput({ value: '590', pattern: '\\d{3}', inputId: 'tag' }),
  makeInput({ value: 'a', pattern: '[a-z]', inputId: 'subfield' })
], {
  showFilterError: () => assert.fail('Valid input should not show an error')
});
assert.deepEqual(validResult, {
  ok: true,
  values: {
    tag: '590',
    subfield: 'a'
  }
});

const optionalResult = collectBuilderInputValues([
  makeInput({ value: '590', pattern: '\\d{3}', inputId: 'tag' }),
  makeInput({ value: '', pattern: '[0-9A-Za-z]', inputId: 'subfield', optional: true })
], {
  showFilterError: () => assert.fail('Empty optional input should not show an error')
});
assert.deepEqual(optionalResult, {
  ok: true,
  values: {
    tag: '590',
    subfield: ''
  }
});

assert.equal(isOptionalBuilderInput({ optional: 1 }), true);
assert.equal(isOptionalBuilderInput({ optional: '1' }), true);
assert.equal(isOptionalBuilderInput({ optional: 'true' }), true);
assert.equal(isOptionalBuilderInput({ required: 0 }), true);
assert.equal(isOptionalBuilderInput({ required: 'false' }), true);
assert.equal(isOptionalBuilderInput({ optional: 0, required: 1 }), false);

let errorMessage = '';
const invalidResult = collectBuilderInputValues([
  makeInput({ value: 'abc', pattern: '\\d{3}', inputId: 'tag', errorMsg: 'Tag must be numeric' })
], {
  showFilterError: message => {
    errorMessage = message;
  }
});
assert.deepEqual(invalidResult, { ok: false, values: {} });
assert.equal(errorMessage, 'Tag must be numeric');

const csvResult = collectBuilderInputValues([
  makeInput({ value: '590,591', pattern: '\\d{3}', inputId: 'tag' })
], {
  showFilterError: () => assert.fail('First CSV value should validate'),
  useFirstCsvValue: true
});
assert.deepEqual(csvResult, {
  ok: true,
  values: {
    tag: '590,591'
  }
});

console.log('Buildable filter field logic tests passed');
