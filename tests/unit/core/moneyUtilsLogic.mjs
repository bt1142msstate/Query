import assert from 'node:assert/strict';
import {
  formatDisplayValue,
  formatInputValue,
  parseNumber,
  sanitizeInputValue
} from '../../../src/core/formatting/moneyUtils.js';
import test from 'node:test';

test('money utils', async () => {
  assert.equal(sanitizeInputValue('$001,234.567'), '1234.56');
  assert.equal(sanitizeInputValue('-$001,234.5'), '-1234.5');
  assert.equal(sanitizeInputValue('2024.99', { allowDecimal: false }), '202499');
  assert.equal(sanitizeInputValue('abc'), '');

  assert.equal(formatInputValue('1234567.8'), '1,234,567.8');
  assert.equal(formatInputValue('-001234'), '-1,234');
  assert.equal(formatInputValue('1234.', { allowDecimal: true }), '1,234.');
  assert.equal(formatInputValue('1234.56', { allowDecimal: false }), '123,456');

  assert.equal(parseNumber('$1,234.50'), 1234.5);
  assert.equal(parseNumber('-$1,234.50'), -1234.5);
  assert.equal(parseNumber('12.34', { allowDecimal: false }), 1234);
  assert.equal(Number.isNaN(parseNumber('abc')), true);

  assert.equal(formatDisplayValue('1234.5'), '$1,234.50');
  assert.equal(formatDisplayValue('-1234.5'), '-$1,234.50');
  assert.equal(formatDisplayValue('1234.5', { currencySymbol: '', maximumFractionDigits: 1, minimumFractionDigits: 1 }), '1,234.5');
  assert.equal(formatDisplayValue('abc'), '');
});
