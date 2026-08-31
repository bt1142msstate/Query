import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';
import {
  attachFailureListeners,
  closeServer,
  installQueryApiStub,
  listen,
  serveStaticFile,
  smokeFieldDefinitions,
  stubExternalAssets,
  waitForAppReady
} from './support/browserSmokeSupport.mjs';

test('restoring a cookie session loads field metadata once without reloading', { timeout: 30_000 }, async () => {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}/index.html`;
  const failures = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    let mainFrameNavigations = 0;
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) mainFrameNavigations += 1;
    });
    await page.addInitScript(() => {
      sessionStorage.removeItem('query-project.session');
    });
    attachFailureListeners(page, failures, port);
    await stubExternalAssets(page);
    const apiStub = await installQueryApiStub(page);
    apiStub.enqueue({
      action: 'whoami',
      body: JSON.stringify({
        authenticated: true,
        username: 'restored-session-smoke',
        role: 'user',
        display_name: 'Restored Session Smoke'
      }),
      contentType: 'application/json; charset=utf-8'
    });
    apiStub.enqueue({
      action: 'get_fields',
      body: JSON.stringify({ fields: smokeFieldDefinitions }),
      contentType: 'application/json; charset=utf-8',
      delayMs: 250
    });

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 15_000 });
    await waitForAppReady(page, failures);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Add field', exact: true }).click();
    await page.getByRole('button', { name: 'Smoke Title', exact: true }).waitFor({ state: 'visible' });
    const state = await page.evaluate(() => {
      return {
        ready: document.documentElement.dataset.queryAppReady || '',
        session: JSON.parse(sessionStorage.getItem('query-project.session') || 'null')
      };
    });

    assert.equal(mainFrameNavigations, 1, 'cookie restoration should not reload the document');
    assert.equal(apiStub.countAction('whoami'), 1, 'cookie identity should be checked once');
    assert.equal(apiStub.countAction('get_fields'), 1, 'field metadata should be requested once');
    assert.equal(state.ready, 'true');
    assert.equal(state.session?.username, 'restored-session-smoke');
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});
