import assert from 'node:assert/strict';
import {
  buildDynamicFieldDefinition,
  collectBuilderInputValues,
  isOptionalBuilderInput
} from '../../../src/features/filters/buildableFilterFields.js';
import test from 'node:test';

test('buildable filter fields', async () => {
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

  assert.deepEqual(buildDynamicFieldDefinition({
    name: 'Local Metadata Field',
    builder: {
      outputFieldIdTemplate: 'Local Metadata {code}${subfield}',
      displayLabelTemplate: 'Local Metadata {code}${subfield}',
      inputs: [
        { name: 'code', required: true },
        { name: 'subfield', required: false }
      ]
    }
  }, {
    code: '590',
    subfield: 'a'
  }), {
    dynamicFieldName: 'Local Metadata 590$a',
    displayLabel: 'Local Metadata 590$a'
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
});
