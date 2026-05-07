import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const QUERY_API_PATTERN = /^https:\/\/mlp\.sirsi\.net\/uhtbin\/query_api\.pl/u;
const smokeResultHeaders = ['Smoke Title', 'Smoke Branch', 'Smoke Status'];
const smokeFieldDefinitions = [
  {
    name: 'Smoke Title',
    category: 'Smoke',
    desc: 'Smoke-test title field',
    filters: ['contains', 'equals'],
    type: 'string'
  },
  {
    name: 'Smoke Branch',
    category: 'Smoke',
    desc: 'Smoke-test branch field',
    filters: ['contains', 'equals'],
    type: 'string',
    values: [
      { Name: 'Main', RawValue: 'Main' },
      { Name: 'East', RawValue: 'East' }
    ]
  },
  {
    name: 'Smoke Status',
    category: 'Smoke',
    desc: 'Smoke-test status field',
    filters: ['contains', 'equals'],
    type: 'string',
    values: [
      { Name: 'Open', RawValue: 'Open' },
      { Name: 'Closed', RawValue: 'Closed' }
    ]
  }
];

function contentTypeFor(filePath) {
  return mimeTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function isInsideRoot(filePath) {
  return filePath === rootDir || filePath.startsWith(rootDir + sep);
}

async function serveStaticFile(req, res) {
  try {
    const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const decodedPath = decodeURIComponent(pathname);
    const filePath = resolve(rootDir, `.${decodedPath}`);

    if (!isInsideRoot(filePath)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypeFor(filePath)
    });
    res.end(body);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(500);
    res.end('Internal server error');
  }
}

async function listen(server) {
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  return server.address().port;
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close(error => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function stubExternalAssets(page) {
  await page.route(/^https?:\/\/fonts\.(googleapis|gstatic)\.com\/.*/u, route => {
    route.fulfill({
      body: '',
      contentType: route.request().resourceType() === 'stylesheet'
        ? 'text/css; charset=utf-8'
        : 'application/octet-stream',
      status: 200
    });
  });

  await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/tailwindcss@.*\/dist\/tailwind\.min\.css/u, route => {
    route.fulfill({
      body: '',
      contentType: 'text/css; charset=utf-8',
      status: 200
    });
  });

  await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/exceljs@.*\/dist\/exceljs\.min\.js/u, route => {
    route.fulfill({
      body: 'window.ExcelJS = window.ExcelJS || { Workbook: class Workbook {} };',
      contentType: 'text/javascript; charset=utf-8',
      status: 200
    });
  });

  await page.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/autonumeric@.*\/dist\/autoNumeric\.min\.js/u, route => {
    route.fulfill({
      body: `
        window.AutoNumeric = class AutoNumeric {
          constructor(element, initialValue = '') {
            this.element = element;
            if (this.element && initialValue !== '') {
              this.element.value = String(initialValue);
            }
          }

          getNumericString() {
            return this.element ? this.element.value : '';
          }

          remove() {}

          set(value) {
            if (this.element) {
              this.element.value = value == null ? '' : String(value);
            }
          }
        };
      `,
      contentType: 'text/javascript; charset=utf-8',
      status: 200
    });
  });
}

function parseQueryApiPayload(request) {
  try {
    return JSON.parse(request.postData() || '{}');
  } catch (_) {
    return {};
  }
}

function buildDefaultQueryApiResponse(payload) {
  switch (payload.action) {
    case 'get_fields':
      return {
        body: JSON.stringify({ fields: smokeFieldDefinitions }),
        contentType: 'application/json; charset=utf-8'
      };
    case 'list_templates':
      return {
        body: JSON.stringify({ categories: [], templates: [] }),
        contentType: 'application/json; charset=utf-8'
      };
    case 'status':
      return {
        body: JSON.stringify({ queries: {} }),
        contentType: 'application/json; charset=utf-8'
      };
    case 'cancel':
      return {
        body: JSON.stringify({ ok: true }),
        contentType: 'application/json; charset=utf-8'
      };
    default:
      return {};
  }
}

