import { createServer } from 'node:http';
import { chromium } from 'playwright';

import {
  closeServer,
  installQueryApiStub,
  listen,
  serveStaticFile,
  smokeFieldDefinitions,
  stubExternalAssets,
  waitForAppReady
} from '../tests/browser/support/browserSmokeSupport.mjs';

const DEFAULT_ROWS = [200000, 500000];
const INTERACTION_BUDGET_MS = 300;

function readArgValue(name, fallback = '') {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find(value => value === name || value.startsWith(prefix));
  if (!arg) return fallback;
  if (arg === name) return 'true';
  return arg.slice(prefix.length);
}

function readRows() {
  const raw = readArgValue('--rows', DEFAULT_ROWS.join(','));
  const rows = raw
    .split(',')
    .map(value => Number.parseInt(value.trim(), 10))
    .filter(value => Number.isFinite(value) && value > 0);
  return rows.length ? rows : DEFAULT_ROWS;
}

function readCollapseModes() {
  const raw = readArgValue('--collapse', 'both').trim().toLowerCase();
  if (['true', 'on', 'yes'].includes(raw)) return [true];
  if (['false', 'off', 'no'].includes(raw)) return [false];
  return [false, true];
}

function shouldAssertBudget() {
  return process.argv.includes('--assert');
}

async function seedStressResults(page, { rowCount, collapseDuplicates }) {
  return page.evaluate(async ({ rowCount: requestedRows, collapseDuplicates: collapseRows }) => {
    const { appServices } = await import('./src/core/appServices.js');
    const { appUiActions } = await import('./src/core/appUiActions.js');
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryTableView } = await import('./src/ui/queryTableView.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');

    const headers = ['Stress Title', 'Stress Branch', 'Stress Status'];
    const rows = Array.from({ length: requestedRows }, (_, index) => [
      `Stress title ${String(index + 1).padStart(6, '0')}`,
      index % 4 === 0 ? 'Main\x1FEast' : (index % 2 === 0 ? 'Main' : 'East'),
      index % 3 === 0 ? 'Closed' : 'Open'
    ]);
    const columnMap = new Map(headers.map((field, index) => [field, index]));

    window.localStorage?.setItem?.('query-project.split-columns-mode', 'stacked');
    appServices.setSplitColumnsMode(false);
    appUiActions.resetSplitColumnsToggleUI();
    QueryChangeManager.replaceDisplayedFields(headers, { source: 'TableInteractionBenchmark.seed' });
    QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'TableInteractionBenchmark.seed', silent: true }
    );

    const setDataStartedAt = performance.now();
    appServices.setDuplicateRowCollapseMode(collapseRows, {
      notify: false,
      refreshView: false,
      recalculateWidths: false,
      toast: false
    });
    appServices.setVirtualTableData({ headers, rows, columnMap });
    const setDataMs = performance.now() - setDataStartedAt;

    const renderStartedAt = performance.now();
    await QueryTableView.showExampleTable(headers, { syncQueryState: false });
    appServices.renderVirtualTable();
    QueryUI.updateButtonStates();
    appUiActions.updateSplitColumnsToggleState();
    const renderMs = performance.now() - renderStartedAt;

    return { renderMs, setDataMs };
  }, { collapseDuplicates, rowCount });
}

async function measureSplitToggleClick(page) {
  return page.evaluate(async () => {
    function getHeaders() {
      return Array.from(document.querySelectorAll('#example-table thead th[data-col-index]'))
        .map(header => header.getAttribute('data-sort-field') || header.textContent.trim());
    }

    function getDisplayFields() {
      return Array.from(document.querySelectorAll('.fp-display-name')).map(name => name.textContent.trim());
    }

    async function waitForRenderedState(predicate) {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
        if (predicate()) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          return true;
        }
      }
      return false;
    }

    const toggleButton = document.getElementById('split-columns-toggle');
    const startedAt = performance.now();
    toggleButton?.click();
    const rendered = await waitForRenderedState(() => getHeaders().includes('Stress Branch 2'));
    return {
      displayFields: getDisplayFields(),
      durationMs: performance.now() - startedAt,
      headers: getHeaders(),
      rendered,
      toggleButtonFound: Boolean(toggleButton)
    };
  });
}

async function measureMove(page) {
  return page.evaluate(async () => {
    const displayItem = Array.from(document.querySelectorAll('.fp-display-item'))
      .find(item => (item.textContent || '').includes('Stress Branch 1'));
    const moveButton = displayItem?.querySelector('.fp-display-btn-down');

    function getHeaders() {
      return Array.from(document.querySelectorAll('#example-table thead th[data-col-index]'))
        .map(header => header.getAttribute('data-sort-field') || header.textContent.trim());
    }

    function getDisplayFields() {
      return Array.from(document.querySelectorAll('.fp-display-name')).map(name => name.textContent.trim());
    }

    async function waitForRenderedState(predicate) {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
        if (predicate()) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          return true;
        }
      }
      return false;
    }

    const startedAt = performance.now();
    moveButton?.click();
    const rendered = await waitForRenderedState(() => getHeaders().join('|') === 'Stress Title|Stress Status|Stress Branch 1|Stress Branch 2');
    return {
      displayFields: getDisplayFields(),
      durationMs: performance.now() - startedAt,
      headers: getHeaders(),
      moveButtonFound: Boolean(moveButton),
      rendered
    };
  });
}

