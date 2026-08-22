import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLibraryScopeSelectorValues,
  systemCodeForLibraryScope
} from '../../../src/core/libraryScopes.js';

test('dashboard library values use the same system groups as the main multi-selector', () => {
  const values = buildLibraryScopeSelectorValues(
    [
      { value: 'system:MSU', label: 'Mississippi State University' },
      { value: 'system:FRL', label: 'First Regional Library' }
    ],
    [
      { value: 'MSU-MAIN', label: 'MSU-MAIN' },
      { value: 'MSU-MERIDIAN', label: 'MSU-MERIDIAN' },
      { value: 'FRL-OXF', label: 'FRL-OXF' }
    ]
  );

  assert.deepEqual(values, [
    { RawValue: 'MSU-MAIN', Display: 'MSU-MAIN', Group: 'Mississippi State University' },
    { RawValue: 'MSU-MERIDIAN', Display: 'MSU-MERIDIAN', Group: 'Mississippi State University' },
    { RawValue: 'FRL-OXF', Display: 'FRL-OXF', Group: 'First Regional Library' }
  ]);
  assert.ok(values.every(value => !value.RawValue.startsWith('system:')));
});

test('library policy codes resolve to their system for fiscal-period filtering', () => {
  assert.equal(systemCodeForLibraryScope('MSU-MAIN'), 'MSU');
  assert.equal(systemCodeForLibraryScope('system:MSU'), 'MSU');
});
