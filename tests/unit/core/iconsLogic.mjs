import assert from 'node:assert/strict';
import test from 'node:test';
import { trashSVG } from '../../../src/core/icons.js';

test('trash icon exposes the destructive flame animation contract', () => {
  const icon = trashSVG(14, 14);

  assert.match(icon, /class="destructive-flame-icon"/u);
  assert.match(icon, /class="destructive-flame-shape"/u);
  assert.match(icon, /width="14"/u);
  assert.match(icon, /height="14"/u);
  assert.match(icon, /aria-hidden="true"/u);
});