async function installQueryApiStub(page) {
  const queuedResponses = [];

  const handler = route => {
    const request = route.request();
    const corsHeaders = {
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Query-Id, X-Raw-Columns'
    };

    if (request.method() === 'OPTIONS') {
      route.fulfill({
        body: '',
        headers: corsHeaders,
        status: 204
      });
      return;
    }

    const payload = parseQueryApiPayload(request);
    const queuedResponseIndex = queuedResponses.findIndex(response => !response.action || response.action === payload.action);
    const response = queuedResponseIndex === -1
      ? buildDefaultQueryApiResponse(payload)
      : queuedResponses.splice(queuedResponseIndex, 1)[0];
    route.fulfill({
      body: response.body || '',
      contentType: response.contentType || 'text/plain; charset=utf-8',
      headers: {
        ...corsHeaders,
        'X-Query-Id': response.queryId || 'browser-smoke-query',
        'X-Raw-Columns': (response.rawColumns || smokeResultHeaders).join('|')
      },
      status: response.status || 200
    });
  };

  await page.route(QUERY_API_PATTERN, handler);

  return {
    async dispose() {
      await page.unroute(QUERY_API_PATTERN, handler);
    },
    enqueue(responses) {
      queuedResponses.push(...(Array.isArray(responses) ? responses : [responses]));
    }
  };
}

