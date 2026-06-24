import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFieldPickerOptionBadges,
  buildFieldPickerStatusText,
  isOptionDisplayable,
  normalizePickerState
} from '../../../src/ui/field-picker/fieldPickerOptionState.js';

const labels = {
  displayBadge: 'Displayed',
  displayChoice: 'Display in results',
  filterBadge: 'Filter',
  filterChoice: 'Add filter control'
};

test('field picker option state normalizes badges and status text', () => {
  assert.deepEqual(normalizePickerState({ display: 1, filter: '' }), {
    display: true,
    filter: false
  });
  assert.equal(isOptionDisplayable({ displayable: false }), false);

  const badges = buildFieldPickerOptionBadges({
    allowDisplay: true,
    allowFilter: true,
    labels,
    option: { displayable: false, localDynamic: true, name: 'MARC 590' },
    state: { display: true, filter: true }
  });
  assert.match(badges, /Displayed/);
  assert.match(badges, /Filter/);
  assert.match(badges, /Build first/);
  assert.match(badges, /Built/);

  assert.equal(
    buildFieldPickerStatusText({
      allowDisplay: true,
      allowFilter: true,
      autoAddFilterFromPreview: true,
      displayChoice: { checked: true },
      filterChoice: null,
      labels,
      selected: { displayable: false, name: 'MARC 590' },
      state: { display: false, filter: false }
    }),
    'Create this field before displaying it'
  );

  assert.equal(
    buildFieldPickerStatusText({
      allowDisplay: true,
      allowFilter: true,
      autoAddFilterFromPreview: true,
      displayChoice: { checked: false },
      filterChoice: null,
      labels,
      selected: { displayable: true, filterable: true, name: 'Title' },
      state: { display: true, filter: false }
    }),
    'Will remove display in results • Enter a filter value to add it'
  );
});