async function measureRemoval(page) {
  return page.evaluate(async () => {
    const displayItem = Array.from(document.querySelectorAll('.fp-display-item'))
      .find(item => (item.textContent || '').includes('Stress Branch 2'));
    const removeButton = displayItem?.querySelector('.fp-display-btn-remove');

    function getHeaders() {
      return Array.from(document.querySelectorAll('#example-table thead th[data-col-index]'))
        .map(header => header.getAttribute('data-sort-field') || header.textContent.trim());
    }

    function getDisplayFields() {
      return Array.from(document.querySelectorAll('.fp-display-name')).map(name => name.textContent.trim());
    }

    async function waitForRenderedState(predicate) {
      const deadline = performance.now() + 3000;
      while (performance.now() < deadline) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 0));
        if (predicate()) {
          await new Promise(resolve => requestAnimationFrame(resolve));
          return true;
        }
      }
      return false;
    }

    const startedAt = performance.now();
    removeButton?.click();
    const rendered = await waitForRenderedState(() => getHeaders().join('|') === 'Stress Title|Stress Status');
    return {
      displayFields: getDisplayFields(),
      durationMs: performance.now() - startedAt,
      headers: getHeaders(),
      removeButtonFound: Boolean(removeButton),
      rendered
    };
  });
}

async function readDeferredState(page) {
  await page.waitForTimeout(1700);
  return page.evaluate(() => ({
    displayFields: Array.from(document.querySelectorAll('.fp-display-name')).map(name => name.textContent.trim()),
    headers: Array.from(document.querySelectorAll('#example-table thead th[data-col-index]'))
      .map(header => header.getAttribute('data-sort-field') || header.textContent.trim()),
    renderedRows: document.querySelectorAll('#example-table tbody tr[data-row-index]').length,
    usesVirtualBody: document.querySelector('#example-table tbody')?.classList.contains('query-table-virtual-body') || false
  }));
}

async function resetSplitMode(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    appServices.setSplitColumnsMode(false);
  });
}

function assertCase(result) {
  const failures = [];
  if (result.splitToggle.durationMs > INTERACTION_BUDGET_MS) {
    failures.push(`split toggle ${Math.round(result.splitToggle.durationMs)}ms`);
  }
  if (result.move.durationMs > INTERACTION_BUDGET_MS) {
    failures.push(`move ${Math.round(result.move.durationMs)}ms`);
  }
  if (result.removal.durationMs > INTERACTION_BUDGET_MS) {
    failures.push(`removal ${Math.round(result.removal.durationMs)}ms`);
  }
  if (!result.splitToggle.toggleButtonFound || !result.splitToggle.rendered) {
    failures.push('split toggle did not render expected split headers');
  }
  if (!result.move.moveButtonFound || !result.move.rendered) {
    failures.push('move button did not render expected order');
  }
  if (!result.removal.removeButtonFound) {
    failures.push('remove button missing');
  }
  if (!result.removal.rendered) {
    failures.push('removal did not render expected headers');
  }
  if (!result.afterDeferredSync.usesVirtualBody) {
    failures.push('virtual body inactive after sync');
  }
  if (failures.length) {
    throw new Error(`Interaction budget failed for ${result.rowCount} rows, collapse=${result.collapseDuplicates}: ${failures.join(', ')}`);
  }
}

async function run() {
  const rows = readRows();
  const collapseModes = readCollapseModes();
  const assertBudget = shouldAssertBudget();
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];
  const results = [];

  page.on('console', message => {
    if (['error', 'warning'].includes(message.type())) {
      failures.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', error => {
    failures.push(`pageerror: ${error.message}`);
  });

  try {
    await stubExternalAssets(page);
    const queryApiStub = await installQueryApiStub(page);
    queryApiStub.enqueue({
      action: 'get_fields',
      body: JSON.stringify({ fields: smokeFieldDefinitions }),
      contentType: 'application/json; charset=utf-8'
    });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 15000 });
    await waitForAppReady(page, failures);

    for (const rowCount of rows) {
      for (const collapseDuplicates of collapseModes) {
        const setup = await seedStressResults(page, { collapseDuplicates, rowCount });
        await page.waitForTimeout(500);
        const splitToggle = await measureSplitToggleClick(page);
        const move = await measureMove(page);
        const removal = await measureRemoval(page);
        const afterDeferredSync = await readDeferredState(page);
        const result = { afterDeferredSync, collapseDuplicates, move, removal, rowCount, setup, splitToggle };
        if (assertBudget) {
          assertCase(result);
        }
        results.push(result);
        await resetSplitMode(page);
      }
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }

  if (assertBudget && failures.length) {
    throw new Error(`Browser warnings/errors during benchmark:\n${failures.join('\n')}`);
  }

  console.log(JSON.stringify({ budgetMs: INTERACTION_BUDGET_MS, failures, results }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
