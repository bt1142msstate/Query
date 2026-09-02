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
      runEnabled: !document.querySelector('#form-mode-run')?.disabled,
      smartOrdering: document.querySelector('#planning-badge')?.getAttribute('aria-pressed'),
      smartOrderingLabel: document.querySelector('[data-smart-query-state]')?.textContent?.trim()
    }));
    assert.match(preview.eta || '', /^ETA · Likely \d+–\d+\+? (?:sec|min)$/u);
    assert.match(preview.runLabel || '', /^Run · \d+–\d+\+? (?:sec|min)$/u);
    assert.equal(preview.runEnabled, true);
    assert.equal(preview.smartOrdering, 'true');
    assert.equal(preview.smartOrderingLabel, 'On');
    assert.equal(api.countAction('run'), 0);
    assert.equal(api.countAction('query_plan'), 1);
    assert.ok(api.countAction('library_dashboard') >= 1);

    await page.locator('#query-plan-preview').click();
    await page.locator('#query-plan-details:not(.hidden)').waitFor({ state: 'visible' });
    const details = await page.locator('#query-plan-details').textContent();
    assert.match(details || '', /P50/u);
    assert.match(details || '', /P80/u);
    assert.match(details || '', /P90/u);
    assert.match(details || '', /Records scanned/u);
    assert.match(details || '', /Selector scan/u);
    assert.match(details || '', /medium confidence/u);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#query-plan-details').getAttribute('class'), 'query-plan-details hidden');

    assert.equal(api.getRequests('query_plan').at(-1)?.payload?.smart_query_enabled, undefined);
    await page.locator('#planning-badge').click();
    await page.waitForFunction(() => document.querySelector('#planning-badge')?.getAttribute('aria-pressed') === 'false');
    await page.waitForFunction(() => window.localStorage.getItem('query:smartFilterOrderingEnabled') === 'false');
    await page.waitForTimeout(900);
    assert.equal(api.getRequests('query_plan').at(-1)?.payload?.smart_query_enabled, false);
    assert.equal(await page.locator('[data-smart-query-state]').textContent(), 'Off');

    await page.reload({ waitUntil: 'load' });
    await waitForAppReady(page, failures);
    await page.waitForFunction(() => document.querySelector('#planning-badge')?.getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('[data-smart-query-state]').textContent(), 'Off');
    await page.locator('#planning-badge').click();
    await page.waitForFunction(() => document.querySelector('#planning-badge')?.getAttribute('aria-pressed') === 'true');
    assert.equal(await page.evaluate(() => window.localStorage.getItem('query:smartFilterOrderingEnabled')), null);
    assert.equal(await page.locator('[data-smart-query-state]').textContent(), 'On');
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});
