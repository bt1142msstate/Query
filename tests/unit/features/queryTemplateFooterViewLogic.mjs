import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTemplateWorkbenchStatus } from '../../../src/features/templates/view/queryTemplateFooterView.js';

test('query template footer status reflects loading, saving, and last refresh age', () => {
  assert.equal(buildTemplateWorkbenchStatus({ loading: true }), 'Loading templates...');
  assert.equal(buildTemplateWorkbenchStatus({ saving: true }), 'Saving template changes...');
  assert.equal(buildTemplateWorkbenchStatus({ loaded: false, lastLoadedAt: 0 }), 'Last updated: Not loaded');
  assert.equal(buildTemplateWorkbenchStatus({ loaded: true, lastLoadedAt: 0 }), 'Last updated: Just now');
  assert.equal(buildTemplateWorkbenchStatus({ lastLoadedAt: 1000 }, 59_000), 'Last updated: Just now');
  assert.equal(buildTemplateWorkbenchStatus({ lastLoadedAt: 1000 }, 181_000), 'Last updated: 3m ago');
});
