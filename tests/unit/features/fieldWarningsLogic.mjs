import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFieldPerformanceWarning,
  getFieldPerformanceWarningMessage,
  normalizeFieldWarningPayload
} from '../../../src/features/filters/fieldWarnings.js';

test('field warnings normalize string metadata', () => {
  assert.deepEqual(
    normalizeFieldWarningPayload('May take longer on large queries.'),
    {
      level: 'warning',
      message: 'May take longer on large queries.'
    }
  );
});

test('field warnings normalize object metadata', () => {
  assert.deepEqual(
    normalizeFieldWarningPayload({
      severity: 'info',
      detail: 'Uses an additional backend lookup.'
    }),
    {
      level: 'info',
      message: 'Uses an additional backend lookup.'
    }
  );
});

test('field warnings prefer backend performance warning metadata', () => {
  const warning = getFieldPerformanceWarning({
    performanceWarning: {
      level: 'warning',
      message: 'MARC fields can take longer.'
    }
  });

  assert.equal(warning.message, 'MARC fields can take longer.');
  assert.equal(getFieldPerformanceWarningMessage({ performanceWarning: 'Slow lookup.' }), 'Slow lookup.');
  assert.equal(getFieldPerformanceWarningMessage({ warning: 'Generic field warning.' }), 'Generic field warning.');
});

test('field warnings ignore empty or unsupported values', () => {
  assert.equal(normalizeFieldWarningPayload('   '), null);
  assert.equal(normalizeFieldWarningPayload(42), null);
  assert.equal(getFieldPerformanceWarning({ performanceWarning: { message: '' } }), null);
  assert.equal(getFieldPerformanceWarning(null), null);
});
