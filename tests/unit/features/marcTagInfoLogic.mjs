import assert from 'node:assert/strict';
import test from 'node:test';
import { marcTagTooltip } from '../../../src/ui/bib-compare/marcTagInfo.js';

test('MARC tooltip combines the raw tag, human name, description, and source type', () => {
  assert.equal(
    marcTagTooltip({
      tag: '521',
      label: 'Target Audience Note',
      description: 'Identifies the intended audience.',
      standard: 'MARC 21'
    }),
    '521 - Target Audience Note. Identifies the intended audience. Definition: MARC 21.'
  );
});

test('MARC tooltip remains useful when optional metadata is unavailable', () => {
  assert.match(marcTagTooltip({ tag: '945', label: 'Local Data Field' }), /No field description is available/);
});
