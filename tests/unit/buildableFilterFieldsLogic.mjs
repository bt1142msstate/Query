import assert from 'node:assert/strict';
import {
  buildDynamicFieldDefinition,
  collectBuilderInputValues
} from '../../filters/buildableFilterFields.js';

const fieldDef = {
  name: 'Marc {tag}',
  field_template: 'Marc {tag}${subfield}',
  special_payload_template: {
    tag: '{tag}',
    subfield: '{subfield}',
    fixed: 'literal'
  }
};

assert.deepEqual(buildDynamicFieldDefinition(fieldDef, {
  tag: '590',
  subfield: 'a'
}), {
  dynamicFieldName: 'Marc 590$a',
  specialPayload: {
    tag: '590',
    subfield: 'a',
    fixed: 'literal'
  }
});

function makeInput({ value, pattern = '', inputId = 'tag', errorMsg = 'Bad value' }) {
  return {
    value,
    dataset: {
      inputId,
      errorMsg
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
