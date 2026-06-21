import assert from 'node:assert/strict';
import test from 'node:test';
import { templateBlocksSVG, templateDocumentSVG, trashSVG } from '../../../src/core/icons.js';

test('trash icon exposes the destructive flame animation contract', () => {
  const icon = trashSVG(14, 14);

  assert.match(icon, /class="destructive-flame-icon"/u);
  assert.match(icon, /class="destructive-flame-shape"/u);
  assert.match(icon, /width="14"/u);
  assert.match(icon, /height="14"/u);
  assert.match(icon, /aria-hidden="true"/u);
});

test('template icon exposes the block animation contract', () => {
  const icon = templateBlocksSVG('test-template-icon');

  assert.match(icon, /class="test-template-icon"/u);
  assert.match(icon, /template-block-top/u);
  assert.match(icon, /template-block-middle/u);
  assert.match(icon, /template-block-bottom/u);
  assert.match(icon, /viewBox="0 0 64 64"/u);
  assert.match(icon, /aria-hidden="true"/u);
});

test('template document icon exposes the neutral overlay contract', () => {
  const icon = templateDocumentSVG('test-template-document-icon');

  assert.match(icon, /class="test-template-document-icon"/u);
  assert.match(icon, /template-document-page/u);
  assert.match(icon, /template-document-fold/u);
  assert.match(icon, /template-document-line/u);
  assert.match(icon, /viewBox="0 0 64 64"/u);
  assert.match(icon, /aria-hidden="true"/u);
});