function attachFailureListeners(page, failures, port) {
  page.on('console', message => {
    if (['error', 'warning', 'warn'].includes(message.type())) {
      failures.push(`console ${message.type()}: ${message.text()}`);
    }
  });

  page.on('pageerror', error => {
    failures.push(`page error: ${error.stack || error.message}`);
  });

  page.on('requestfailed', request => {
    if (request.url().startsWith(`http://127.0.0.1:${port}/`)) {
      failures.push(`request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
    }
  });
}

async function waitForAppModules(page, failures) {
  try {
    await page.waitForFunction(
      () => window.__QUERY_APP_MODULES_READY === true,
      null,
      { timeout: 15000 }
    );
  } catch (error) {
    failures.push(`module loader did not finish: ${error.message}`);
  }
}

async function expectDarkInput(page, selector, label) {
  const theme = await page.locator(selector).evaluate(input => {
    const readChannels = value => (value.match(/\d+/gu) || []).slice(0, 3).map(Number);
    const style = window.getComputedStyle(input);
    const [backgroundRed = 255, backgroundGreen = 255, backgroundBlue = 255] = readChannels(style.backgroundColor);
    const [textRed = 0, textGreen = 0, textBlue = 0] = readChannels(style.color);

    return {
      backgroundLuma: (backgroundRed + backgroundGreen + backgroundBlue) / 3,
      textLuma: (textRed + textGreen + textBlue) / 3
    };
  });

  if (theme.backgroundLuma > 80 || theme.textLuma < 160) {
    throw new Error(`${label} is not using the dark search theme`);
  }
}

async function expectNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    return {
      bodyScrollWidth: body.scrollWidth,
      clientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth
    };
  });

  const widestContent = Math.max(metrics.rootScrollWidth, metrics.bodyScrollWidth);
  if (widestContent - metrics.clientWidth > 2) {
    throw new Error(`${label} overflows horizontally: ${widestContent}px content in ${metrics.clientWidth}px viewport`);
  }
}

async function expectElementWithinViewport(page, selector, label) {
  const metrics = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      bottom: rect.bottom,
      display: style.display,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      visibility: style.visibility,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width
    };
  });

  if (metrics.display === 'none' || metrics.visibility === 'hidden' || metrics.width <= 0 || metrics.height <= 0) {
    throw new Error(`${label} is not visible`);
  }

  if (metrics.left < -2 || metrics.right - metrics.viewportWidth > 2) {
    throw new Error(`${label} is outside the horizontal viewport bounds`);
  }

  if (metrics.top < -2 || metrics.bottom - metrics.viewportHeight > 2) {
    throw new Error(`${label} is outside the vertical viewport bounds`);
  }
}

async function openMobilePanel(page, sourceControlId, visibleSelector) {
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator(`[data-source-control-id="${sourceControlId}"]`).click();
  await page.locator(visibleSelector).waitFor({ state: 'visible', timeout: 5000 });
}

async function seedLoadedResults(page, options = {}) {
  const rowCount = Math.max(0, Number(options.rowCount) || 3);

  await page.evaluate(async ({ rowCount: requestedRowCount }) => {
    const headers = ['Smoke Title', 'Smoke Branch', 'Smoke Status'];
    const baseRows = [
      ['Alpha record', 'Main', 'Open'],
      ['Beta record', 'East', 'Closed'],
      ['Gamma record', 'Main', 'Open']
    ];
    const rows = requestedRowCount <= baseRows.length
      ? baseRows.slice(0, requestedRowCount)
      : Array.from({ length: requestedRowCount }, (_, index) => [
        `Smoke record ${String(index + 1).padStart(3, '0')}`,
        index % 2 === 0 ? 'Main' : 'East',
        index % 3 === 0 ? 'Closed' : 'Open'
      ]);
    const columnMap = new Map(headers.map((field, index) => [field, index]));

    window.QueryChangeManager.replaceDisplayedFields(headers, { source: 'BrowserSmoke.seedLoadedResults' });
    window.QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'BrowserSmoke.seedLoadedResults', silent: true }
    );
    window.AppServices.setVirtualTableData({ headers, rows, columnMap });
    await window.QueryTableView.showExampleTable(headers, { syncQueryState: false });
    window.AppServices.renderVirtualTable();
    window.QueryUI?.updateButtonStates?.();
  }, { rowCount });
  await page.locator('#example-table').waitFor({ state: 'attached', timeout: 5000 });
}

async function exerciseVirtualTableScrollInteraction(page) {
  await seedLoadedResults(page, { rowCount: 320 });

  const tableContainer = page.locator('#table-container');
  const beforeMetrics = await tableContainer.evaluate(element => ({
    clientHeight: element.clientHeight,
    firstRenderedRowIndex: Number(document.querySelector('#example-table tbody tr[data-row-index]')?.dataset.rowIndex || 0),
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));

  if (beforeMetrics.scrollHeight <= beforeMetrics.clientHeight) {
    throw new Error(`Virtual table is not scrollable: ${JSON.stringify(beforeMetrics)}`);
  }

  await tableContainer.hover();
  await page.mouse.wheel(0, 9000);
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    const firstRenderedRowIndex = Number(document.querySelector('#example-table tbody tr[data-row-index]')?.dataset.rowIndex || 0);
    return Boolean(container && container.scrollTop > 500 && firstRenderedRowIndex > 10);
  }, null, { timeout: 5000 });

  const afterMetrics = await tableContainer.evaluate(element => ({
    firstRenderedRowIndex: Number(document.querySelector('#example-table tbody tr[data-row-index]')?.dataset.rowIndex || 0),
    scrollTop: element.scrollTop
  }));

  if (afterMetrics.scrollTop <= beforeMetrics.scrollTop || afterMetrics.firstRenderedRowIndex <= beforeMetrics.firstRenderedRowIndex) {
    throw new Error(`Virtual table did not advance after wheel scroll: before=${JSON.stringify(beforeMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }
}

async function expectEmptyTableMessage(page, expectedPattern, label) {
  await page.locator('#example-table tbody td').first().waitFor({ state: 'visible', timeout: 5000 });
  const message = (await page.locator('#example-table tbody td').first().textContent())?.trim() || '';
  if (!expectedPattern.test(message)) {
    throw new Error(`${label} expected empty table message ${expectedPattern}, received "${message}"`);
  }
}

async function expectResultsCount(page, expectedText, label) {
  await page.locator('#table-results-badge').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(expected => {
    return document.querySelector('#table-results-count')?.textContent?.trim() === expected;
  }, expectedText, { timeout: 5000 });

  const actualText = (await page.locator('#table-results-count').textContent())?.trim();
  if (actualText !== expectedText) {
    throw new Error(`${label} expected ${expectedText} results text, received ${actualText}`);
  }
}

async function expectPostFilterStats(page, expected, label) {
  try {
    await page.waitForFunction(({ filteredRows, hasPostFilters, totalRows }) => {
      const stats = window.AppServices.getPostFilterStats?.();
      return stats?.filteredRows === filteredRows
        && stats?.totalRows === totalRows
        && window.AppServices.hasPostFilters?.() === hasPostFilters;
    }, expected, { timeout: 5000 });
  } catch (error) {
    const observed = await page.evaluate(() => {
      const stats = window.AppServices.getPostFilterStats?.();
      return {
        filteredRows: stats?.filteredRows,
        hasPostFilters: window.AppServices.hasPostFilters?.(),
        totalRows: stats?.totalRows
      };
    });
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}: ${error.message}`);
  }

  const observed = await page.evaluate(() => {
    const stats = window.AppServices.getPostFilterStats?.();
    return {
      filteredRows: stats?.filteredRows,
      hasPostFilters: window.AppServices.hasPostFilters?.(),
      totalRows: stats?.totalRows
    };
  });

  if (
    observed.filteredRows !== expected.filteredRows
    || observed.totalRows !== expected.totalRows
    || observed.hasPostFilters !== expected.hasPostFilters
  ) {
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}`);
  }
}

async function exerciseBubbleFilterInteraction(page) {
  await page.evaluate(() => {
    const fieldDef = {
      name: 'Smoke Filter Field',
      category: 'Smoke',
      desc: 'Browser interaction coverage field',
      filters: ['equals', 'contains'],
      type: 'string'
    };

    window.fieldDefs.set(fieldDef.name, fieldDef);
    window.fieldDefsArray = [
      fieldDef,
      ...(Array.isArray(window.fieldDefsArray)
        ? window.fieldDefsArray.filter(field => field?.name !== fieldDef.name)
        : [])
    ];
    window.filteredDefs = [fieldDef];
    window.AppState.currentCategory = 'All';

    window.QueryChangeManager.setQueryState({
      displayedFields: [],
      activeFilters: {
        [fieldDef.name]: {
          filters: [
            { cond: 'equals', val: 'Smoke Value' }
          ]
        }
      }
    }, { source: 'BrowserSmoke.bubbleFilterInteraction' });

    window.BubbleSystem.safeRenderBubbles();
    window.FilterSidePanel.update();
  });

  const activeBubble = page.locator('#bubble-list .bubble[data-filtered="true"]', {
    hasText: 'Smoke Filter Field'
  }).first();
  await activeBubble.waitFor({ state: 'attached', timeout: 5000 });

  const tooltipHtml = await activeBubble.getAttribute('data-tooltip-html');
  if (!tooltipHtml || !tooltipHtml.includes('Smoke Value')) {
    throw new Error('Filtered bubble tooltip did not include the active filter value');
  }

  await page.locator('.fp-cond-text', { hasText: 'Smoke Value' }).waitFor({ state: 'attached', timeout: 5000 });
}

async function exerciseDesktopResultsWorkflow(page) {
  await seedLoadedResults(page);
  await expectResultsCount(page, '3', 'Desktop seeded results');
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop seeded post filter state');

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await titleHeader.click();
  await page.waitForFunction(() => {
    const state = window.AppServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'asc';
  }, null, { timeout: 5000 });
  const ascIconText = (await titleHeader.locator('.sort-icon').textContent())?.trim();
  if (ascIconText !== '↑') {
    throw new Error(`Desktop sort header did not show ascending state: ${ascIconText}`);
  }

  await titleHeader.click();
  await page.waitForFunction(() => {
    const state = window.AppServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'desc';
  }, null, { timeout: 5000 });
  const firstTitleCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]').first();
  await firstTitleCell.waitFor({ state: 'visible', timeout: 5000 });
  const firstTitleText = (await firstTitleCell.textContent())?.trim();
  if (firstTitleText !== 'Gamma record') {
    throw new Error(`Desktop descending sort did not move Gamma record first: ${firstTitleText}`);
  }

  await page.evaluate(() => window.PostFilterSystem.openOverlayForField?.('Smoke Branch'));
  await page.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '#post-filter-overlay .post-filter-dialog', 'Desktop post filter dialog');
  await page.locator('#post-filter-field').selectOption('Smoke Branch');
  await page.locator('#post-filter-operator').selectOption('contains');
  await page.locator('#post-filter-value').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#post-filter-value').fill('Main');
  await page.locator('#post-filter-add-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 2,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop applied post filter state');
  await expectResultsCount(page, '2 of 3', 'Desktop filtered results');
  await page.locator('#post-filter-list .post-filter-pill', { hasText: 'Main' }).waitFor({ state: 'visible', timeout: 5000 });

  await page.locator('#post-filter-clear-btn').click();
  await expectPostFilterStats(page, {
    filteredRows: 3,
    hasPostFilters: false,
    totalRows: 3
  }, 'Desktop cleared post filter state');
  await expectResultsCount(page, '3', 'Desktop restored results');
  await page.locator('#post-filter-done-btn').click();
  await page.locator('#post-filter-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

  await page.locator('#download-btn').scrollIntoViewIfNeeded();
  const downloadDisabled = await page.locator('#download-btn').evaluate(button => button.disabled);
  if (downloadDisabled) {
    throw new Error('Download button is disabled after desktop result interactions');
  }
  await page.locator('#download-btn').click();
  await page.locator('#export-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  await expectElementWithinViewport(page, '#export-overlay .export-dialog', 'Desktop export dialog');
  await page.locator('[data-export-mode-card="grouped"]').click();
  await page.waitForFunction(() => {
    return /grouped sheet/iu.test(document.querySelector('#export-group-preview')?.textContent || '');
  }, null, { timeout: 5000 });
  await page.locator('#export-cancel-btn').click();
  await page.locator('#export-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
}

async function exerciseZeroResultQueryWorkflow(page, queryApiStub) {
  await seedLoadedResults(page);
  await page.evaluate(() => {
    window.AppServices.replacePostFilters({
      'Smoke Branch': {
        logic: 'all',
        filters: [
          { cond: 'equals', val: 'Main', vals: ['Main'] }
        ]
      }
    }, { refreshView: true, notify: true, resetScroll: true });
    window.QueryUI?.updateButtonStates?.();
  });
  await expectPostFilterStats(page, {
    filteredRows: 2,
    hasPostFilters: true,
    totalRows: 3
  }, 'Desktop pre-run post filter state');

  queryApiStub.enqueue([
    {
      action: 'run',
      body: '',
      queryId: 'browser-smoke-zero-results',
      rawColumns: smokeResultHeaders
    }
  ]);

  await page.locator('#run-query-btn').click();
  await page.waitForFunction(() => {
    const lifecycle = window.QueryStateReaders.getLifecycleState();
    const tableData = window.AppServices.getVirtualTableData?.();
    return lifecycle.queryRunning === false
      && lifecycle.hasLoadedResultSet === true
      && lifecycle.currentQueryId === 'browser-smoke-zero-results'
      && Array.isArray(tableData?.rows)
      && tableData.rows.length === 0;
  }, null, { timeout: 10000 });

  await expectPostFilterStats(page, {
    filteredRows: 0,
    hasPostFilters: false,
    totalRows: 0
  }, 'Desktop post-filter state after zero-result query');
  await expectResultsCount(page, '0', 'Desktop zero-result query');
  await expectEmptyTableMessage(page, /no results matched this query/iu, 'Desktop zero-result query');

  const queryStatus = await page.evaluate(() => window.QueryStateReaders.getQueryStatus());
  if (queryStatus !== 'results') {
    throw new Error(`Zero-result query should be treated as loaded results, received query status "${queryStatus}"`);
  }

  const isPlanningMode = await page.evaluate(() => document.body.classList.contains('is-planning'));
  if (isPlanningMode) {
    throw new Error('Zero-result query left the UI in planning mode');
  }
}

async function runSmokeTest() {
  const server = createServer(serveStaticFile);
  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}/index.html`;
  let browser;
  let page;
  const failures = [];

  try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    attachFailureListeners(page, failures, port);

    await stubExternalAssets(page);
    const queryApiStub = await installQueryApiStub(page);
    await page.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppModules(page, failures);

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

    await expectNoHorizontalOverflow(page, 'Desktop initial layout');
    await expectDarkInput(page, '#query-input', 'Main field search input');
    await page.evaluate(() => {
      window.QueryTableView.renderEmptyQueryTableState();
      document.body.classList.add('form-mode-active');
      window.QueryTableView.syncEmptyTableMessage();
    });
    const formModeEmptyTableMessage = await page.locator('[data-empty-table-message]').first().textContent();
    if (/drag a bubble/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error('Form mode empty table message still references dragging a bubble');
    }
    if (!/add a field/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error(`Unexpected form mode empty table message: ${formModeEmptyTableMessage}`);
    }
    await page.evaluate(() => {
      document.body.classList.remove('form-mode-active');
      window.QueryTableView.syncEmptyTableMessage();
    });

    await exerciseBubbleFilterInteraction(page);
    await exerciseDesktopResultsWorkflow(page);
    await exerciseZeroResultQueryWorkflow(page, queryApiStub);
    await exerciseVirtualTableScrollInteraction(page);

    await page.getByRole('button', { name: 'Queries' }).click();
    await page.locator('input[placeholder="Search queries..."]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkInput(page, '#queries-search', 'Query history search input');

    await page.getByRole('button', { name: 'Templates' }).click();
    await page.locator('input[placeholder="Search templates"]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkInput(page, '#templates-search-input', 'Templates search input');

    await page.getByRole('button', { name: 'Help' }).click();

    const mobilePage = await browser.newPage({
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    attachFailureListeners(mobilePage, failures, port);
    await stubExternalAssets(mobilePage);
    await installQueryApiStub(mobilePage);
    await mobilePage.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppModules(mobilePage, failures);

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

    await mobilePage.locator('#mobile-menu-toggle').waitFor({ state: 'visible', timeout: 5000 });
    const desktopControlsDisplay = await mobilePage.locator('#header-controls').evaluate(element => {
      return window.getComputedStyle(element).display;
    });
    if (desktopControlsDisplay !== 'none') {
      throw new Error(`Desktop header controls are visible on mobile: display=${desktopControlsDisplay}`);
    }

    await expectNoHorizontalOverflow(mobilePage, 'Mobile initial layout');
    await mobilePage.locator('#mobile-menu-toggle').click();
    await mobilePage.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
    await expectNoHorizontalOverflow(mobilePage, 'Mobile menu');
    await mobilePage.locator('[data-source-control-id="toggle-queries"]').click();
    await mobilePage.locator('#queries-search').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#queries-panel', 'Mobile query history panel');
    await expectDarkInput(mobilePage, '#queries-search', 'Mobile query history search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile query history panel');

    await openMobilePanel(mobilePage, 'toggle-json', '#query-json-tree');
    await expectElementWithinViewport(mobilePage, '#json-panel', 'Mobile JSON panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile JSON panel');

    await openMobilePanel(mobilePage, 'toggle-templates', '#templates-search-input');
    await expectElementWithinViewport(mobilePage, '#templates-panel', 'Mobile templates panel');
    await expectDarkInput(mobilePage, '#templates-search-input', 'Mobile templates search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile templates panel');

    await openMobilePanel(mobilePage, 'toggle-help', '#help-container');
    await expectElementWithinViewport(mobilePage, '#help-panel', 'Mobile help panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile help panel');

    await mobilePage.evaluate(() => window.modalManager?.closeAllPanels?.());
    await mobilePage.locator('#help-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await seedLoadedResults(mobilePage);
    await mobilePage.evaluate(() => window.PostFilterSystem.open());
    await mobilePage.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#post-filter-overlay .post-filter-dialog', 'Mobile post filter dialog');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile post filter dialog');

    await mobilePage.locator('#post-filter-operator').selectOption('equals');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').waitFor({ state: 'visible', timeout: 5000 });
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').click();
    await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-popup-list-popup:not([hidden])', 'Mobile popup list picker');
    await expectDarkInput(mobilePage, '.form-mode-popup-list-popup input[type="search"]', 'Mobile popup list search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile popup list picker');
    await mobilePage.locator('.form-mode-popup-list-done').click();
    await mobilePage.locator('#post-filter-done-btn').click();

    await mobilePage.locator('#download-btn').scrollIntoViewIfNeeded();
    const downloadDisabled = await mobilePage.locator('#download-btn').evaluate(button => button.disabled);
    if (downloadDisabled) {
      throw new Error('Download button is disabled after seeding loaded mobile results');
    }
    await mobilePage.locator('#download-btn').click();
    await mobilePage.locator('#export-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#export-overlay .export-dialog', 'Mobile export dialog');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile export dialog');
    await mobilePage.locator('#export-cancel-btn').click();

    await mobilePage.evaluate(async () => {
      const { SharedFieldPicker } = await import('./ui/fieldPicker.js');
      SharedFieldPicker.open({
        getOptions: () => [
          { name: 'Mobile Field A', type: 'text', filterable: true, category: 'Smoke' },
          { name: 'Mobile Field B', type: 'date', filterable: true, category: 'Smoke' },
          { name: 'Mobile Field C', type: 'money', filterable: false, category: 'Smoke' }
        ],
        getFieldState: () => ({ display: false, filter: false }),
        labels: {
          description: 'Choose a field for mobile smoke coverage.',
          footerNote: 'Smoke test field picker.'
        }
      });
    });
    await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-field-picker-modal:not(.hidden)', 'Mobile field picker dialog');
    await expectDarkInput(mobilePage, '.form-mode-field-picker-search-field input[type="search"]', 'Mobile field picker search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile field picker dialog');
    await mobilePage.locator('.form-mode-field-picker-close').click();

    if (failures.length > 0) {
      throw new Error(`Browser smoke test failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
    }

    console.log(`Browser smoke test passed: ${baseUrl}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await closeServer(server);
  }
}

runSmokeTest().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
