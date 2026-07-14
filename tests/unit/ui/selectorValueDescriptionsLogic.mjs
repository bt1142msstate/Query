import assert from 'node:assert/strict';
import test from 'node:test';

import { getSelectorValueDescription } from '../../../src/ui/controls/selectorControls.js';

test('selector values expose descriptions from direct and metadata properties', () => {
  assert.equal(
    getSelectorValueDescription({ Description: 'Direct description', Metadata: { description: 'Nested description' } }),
    'Direct description'
  );
  assert.equal(
    getSelectorValueDescription({ Metadata: { description: 'Library branch description' } }),
    'Library branch description'
  );
  assert.equal(getSelectorValueDescription('FRL-TUN'), '');
});
