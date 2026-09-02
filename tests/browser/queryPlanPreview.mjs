import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

import {
  attachFailureListeners,
  closeServer,
  encodeFormSpecForUrl,
  installQueryApiStub,
  listen,
  serveStaticFile,
  stubExternalAssets,
  waitForAppReady
} from './support/browserSmokeSupport.mjs';

test('a cold-start query ETA is visible before Run without comparable history', { timeout: 30000 }, async () => {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const failures = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      sessionStorage.setItem('query-project.session', JSON.stringify({
        token: 'query-plan-preview-session', username: 'query-plan-preview', role: 'admin'
      }));
    });
    attachFailureListeners(page, failures, port);
    await stubExternalAssets(page);
    const api = await installQueryApiStub(page);
    const form = encodeFormSpecForUrl({
      title: 'Pre-run estimate',
      queryName: 'Pre-run estimate',
      columns: ['Title', 'Item Id', 'Item Library'],
      inputs: [{
        key: 'item-library-equals',
        field: 'Item Library',
        source: 'query-filter',
        label: 'Item Library',
        operator: '=',
        required: false,
        multiple: true,
        hidden: false,
        type: 'select',
        defaultValue: ['MSU-MAIN']
      }],
      lockedFilters: []
    });
    await page.goto(`http://127.0.0.1:${port}/index.html?form=${form}`, { waitUntil: 'load' });
    await waitForAppReady(page, failures);
    await page.waitForFunction(() => document.querySelector('#query-plan-preview')?.dataset.state === 'ready');

    const preview = await page.evaluate(() => ({
      eta: document.querySelector('#query-plan-preview')?.textContent?.trim(),
      runLabel: document.querySelector('#form-mode-run')?.textContent?.trim(),
      runEnabled: !document.querySelector('#form-mode-run')?.disabled
    }));
    assert.match(preview.eta || '', /^ETA · Likely \d+–\d+\+? (?:sec|min)$/u);
    assert.match(preview.runLabel || '', /^Run · \d+–\d+\+? (?:sec|min)$/u);
    assert.equal(preview.runEnabled, true);
    assert.equal(api.countAction('run'), 0);
    assert.equal(api.countAction('query_plan'), 1);
    assert.ok(api.countAction('library_dashboard') >= 1);
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});
