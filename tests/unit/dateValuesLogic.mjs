import assert from 'node:assert/strict';

const {
  DATE_INPUT_PATTERN,
  isValidDateValue,
  normalizeDateValue,
  toBackendDateValue
} = await import('../../core/dateValues.js');

const acceptedFormats = [
  ['1/2/2026', '1/2/2026'],
  ['01/02/2026', '1/2/2026'],
  ['1/2/26', '1/2/2026'],
  ['1-2-2026', '1/2/2026'],
  ['1.2.2026', '1/2/2026'],
  ['2026-1-2', '1/2/2026'],
  ['2026/01/02', '1/2/2026'],
  ['20260102', '1/2/2026'],
  ['01022026', '1/2/2026'],
  ['Jan 2, 2026', '1/2/2026'],
  ['January 2nd, 2026', '1/2/2026'],
  ['2 Jan 26', '1/2/2026'],
  ['2026-01-02T08:30:00', '1/2/2026'],
  ['12/31/99', '12/31/1999']
];

acceptedFormats.forEach(([input, expected]) => {
  assert.equal(isValidDateValue(input), true, `${input} should be valid`);
  assert.equal(normalizeDateValue(input), expected, `${input} should normalize`);
});

assert.equal(normalizeDateValue('Never'), 'Never');
assert.equal(toBackendDateValue('Jan 2, 2026'), '20260102');
assert.equal(toBackendDateValue('01022026'), '20260102');
assert.equal(new RegExp(DATE_INPUT_PATTERN).test('Jan 2, 2026'), true);
assert.equal(new RegExp(DATE_INPUT_PATTERN).test('1.2.2026'), true);
assert.equal(new RegExp(DATE_INPUT_PATTERN).test('Never'), true);
assert.equal(isValidDateValue('2/31/2026'), false);
assert.equal(normalizeDateValue('not a date'), '');

console.log('Date value logic tests passed');
