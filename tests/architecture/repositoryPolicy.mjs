import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bufferContainsBlockedTerm,
  containsBlockedTerm,
} from '../../scripts/checkRepositoryPolicy.mjs';

const firstBlockedTerm = String.fromCodePoint(99, 111, 100, 101, 120);
const secondBlockedTerm = String.fromCodePoint(99, 104, 97, 116, 103, 112, 116);

test('repository policy accepts ordinary text', () => {
  assert.equal(containsBlockedTerm('Library Item Reports'), false);
  assert.equal(bufferContainsBlockedTerm(Buffer.from('decodeEntities')), false);
});

test('repository policy rejects blocked terms regardless of case', () => {
  assert.equal(containsBlockedTerm(firstBlockedTerm.toUpperCase()), true);
  assert.equal(containsBlockedTerm(`prefix-${secondBlockedTerm}-suffix`), true);
  assert.equal(bufferContainsBlockedTerm(Buffer.from(firstBlockedTerm)), true);
});
