import assert from 'node:assert/strict';
import test from 'node:test';
import { bibliographicSource, sourceReviewCount } from '../../../src/ui/bib-compare/bibSource.js';

test('bibliographic source defaults to OCLC primary for existing payloads', () => {
  const source = bibliographicSource({
    selection: { oclc_number: '54005706' },
    worldcat: { summary: { title: 'A title' } }
  });
  assert.equal(source.code, 'oclc');
  assert.equal(source.label, 'OCLC WorldCat');
  assert.equal(source.identifier, '54005706');
  assert.equal(source.role, 'primary');
});

test('source review counts prefer generic provenance and preserve older OCLC payloads', () => {
  assert.equal(sourceReviewCount({ source_526_count: 3, worldcat_526_count: 2 }, '526'), 3);
  assert.equal(sourceReviewCount({ worldcat_526_count: 2 }, '526'), 2);
});

test('bibliographic source exposes Library of Congress fallback provenance', () => {
  const external = { summary: { title: 'A title' } };
  const source = bibliographicSource({
    source: { code: 'loc' },
    selection: { source: 'loc', lccn: '2004012345' },
    external
  });
  assert.equal(source.label, 'Library of Congress');
  assert.equal(source.identifierLabel, 'LCCN');
  assert.equal(source.identifier, '2004012345');
  assert.equal(source.record, external);
  assert.equal(source.role, 'fallback');
});
