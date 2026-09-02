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

function buildPlannedOrderResponse(fields) {
  const evidenceByField = {
    'Catalog Key': { reason: 'bounded record identifiers', estimated_share: 0 },
    'Copy Hold Count': { reason: 'equi-depth private histogram', estimated_share: 0.08 },
    'Total Checkouts': { reason: 'equi-depth private histogram', estimated_share: 0.35 }
  };
  return {
    action: 'query_plan',
    body: JSON.stringify({
      ok: true,
      data: {
        schema_version: 2,
        strategy: 'cost_based_routes_v2',
        changed: true,
        order: fields.map((field, index) => ({
          field,
          original_position: fields.length - index,
          planned_position: index + 1,
          ...(evidenceByField[field] || { reason: 'complete route cost' })
        })),
        eta: {
          available: true,
          method: 'stage_cost_model_v2',
          confidence: 'medium',
          requires_comparable_history: false,
          expected_candidates: 12,
          expected_scanned_records: 100,
          expected_output_rows: 12,
          expected_output_bytes: 2400,
          p50_seconds: 1,
          p80_seconds: 2,
          p90_seconds: 3,
          basis: 'Planner browser test',
          stages: [{ id: 'selector_scan', label: 'Selector scan', p50_seconds: 1 }],
          warnings: [],
          label: 'Likely 1–2 sec'
        },
        route: { selected: ['selcatalog', 'selitem'], alternatives_compared: 2 },
        explanation: 'The planner selected the lowest-cost route.'
      }
    }),
    contentType: 'application/json; charset=utf-8'
  };
}

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

    const placement = await page.evaluate(() => {
      const headerControls = document.querySelector('#header-controls');
      const smartOrdering = document.querySelector('#planning-badge');
      const overlay = document.querySelector('#query-plan-overlay');
      const preview = document.querySelector('#query-plan-preview');
      const table = document.querySelector('#table-container');
      const previewRect = preview?.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      return {
        smartOrderingParent: smartOrdering?.parentElement?.id || '',
        smartOrderingInHeader: headerControls?.contains(smartOrdering) === true,
        previewInOverlay: overlay?.contains(preview) === true,
        previewCenterOffsetX: previewRect && tableRect
          ? Math.abs((previewRect.left + previewRect.width / 2) - (tableRect.left + tableRect.width / 2))
          : Infinity,
        previewCenterOffsetY: previewRect && tableRect
          ? Math.abs((previewRect.top + previewRect.height / 2) - (tableRect.top + tableRect.height / 2))
          : Infinity
      };
    });
    assert.equal(placement.smartOrderingParent, 'header-controls');
    assert.equal(placement.smartOrderingInHeader, true);
    assert.equal(placement.previewInOverlay, true);
    assert.ok(placement.previewCenterOffsetX < 2);
    assert.ok(placement.previewCenterOffsetY < 2);

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

test('smart ordering visibly arranges filters and a manual move turns it off', { timeout: 30000 }, async () => {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const failures = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      sessionStorage.setItem('query-project.session', JSON.stringify({
        token: 'smart-order-session', username: 'smart-order', role: 'admin'
      }));
    });
    attachFailureListeners(page, failures, port);
    await stubExternalAssets(page);
    const api = await installQueryApiStub(page);
    api.enqueue(buildPlannedOrderResponse(['Catalog Key', 'Copy Hold Count', 'Total Checkouts']));
    const form = encodeFormSpecForUrl({
      title: 'Smart filter order',
      queryName: 'Smart filter order',
      columns: ['Title', 'Item Id'],
      inputs: [
        { key: 'total-checkouts', field: 'Total Checkouts', source: 'query-filter', label: 'Total Checkouts', operator: 'greater', required: false, multiple: false, hidden: false, type: 'number', defaultValue: '1' },
        { key: 'copy-holds', field: 'Copy Hold Count', source: 'query-filter', label: 'Copy Hold Count', operator: 'greater', required: false, multiple: false, hidden: false, type: 'number', defaultValue: '0' },
        { key: 'catalog-key', field: 'Catalog Key', source: 'query-filter', label: 'Catalog Key', operator: 'equals', required: false, multiple: false, hidden: false, type: 'text', defaultValue: '12345' }
      ],
      lockedFilters: []
    });
    await page.goto(`http://127.0.0.1:${port}/index.html?form=${form}`, { waitUntil: 'load' });
    await waitForAppReady(page, failures);
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.fp-filter-list > .fp-field-group'))
        .map(group => group.dataset.field);
      return names.join('|') === 'Catalog Key|Copy Hold Count|Total Checkouts';
    }, null, { timeout: 7000 });

    assert.equal(await page.locator('#planning-badge').getAttribute('aria-pressed'), 'true');
    assert.equal(api.countAction('query_plan'), 1);
    assert.deepEqual(await page.locator('.form-mode-field .form-mode-label').allTextContents(), [
      'Catalog Key',
      'Copy Hold Count',
      'Total Checkouts'
    ]);

    await page.locator('#query-plan-preview').click();
    const explanation = await page.locator('.query-plan-order-explanation').textContent();
    assert.match(explanation || '', /Why this order\?/u);
    assert.match(explanation || '', /complete valid routes/u);
    assert.match(explanation || '', /Catalog Key.*exact record key/us);
    assert.match(explanation || '', /Copy Hold Count.*8% of records/us);
    assert.match(explanation || '', /Total Checkouts.*35% of records/us);
    await page.keyboard.press('Escape');

    await page.locator('.fp-field-group[data-field="Total Checkouts"] .fp-filter-order-btn-up').click();
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.fp-filter-list > .fp-field-group'))
        .map(group => group.dataset.field);
      return names.join('|') === 'Catalog Key|Total Checkouts|Copy Hold Count'
        && document.querySelector('#planning-badge')?.getAttribute('aria-pressed') === 'false';
    }, null, { timeout: 7000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('query:smartFilterOrderingEnabled')), 'false');
    assert.match(await page.locator('#toast-container').textContent(), /Smart ordering is off/u);
    assert.deepEqual(await page.locator('.form-mode-field .form-mode-label').allTextContents(), [
      'Catalog Key',
      'Total Checkouts',
      'Copy Hold Count'
    ]);
    await page.waitForTimeout(900);
    assert.equal(api.getRequests('query_plan').at(-1)?.payload?.smart_query_enabled, false);

    api.enqueue(buildPlannedOrderResponse(['Catalog Key', 'Copy Hold Count', 'Total Checkouts']));
    await page.locator('#planning-badge').click();
    await page.waitForFunction(() => {
      const names = Array.from(document.querySelectorAll('.fp-filter-list > .fp-field-group'))
        .map(group => group.dataset.field);
      return names.join('|') === 'Catalog Key|Copy Hold Count|Total Checkouts'
        && document.querySelector('#planning-badge')?.getAttribute('aria-pressed') === 'true';
    }, null, { timeout: 7000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('query:smartFilterOrderingEnabled')), null);
    assert.deepEqual(failures, []);
  } finally {
    await browser?.close();
    await closeServer(server);
  }
});
