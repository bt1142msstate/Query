import assert from 'node:assert/strict';
import {
  buildNextDisplayedFieldsForPicker,
  parseFieldPickerInsertAt
} from '../../ui/field-picker/fieldPickerQuerySelection.js';
import test from 'node:test';

test('field picker query integration', async () => {
  assert.equal(parseFieldPickerInsertAt(2), 2);
  assert.equal(parseFieldPickerInsertAt('3'), 3);
  assert.equal(parseFieldPickerInsertAt(''), -1);
  assert.equal(parseFieldPickerInsertAt(undefined), -1);
  assert.equal(parseFieldPickerInsertAt('not-a-number'), -1);

  assert.deepEqual(
    buildNextDisplayedFieldsForPicker(['Title', 'Author'], 'Barcode', true, -1),
    ['Title', 'Author', 'Barcode']
  );

  assert.deepEqual(
    buildNextDisplayedFieldsForPicker(['Title', 'Author'], 'Barcode', true, 1),
    ['Title', 'Barcode', 'Author']
  );

  assert.deepEqual(
    buildNextDisplayedFieldsForPicker(['Title', 'Author'], 'Title', true, 1),
    ['Title', 'Author']
  );

  assert.deepEqual(
    buildNextDisplayedFieldsForPicker(
      ['Title', 'Author', 'Title 2'],
      'Title',
      false,
      -1,
      (column, field) => column === field || column === `${field} 2`
    ),
    ['Author']
  );

  assert.deepEqual(
    buildNextDisplayedFieldsForPicker(null, 'Title', true, 4),
    ['Title']
  );
});
