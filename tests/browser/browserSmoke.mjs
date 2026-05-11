import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
const smokeTemplateResponse = {
  categories: [
    { id: 'smoke', name: 'Smoke', description: 'Smoke test templates' }
  ],
  templates: [
    {
      id: 'smoke-template',
      name: 'Smoke Template',
      description: 'Template used by the browser smoke test.',
      categories: [{ id: 'smoke', name: 'Smoke', description: 'Smoke test templates' }],
      ui_config: {
        DesiredColumnOrder: ['Smoke Title', 'Smoke Branch'],
        Filters: []
      }
    }
  ]
};

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
        body: JSON.stringify(smokeTemplateResponse),
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

function buildHistoryStatusResponse() {
  return {
    queries: {
      'browser-smoke-running': {
        id: 'browser-smoke-running',
        name: 'Mobile running smoke query',
        status: 'running',
        start_time: '2026-05-11 09:00:00',
        row_count: 2,
        request: {
          name: 'Mobile running smoke query',
          ui_config: {
            DesiredColumnOrder: ['Smoke Title', 'Smoke Branch'],
            Filters: {}
          }
        }
      },
      'browser-smoke-complete': {
        id: 'browser-smoke-complete',
        name: 'Mobile completed smoke query',
        status: 'complete',
        start_time: '2026-05-11 08:00:00',
        end_time: '2026-05-11 08:00:04',
        row_count: 3,
        request: {
          name: 'Mobile completed smoke query',
          ui_config: {
            DesiredColumnOrder: ['Smoke Title', 'Smoke Branch', 'Smoke Status'],
            Filters: {}
          }
        }
      }
    }
  };
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
      () => document.documentElement.dataset.queryAppModulesReady === 'true',
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

async function expectDarkSurface(page, selector, label) {
  const theme = await page.locator(selector).evaluate(element => {
    const readChannels = value => (value.match(/\d+/gu) || []).slice(0, 3).map(Number);
    const style = window.getComputedStyle(element);
    const [backgroundRed = 255, backgroundGreen = 255, backgroundBlue = 255] = readChannels(style.backgroundColor);
    const [textRed = 0, textGreen = 0, textBlue = 0] = readChannels(style.color);

    return {
      backgroundLuma: (backgroundRed + backgroundGreen + backgroundBlue) / 3,
      textLuma: (textRed + textGreen + textBlue) / 3
    };
  });

  if (theme.backgroundLuma > 90 || theme.textLuma < 120) {
    throw new Error(`${label} is not using the dark surface theme`);
  }
}

async function expectVisibleCloseControlCount(page, rootSelector, expectedCount, label) {
  const controls = await page.locator(rootSelector).evaluate(root => {
    const isVisible = element => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.05
        && !element.hidden
        && !element.closest('[hidden], .hidden');
    };

    return Array.from(root.querySelectorAll('button')).filter(button => {
      if (!isVisible(button)) {
        return false;
      }

      const labelText = String(button.getAttribute('aria-label') || '').trim();
      const text = String(button.textContent || '').trim();
      return /^Close\b/iu.test(labelText) || text === '×' || text === 'X';
    }).map(button => ({
      ariaLabel: button.getAttribute('aria-label') || '',
      className: button.className,
      text: String(button.textContent || '').trim()
    }));
  });

  if (controls.length !== expectedCount) {
    throw new Error(`${label} should show ${expectedCount} visible close control(s), found ${controls.length}: ${JSON.stringify(controls)}`);
  }
}

async function expectLightInput(page, selector, label) {
  const theme = await page.locator(selector).evaluate(input => {
    const readChannels = value => (value.match(/\d+/gu) || []).slice(0, 3).map(Number);
    const style = window.getComputedStyle(input);
    const [backgroundRed = 0, backgroundGreen = 0, backgroundBlue = 0] = readChannels(style.backgroundColor);
    const [textRed = 255, textGreen = 255, textBlue = 255] = readChannels(style.color);

    return {
      backgroundLuma: (backgroundRed + backgroundGreen + backgroundBlue) / 3,
      textLuma: (textRed + textGreen + textBlue) / 3
    };
  });

  if (theme.backgroundLuma < 180 || theme.textLuma > 120) {
    throw new Error(`${label} is not using the light search theme`);
  }
}

async function expectMinimumTapTarget(page, selector, label, minSize = 44) {
  const targets = await page.locator(selector).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return {
      className: element.className || '',
      display: window.getComputedStyle(element).display,
      height: rect.height,
      id: element.id || '',
      tagName: element.tagName,
      visibility: window.getComputedStyle(element).visibility,
      width: rect.width,
      text: (element.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 60)
    };
  }).filter(target => {
    return target.display !== 'none'
      && target.visibility !== 'hidden'
      && target.height > 0
      && target.width > 0;
  }));

  if (targets.length === 0) {
    throw new Error(`${label} did not find any visible tap targets`);
  }

  const undersized = targets.find(target => target.height < minSize || target.width < minSize);
  if (undersized) {
    throw new Error(`${label} has an undersized tap target: ${JSON.stringify(undersized)}`);
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

async function expectMobileViewportStability(page) {
  const metrics = await page.evaluate(() => {
    const viewportContent = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
    const rootStyle = window.getComputedStyle(document.documentElement);
    const bodyStyle = window.getComputedStyle(document.body);
    const undersizedControls = Array.from(document.querySelectorAll('input, textarea, select'))
      .filter(control => !['checkbox', 'radio', 'range'].includes(String(control.getAttribute('type') || '').toLowerCase()))
      .map(control => {
        const style = window.getComputedStyle(control);
        return {
          fontSize: Number.parseFloat(style.fontSize || '0'),
          id: control.id || '',
          tagName: control.tagName,
          type: control.getAttribute('type') || ''
        };
      })
      .filter(control => control.fontSize < 16);

    return {
      bodyTouchAction: bodyStyle.touchAction,
      rootTouchAction: rootStyle.touchAction,
      undersizedControls,
      viewportContent
    };
  });

  if (
    !/maximum-scale=1(?:\.0)?/u.test(metrics.viewportContent)
    || !/user-scalable=no/u.test(metrics.viewportContent)
  ) {
    throw new Error(`Mobile viewport should prevent browser zoom drift: ${metrics.viewportContent}`);
  }

  if (metrics.rootTouchAction !== 'pan-x pan-y' || metrics.bodyTouchAction !== 'pan-x pan-y') {
    throw new Error(`Mobile root should allow panning but not pinch gestures: ${JSON.stringify(metrics)}`);
  }

  if (metrics.undersizedControls.length > 0) {
    throw new Error(`Mobile text controls should stay at least 16px to avoid focus zoom: ${JSON.stringify(metrics.undersizedControls)}`);
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
  const longTitle = options.longTitle === true;

  await page.evaluate(async ({ longTitle: useLongTitle, rowCount: requestedRowCount }) => {
    const { appServices } = await import('./core/appServices.js');
    const { QueryChangeManager } = await import('./core/queryState.js');
    const { QueryTableView } = await import('./ui/queryTableView.js');
    const { QueryUI } = await import('./ui/queryUI.js');
    const headers = ['Smoke Title', 'Smoke Branch', 'Smoke Status'];
    const makeTitle = title => useLongTitle
      ? `${title} with a deliberately long title for live column resize coverage`
      : title;
    const baseRows = [
      [makeTitle('Alpha record'), 'Main', 'Open'],
      [makeTitle('Beta record'), 'East', 'Closed'],
      [makeTitle('Gamma record'), 'Main', 'Open']
    ];
    const rows = requestedRowCount <= baseRows.length
      ? baseRows.slice(0, requestedRowCount)
      : Array.from({ length: requestedRowCount }, (_, index) => [
        makeTitle(`Smoke record ${String(index + 1).padStart(3, '0')}`),
        index % 2 === 0 ? 'Main' : 'East',
        index % 3 === 0 ? 'Closed' : 'Open'
      ]);
    const columnMap = new Map(headers.map((field, index) => [field, index]));

    QueryChangeManager.replaceDisplayedFields(headers, { source: 'BrowserSmoke.seedLoadedResults' });
    QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'BrowserSmoke.seedLoadedResults', silent: true }
    );
    appServices.setVirtualTableData({ headers, rows, columnMap });
    await QueryTableView.showExampleTable(headers, { syncQueryState: false });
    appServices.renderVirtualTable();
    QueryUI.updateButtonStates();
  }, { longTitle, rowCount });
  await page.locator('#example-table').waitFor({ state: 'attached', timeout: 5000 });
}

async function exerciseEditableFormUrlRefresh(page, failures) {
  await seedLoadedResults(page);
  await page.evaluate(async () => {
    const { QueryFormMode } = await import('./ui/form-mode/formMode.js');
    await QueryFormMode.activateFromCurrentQuery();
  });
  await page.locator('#form-mode-card').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#form-mode-toggle-btn').click();
  await page.waitForFunction(() => !document.body.classList.contains('form-mode-active'), null, { timeout: 5000 });

  const editableUrl = new URL(page.url());
  if (!editableUrl.searchParams.has('form') || editableUrl.searchParams.has('limited') || editableUrl.searchParams.get('mode') !== 'bubbles') {
    throw new Error(`Editable form browser URL should preserve table view without limited mode: ${editableUrl.toString()}`);
  }

  await page.reload({ waitUntil: 'load', timeout: 15000 });
  await waitForAppModules(page, failures);
  const refreshedState = await page.evaluate(async () => {
    const { QueryFormMode } = await import('./ui/form-mode/formMode.js');
    const browserUrl = new URL(window.location.href);
    const shareUrl = new URL(QueryFormMode.buildCurrentShareUrl());
    return {
      active: QueryFormMode.isActive(),
      browserHasLimited: browserUrl.searchParams.has('limited'),
      browserMode: browserUrl.searchParams.get('mode'),
      formModeActiveClass: document.body.classList.contains('form-mode-active'),
      limitedView: QueryFormMode.isLimitedView(),
      shareLimited: shareUrl.searchParams.get('limited')
    };
  });

  if (
    !refreshedState.active
    || refreshedState.limitedView
    || refreshedState.formModeActiveClass
    || refreshedState.browserHasLimited
    || refreshedState.browserMode !== 'bubbles'
    || refreshedState.shareLimited !== '1'
  ) {
    throw new Error(`Refreshing an editable form URL should not enter limited mode, while Share remains limited: ${JSON.stringify(refreshedState)}`);
  }

  const cleanUrl = new URL(page.url());
  cleanUrl.search = '';
  cleanUrl.hash = '';
  await page.goto(cleanUrl.toString(), { waitUntil: 'load', timeout: 15000 });
  await waitForAppModules(page, failures);
}

async function exerciseVirtualTableScrollInteraction(page) {
  await seedLoadedResults(page, { rowCount: 320 });

  const tableContainer = page.locator('#table-container');
  const beforeMetrics = await tableContainer.evaluate(element => ({
    clientHeight: element.clientHeight,
    renderedRowCount: document.querySelectorAll('#example-table tbody tr[data-row-index]').length,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: 0
  }));

  if (beforeMetrics.scrollHeight <= beforeMetrics.clientHeight) {
    throw new Error(`Virtual table is not scrollable: ${JSON.stringify(beforeMetrics)}`);
  }

  if (beforeMetrics.renderedRowCount !== 320) {
    throw new Error(`Ordinary result sets should use native table scrolling; rendered ${beforeMetrics.renderedRowCount} rows`);
  }

  await tableContainer.hover();
  await page.mouse.wheel(0, 9000);
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    const header = document.querySelector('#example-table thead th');
    if (!container || !header) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const visibleRow = document
      .elementFromPoint(containerRect.left + 80, headerRect.bottom + 8)
      ?.closest('tr[data-row-index]');
    return Boolean(container.scrollTop > 500 && Number(visibleRow?.dataset.rowIndex || 0) > 10);
  }, null, { timeout: 5000 });

  const afterMetrics = await tableContainer.evaluate(element => ({
    renderedRowCount: document.querySelectorAll('#example-table tbody tr[data-row-index]').length,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: Number(
      document
        .elementFromPoint(
          element.getBoundingClientRect().left + 80,
          document.querySelector('#example-table thead th').getBoundingClientRect().bottom + 8
        )
        ?.closest('tr[data-row-index]')
        ?.dataset.rowIndex || 0
    )
  }));

  if (afterMetrics.scrollTop <= beforeMetrics.scrollTop || afterMetrics.visibleRowIndexBelowHeader <= beforeMetrics.visibleRowIndexBelowHeader) {
    throw new Error(`Virtual table did not advance after wheel scroll: before=${JSON.stringify(beforeMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(() => {
    const container = document.querySelector('#table-container');
    if (container) {
      container.scrollTop = 0;
    }
  });
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    const track = document.querySelector('.table-scrollbar');
    const thumb = document.querySelector('.table-scrollbar-thumb');
    if (!container || !track || !thumb) {
      return false;
    }

    const trackTop = track.getBoundingClientRect().top;
    const thumbTop = thumb.getBoundingClientRect().top;
    return container.scrollTop === 0 && Math.abs(trackTop - thumbTop) <= 1;
  }, null, { timeout: 5000 });
  await page.locator('.table-scrollbar-thumb').waitFor({ state: 'visible', timeout: 5000 });
  const thumbBox = await page.locator('.table-scrollbar-thumb').boundingBox();
  if (!thumbBox) {
    throw new Error('Virtual table custom scrollbar thumb was not measurable');
  }

  const dragStart = {
    x: Math.floor(thumbBox.x + (thumbBox.width / 2)),
    y: Math.floor(thumbBox.y + Math.min(10, thumbBox.height / 2))
  };
  const dragStartTarget = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y);
    return {
      className: typeof node?.className === 'string' ? node.className : '',
      id: node?.id || '',
      tagName: node?.tagName || ''
    };
  }, dragStart);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x, dragStart.y + 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    return (document.querySelector('#table-container')?.scrollTop || 0) > 1000;
  }, null, { timeout: 5000 }).catch(async error => {
    const dragMetrics = await page.evaluate(() => {
      const container = document.querySelector('#table-container');
      const track = document.querySelector('.table-scrollbar');
      const thumb = document.querySelector('.table-scrollbar-thumb');
      const containerRect = container?.getBoundingClientRect();
      const trackRect = track?.getBoundingClientRect();
      const thumbRect = thumb?.getBoundingClientRect();
      return {
        bodyClass: document.body.className,
        container: container && containerRect ? {
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
          scrollTop: container.scrollTop,
          top: containerRect.top
        } : null,
        customScrollbarVisible: track?.classList.contains('is-visible') || false,
        track: trackRect ? {
          height: trackRect.height,
          top: trackRect.top
        } : null,
        thumb: thumbRect ? {
          height: thumbRect.height,
          top: thumbRect.top
        } : null
      };
    });
    throw new Error(`Virtual table custom scrollbar thumb drag did not scroll far enough: ${JSON.stringify({ ...dragMetrics, dragStart, dragStartTarget })}\n${error.message}`);
  });

  const thumbDragMetrics = await tableContainer.evaluate(element => ({
    customScrollbarVisible: document.querySelector('.table-scrollbar')?.classList.contains('is-visible') || false,
    scrollTop: element.scrollTop,
    visibleRowIndexBelowHeader: Number(
      document
        .elementFromPoint(
          element.getBoundingClientRect().left + 80,
          document.querySelector('#example-table thead th').getBoundingClientRect().bottom + 8
        )
        ?.closest('tr[data-row-index]')
        ?.dataset.rowIndex || 0
    )
  }));

  if (!thumbDragMetrics.customScrollbarVisible || thumbDragMetrics.scrollTop <= 1000 || thumbDragMetrics.visibleRowIndexBelowHeader <= 10) {
    throw new Error(`Virtual table did not advance after scrollbar thumb drag: ${JSON.stringify(thumbDragMetrics)}`);
  }

  await page.evaluate(() => {
    document.body.dataset.browserSmokePreviousMinHeight = document.body.style.minHeight || '';
    document.body.style.minHeight = '1800px';
    window.scrollTo(0, 0);
    const container = document.querySelector('#table-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
  await tableContainer.hover();
  await page.mouse.wheel(0, 2400);
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
  const boundaryMetrics = await page.evaluate(() => ({
    bodyScrollY: window.scrollY,
    tableScrollTop: document.querySelector('#table-container')?.scrollTop || 0
  }));
  await page.evaluate(() => {
    document.body.style.minHeight = document.body.dataset.browserSmokePreviousMinHeight || '';
    delete document.body.dataset.browserSmokePreviousMinHeight;
  });

  if (boundaryMetrics.bodyScrollY !== 0) {
    throw new Error(`Virtual table leaked wheel scrolling to the page at the result boundary: ${JSON.stringify(boundaryMetrics)}`);
  }
}

async function exerciseExpandedVirtualTableColumnAlignment(page) {
  await seedLoadedResults(page, { rowCount: 2400 });

  await page.locator('#table-expand-btn').click();
  await page.locator('#table-shell.table-shell-expanded').waitFor({ state: 'attached', timeout: 5000 });

  const readAlignmentMetrics = () => page.evaluate(() => {
    const container = document.querySelector('#table-container');
    const table = document.querySelector('#example-table');
    const firstRow = table?.querySelector('tbody tr[data-row-index]');
    const headers = Array.from(table?.querySelectorAll('thead th[data-col-index]') || []);
    const cells = Array.from(firstRow?.querySelectorAll('td[data-col-index]') || []);

    if (!container || !table || headers.length === 0 || cells.length < headers.length) {
      return null;
    }

    const headerWidths = headers.map(header => Math.round(header.getBoundingClientRect().width));
    const cellWidths = cells.slice(0, headers.length).map(cell => Math.round(cell.getBoundingClientRect().width));
    const maxDelta = headerWidths.reduce((delta, width, index) => {
      return Math.max(delta, Math.abs(width - cellWidths[index]));
    }, 0);
    const tableWidth = Math.round(table.getBoundingClientRect().width);
    const containerWidth = Math.floor(container.clientWidth);

    return {
      cellWidths,
      containerWidth,
      headerWidths,
      maxDelta,
      tableWidth
    };
  });

  try {
    await page.waitForFunction(() => {
      const container = document.querySelector('#table-container');
      const table = document.querySelector('#example-table');
      const firstRow = table?.querySelector('tbody tr[data-row-index]');
      const headers = Array.from(table?.querySelectorAll('thead th[data-col-index]') || []);
      const cells = Array.from(firstRow?.querySelectorAll('td[data-col-index]') || []);

      if (!container || !table || headers.length === 0 || cells.length < headers.length) {
        return false;
      }

      const headerWidths = headers.map(header => Math.round(header.getBoundingClientRect().width));
      const cellWidths = cells.slice(0, headers.length).map(cell => Math.round(cell.getBoundingClientRect().width));
      const maxDelta = headerWidths.reduce((delta, width, index) => {
        return Math.max(delta, Math.abs(width - cellWidths[index]));
      }, 0);
      const tableWidth = Math.round(table.getBoundingClientRect().width);
      const containerWidth = Math.floor(container.clientWidth);

      return maxDelta <= 1 && tableWidth >= containerWidth - 2;
    }, null, { timeout: 5000 });
  } catch (error) {
    const observedMetrics = await readAlignmentMetrics();
    throw new Error(`Expanded virtual table columns did not align: ${JSON.stringify(observedMetrics)}: ${error.message}`);
  }

  const alignmentMetrics = await readAlignmentMetrics();
  if (alignmentMetrics.maxDelta > 1 || alignmentMetrics.tableWidth < alignmentMetrics.containerWidth - 2) {
    throw new Error(`Expanded virtual table columns are misaligned: ${JSON.stringify(alignmentMetrics)}`);
  }

  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.querySelector('#table-shell')?.classList.contains('table-shell-expanded'), null, { timeout: 5000 });
}

async function exerciseColumnResizeInteraction(page) {
  await seedLoadedResults(page, { longTitle: true, rowCount: 2400 });

  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    appServices.setManualColumnWidth?.('Smoke Title', 90);
    appServices.renderVirtualTable?.();
    appServices.activateColumnResizeMode?.('Smoke Title');
  });

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  const rightHandle = titleHeader.locator('.th-resize-handle-right').first();
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await rightHandle.waitFor({ state: 'visible', timeout: 5000 });

  const beforeMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  if (
    !beforeMetrics.resizeModeActive
    || beforeMetrics.headerWidth <= 0
    || Math.abs(beforeMetrics.headerWidth - beforeMetrics.cellWidth) > 1
    || Math.abs(beforeMetrics.tableWidth - beforeMetrics.rowWidth) > 1
    || !beforeMetrics.text.includes('...')
  ) {
    throw new Error(`Column resize did not start from an aligned active state: ${JSON.stringify(beforeMetrics)}`);
  }

  const handleBox = await rightHandle.boundingBox();
  if (!handleBox) {
    throw new Error('Column resize handle was not measurable');
  }

  const dragStartX = Math.floor(handleBox.x + (handleBox.width / 2));
  const dragStartY = Math.floor(handleBox.y + (handleBox.height / 2));
  const resizeDelta = 620;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + resizeDelta, dragStartY, { steps: 8 });

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 2
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1
      && !(titleCellEl?.textContent || '').includes('...');
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const duringMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  await page.mouse.up();

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 2
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1;
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const afterMetrics = await page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0),
      text: titleCellEl?.textContent?.trim() || '',
      resizeModeActive: document.body.classList.contains('table-resize-mode')
    };
  });

  const liveDelta = duringMetrics.headerWidth - beforeMetrics.headerWidth;
  const actualDelta = afterMetrics.headerWidth - beforeMetrics.headerWidth;
  if (
    Math.abs(liveDelta - resizeDelta) > 2
    || Math.abs(actualDelta - resizeDelta) > 2
    || Math.abs(duringMetrics.headerWidth - duringMetrics.cellWidth) > 1
    || Math.abs(duringMetrics.tableWidth - duringMetrics.rowWidth) > 1
    || duringMetrics.text.includes('...')
    || Math.abs(afterMetrics.headerWidth - afterMetrics.cellWidth) > 1
    || Math.abs(afterMetrics.tableWidth - afterMetrics.rowWidth) > 1
    || afterMetrics.text.includes('...')
  ) {
    throw new Error(`Column resize drag was nonlinear or misaligned: before=${JSON.stringify(beforeMetrics)}, during=${JSON.stringify(duringMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    appServices.clearColumnResizeMode?.();
  });
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
    await page.waitForFunction(async ({ filteredRows, hasPostFilters, totalRows }) => {
      const { appServices } = await import('./core/appServices.js');
      const stats = appServices.getPostFilterStats?.();
      return stats?.filteredRows === filteredRows
        && stats?.totalRows === totalRows
        && appServices.hasPostFilters?.() === hasPostFilters;
    }, expected, { timeout: 5000 });
  } catch (error) {
    const observed = await page.evaluate(async () => {
      const { appServices } = await import('./core/appServices.js');
      const stats = appServices.getPostFilterStats?.();
      return {
        filteredRows: stats?.filteredRows,
        hasPostFilters: appServices.hasPostFilters?.(),
        totalRows: stats?.totalRows
      };
    });
    throw new Error(`${label} expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}: ${error.message}`);
  }

  const observed = await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    const stats = appServices.getPostFilterStats?.();
    return {
      filteredRows: stats?.filteredRows,
      hasPostFilters: appServices.hasPostFilters?.(),
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
  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    const { AppState, QueryChangeManager } = await import('./core/queryState.js');
    const { FilterSidePanel } = await import('./filters/filterSidePanel.js');
    const { fieldDefs, fieldDefsArray, filteredDefs } = await import('./filters/fieldDefs.js');
    const fieldDef = {
      name: 'Smoke Filter Field',
      category: 'Smoke',
      desc: 'Browser interaction coverage field',
      filters: ['equals', 'contains'],
      type: 'string'
    };

    fieldDefs.set(fieldDef.name, fieldDef);
    const existingIndex = fieldDefsArray.findIndex(field => field?.name === fieldDef.name);
    if (existingIndex >= 0) {
      fieldDefsArray.splice(existingIndex, 1);
    }
    fieldDefsArray.unshift(fieldDef);
    filteredDefs.splice(0, filteredDefs.length, fieldDef);
    AppState.currentCategory = 'All';

    QueryChangeManager.setQueryState({
      displayedFields: [],
      activeFilters: {
        [fieldDef.name]: {
          filters: [
            { cond: 'equals', val: 'Smoke Value' }
          ]
        }
      }
    }, { source: 'BrowserSmoke.bubbleFilterInteraction' });

    appServices.rerenderBubbles();
    FilterSidePanel.update();
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

async function exerciseFieldPickerPreviewList(page) {
  await page.evaluate(async () => {
    const { SharedFieldPicker } = await import('./ui/field-picker/fieldPicker.js');
    await SharedFieldPicker.open({
      getOptions: () => [
        { name: 'Preview Smoke Title', type: 'text', filterable: true, category: 'Smoke' },
        { name: 'Preview Smoke Description Match', type: 'text', filterable: true, category: 'Smoke', description: 'Preview Smoke Branch appears here' },
        { name: 'Preview Smoke Branch', type: 'text', filterable: true, category: 'Smoke' },
        { name: 'Preview Smoke Status', type: 'text', filterable: true, category: 'Smoke' }
      ],
      getFieldState: () => ({ display: false, filter: false }),
      labels: {
        description: 'Choose a field for preview-list smoke coverage.',
        footerNote: 'Smoke test field picker preview list.'
      },
      renderFilterPreview(container, fieldName) {
        const preview = document.createElement('div');
        preview.className = 'field-picker-preview-smoke';
        preview.textContent = `Preview controls for ${fieldName}`;
        container.replaceChildren(preview);

        return {
          getState: () => ({ fieldName, operator: 'equals', values: [] }),
          cleanup() {}
        };
      }
    });
  });

  const modal = page.locator('.form-mode-field-picker-modal:not(.hidden)');
  await modal.waitFor({ state: 'visible', timeout: 5000 });

  const optionCount = await modal.locator('.form-mode-field-picker-option').count();
  if (optionCount !== 4) {
    const listText = await modal.locator('.form-mode-field-picker-list').textContent();
    throw new Error(`Field picker with preview rendered ${optionCount} options instead of 4. List text: ${listText}`);
  }

  await modal.locator('.form-mode-field-picker-search').fill('Preview Smoke Branch');
  await page.waitForFunction(() => {
    const options = Array.from(document.querySelectorAll('.form-mode-field-picker-modal:not(.hidden) .form-mode-field-picker-option'));
    return options.length === 2 && /^Preview Smoke Branch/u.test((options[0].textContent || '').trim());
  }, null, { timeout: 5000 });

  await modal.locator('.form-mode-field-picker-close').click();
  await page.locator('.form-mode-field-picker-modal').waitFor({ state: 'detached', timeout: 5000 });
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
  await page.waitForFunction(async () => {
    const { appServices } = await import('./core/appServices.js');
    const state = appServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'asc';
  }, null, { timeout: 5000 });
  const ascIconText = (await titleHeader.locator('.sort-icon').textContent())?.trim();
  if (ascIconText !== '↑') {
    throw new Error(`Desktop sort header did not show ascending state: ${ascIconText}`);
  }

  await titleHeader.click();
  await page.waitForFunction(async () => {
    const { appServices } = await import('./core/appServices.js');
    const state = appServices.getVirtualTableState?.();
    return state?.currentSortColumn === 'Smoke Title' && state?.currentSortDirection === 'desc';
  }, null, { timeout: 5000 });
  const firstTitleCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]').first();
  await firstTitleCell.waitFor({ state: 'visible', timeout: 5000 });
  const firstTitleText = (await firstTitleCell.textContent())?.trim();
  if (firstTitleText !== 'Gamma record') {
    throw new Error(`Desktop descending sort did not move Gamma record first: ${firstTitleText}`);
  }

  await page.evaluate(async () => {
    const { PostFilterSystem } = await import('./table/post-filters/postFilters.js');
    PostFilterSystem.openOverlayForField?.('Smoke Branch');
  });
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
  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    const { QueryUI } = await import('./ui/queryUI.js');
    appServices.replacePostFilters({
      'Smoke Branch': {
        logic: 'all',
        filters: [
          { cond: 'equals', val: 'Main', vals: ['Main'] }
        ]
      }
    }, { refreshView: true, notify: true, resetScroll: true });
    QueryUI.updateButtonStates();
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
  await page.waitForFunction(async () => {
    const { appServices } = await import('./core/appServices.js');
    const { QueryStateReaders } = await import('./core/queryState.js');
    const lifecycle = QueryStateReaders.getLifecycleState();
    const tableData = appServices.getVirtualTableData?.();
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

  const queryStatus = await page.evaluate(async () => {
    const { QueryStateReaders } = await import('./core/queryState.js');
    return QueryStateReaders.getQueryStatus();
  });
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
    await page.evaluate(async () => {
      const { QueryTableView } = await import('./ui/queryTableView.js');
      QueryTableView.renderEmptyQueryTableState();
      document.body.classList.add('form-mode-active');
      QueryTableView.syncEmptyTableMessage();
    });
    const formModeEmptyTableMessage = await page.locator('[data-empty-table-message]').first().textContent();
    if (/drag a bubble/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error('Form mode empty table message still references dragging a bubble');
    }
    if (!/add a field/iu.test(formModeEmptyTableMessage || '')) {
      throw new Error(`Unexpected form mode empty table message: ${formModeEmptyTableMessage}`);
    }
    await page.evaluate(async () => {
      const { QueryTableView } = await import('./ui/queryTableView.js');
      document.body.classList.remove('form-mode-active');
      QueryTableView.syncEmptyTableMessage();
    });

    await exerciseBubbleFilterInteraction(page);
    await exerciseFieldPickerPreviewList(page);
    await exerciseEditableFormUrlRefresh(page, failures);
    await exerciseDesktopResultsWorkflow(page);
    await exerciseZeroResultQueryWorkflow(page, queryApiStub);
    await exerciseVirtualTableScrollInteraction(page);
    await exerciseExpandedVirtualTableColumnAlignment(page);
    await exerciseColumnResizeInteraction(page);

    await page.getByRole('button', { name: 'Queries' }).click();
    await page.locator('input[placeholder="Search queries..."]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkInput(page, '#queries-search', 'Query history search input');

    await page.getByRole('button', { name: 'Templates' }).click();
    await page.locator('input[placeholder="Search templates"]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkSurface(page, '#templates-panel > h2', 'Templates panel header');
    await expectDarkInput(page, '#templates-search-input', 'Templates search input');
    await page.locator('#templates-list .templates-list-item').click();
    await page.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(page, '#templates-panel', 1, 'Desktop template detail overlay');
    await page.locator('#templates-detail-close-btn').click();
    await page.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await page.getByRole('button', { name: 'Help' }).click();

    const mobilePage = await browser.newPage({
      isMobile: true,
      viewport: { width: 390, height: 844 }
    });
    attachFailureListeners(mobilePage, failures, port);
    await stubExternalAssets(mobilePage);
    const mobileQueryApiStub = await installQueryApiStub(mobilePage);
    await mobilePage.goto(baseUrl, { waitUntil: 'load', timeout: 15000 });
    await waitForAppModules(mobilePage, failures);
    await expectMobileViewportStability(mobilePage);

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
    const initialMobileFocusLayout = await mobilePage.evaluate(() => {
      const formCard = document.querySelector('#form-mode-card');
      const tableSection = document.querySelector('#table-with-filter');
      const formRect = formCard?.getBoundingClientRect();
      const tableStyles = tableSection ? window.getComputedStyle(tableSection) : null;
      return {
        formVisible: Boolean(formRect && formRect.width > 0 && formRect.height > 0),
        formTop: formRect?.top ?? 0,
        tableDisplay: tableStyles?.display || '',
        hasLoadedData: document.body.classList.contains('has-loaded-data'),
        hasQueryColumns: document.body.classList.contains('has-query-columns')
      };
    });
    if (!initialMobileFocusLayout.formVisible || initialMobileFocusLayout.formTop > 120) {
      throw new Error(`Mobile form should be the first visible workflow: ${JSON.stringify(initialMobileFocusLayout)}`);
    }
    if (initialMobileFocusLayout.tableDisplay !== 'none') {
      throw new Error(`Empty mobile form mode should not show the result table first: ${JSON.stringify(initialMobileFocusLayout)}`);
    }

    await mobilePage.locator('#mobile-menu-toggle').click();
    await mobilePage.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
    const mobileMenuMetrics = await mobilePage.locator('#mobile-menu-dropdown.show').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        height: rect.height,
        viewportHeight: window.innerHeight
      };
    });
    if (mobileMenuMetrics.bottomGap > 1 || mobileMenuMetrics.height > mobileMenuMetrics.viewportHeight * 0.86) {
      throw new Error(`Mobile menu should open as a bottom sheet: ${JSON.stringify(mobileMenuMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '#mobile-menu-dropdown .mobile-menu-item', 'Mobile menu items');
    const mobileMenuLabels = await mobilePage.locator('#mobile-menu-dropdown .mobile-menu-item').evaluateAll(items => {
      return items.map(item => (item.textContent || '').trim().replace(/\s+/gu, ' '));
    });
    ['Run Query', 'Multi-value Export', 'JSON', 'Queries', 'Templates', 'Help'].forEach(expectedLabel => {
      if (!mobileMenuLabels.some(label => label.includes(expectedLabel))) {
        throw new Error(`Mobile menu is missing "${expectedLabel}": ${JSON.stringify(mobileMenuLabels)}`);
      }
    });
    await expectNoHorizontalOverflow(mobilePage, 'Mobile menu');
    mobileQueryApiStub.enqueue(Array.from({ length: 4 }, () => ({
      action: 'status',
      body: JSON.stringify(buildHistoryStatusResponse()),
      contentType: 'application/json; charset=utf-8'
    })));
    await mobilePage.locator('[data-source-control-id="toggle-queries"]').click();
    await mobilePage.locator('#queries-search').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#queries-panel', 'Mobile query history panel');
    await expectDarkInput(mobilePage, '#queries-search', 'Mobile query history search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile query history panel');
    await mobilePage.waitForFunction(() => {
      return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1'
        && document.querySelector('[data-history-book="running"] .history-book-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });
    const mobileHistoryPickerMetrics = await mobilePage.locator('.history-bookshelf').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const hero = document.querySelector('.history-editorial-hero');
      const books = Array.from(element.querySelectorAll('[data-history-book]')).map(book => {
        const bookRect = book.getBoundingClientRect();
        return {
          bottom: bookRect.bottom,
          height: bookRect.height,
          top: bookRect.top,
          width: bookRect.width
        };
      }).filter(book => book.width > 0 && book.height > 0);

      return {
        bookCount: books.length,
        bottom: rect.bottom,
        columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
        height: rect.height,
        heroDisplay: hero ? window.getComputedStyle(hero).display : '',
        maxBookHeight: Math.max(...books.map(book => book.height)),
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileHistoryPickerMetrics.heroDisplay !== 'none'
      || mobileHistoryPickerMetrics.bookCount !== 4
      || mobileHistoryPickerMetrics.columns < 2
      || mobileHistoryPickerMetrics.height > 180
      || mobileHistoryPickerMetrics.maxBookHeight > 90
      || mobileHistoryPickerMetrics.bottom > mobileHistoryPickerMetrics.viewportHeight * 0.55
    ) {
      throw new Error(`Mobile history status picker should keep all status choices visible without a long scroll: ${JSON.stringify(mobileHistoryPickerMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '[data-history-book] .history-book-summary', 'Mobile history status cards');
    await mobilePage.locator('[data-history-book="complete"] .history-book-summary').click();
    await mobilePage.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.history-monitor', 'Mobile query history monitor');
    await expectMinimumTapTarget(mobilePage, '.history-monitor-close, .history-monitor-tab, .history-monitor .history-expand-btn, .history-monitor .load-query-btn, .history-monitor .rerun-query-btn', 'Mobile history monitor controls');
    const mobileHistoryMonitorMetrics = await mobilePage.locator('.history-monitor').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const stageRect = element.querySelector('.history-monitor-stage')?.getBoundingClientRect();
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        position: window.getComputedStyle(element).position,
        stageHeight: stageRect?.height || 0,
        top: rect.top
      };
    });
    if (mobileHistoryMonitorMetrics.position !== 'fixed' || mobileHistoryMonitorMetrics.top > 80 || mobileHistoryMonitorMetrics.bottomGap > 1 || mobileHistoryMonitorMetrics.stageHeight < 120) {
      throw new Error(`Mobile history monitor should open as a visible sheet: ${JSON.stringify(mobileHistoryMonitorMetrics)}`);
    }
    await mobilePage.locator('.history-monitor-close').click();
    await mobilePage.locator('.history-monitor').waitFor({ state: 'detached', timeout: 5000 });

    await openMobilePanel(mobilePage, 'toggle-json', '#query-json-tree');
    await expectElementWithinViewport(mobilePage, '#json-panel', 'Mobile JSON panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile JSON panel');

    await openMobilePanel(mobilePage, 'toggle-templates', '#templates-search-input');
    await expectElementWithinViewport(mobilePage, '#templates-panel', 'Mobile templates panel');
    await expectDarkSurface(mobilePage, '#templates-panel > h2', 'Mobile templates panel header');
    await expectDarkInput(mobilePage, '#templates-search-input', 'Mobile templates search input');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile templates panel');
    await mobilePage.locator('#templates-list .templates-list-item').click();
    await mobilePage.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template detail overlay');
    await mobilePage.locator('#templates-detail-close-btn').click();
    await mobilePage.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
    await mobilePage.locator('#templates-manage-categories-btn').click();
    await mobilePage.locator('#templates-categories-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template categories overlay');
    await mobilePage.locator('#templates-categories-close-btn').click();
    await mobilePage.locator('#templates-categories-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await openMobilePanel(mobilePage, 'toggle-help', '#help-container');
    await expectElementWithinViewport(mobilePage, '#help-panel', 'Mobile help panel');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile help panel');

    await mobilePage.evaluate(async () => {
      const { appServices } = await import('./core/appServices.js');
      appServices.closeAllModals();
    });
    await mobilePage.locator('#help-panel.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await seedLoadedResults(mobilePage);
    await mobilePage.locator('#table-with-filter').waitFor({ state: 'visible', timeout: 5000 });
    const mobileResultsLayout = await mobilePage.evaluate(() => {
      const visibleTop = selector => {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        const styles = element ? window.getComputedStyle(element) : null;
        return rect
          && rect.width > 0
          && rect.height > 0
          && styles?.display !== 'none'
          && styles?.visibility !== 'hidden'
          ? rect.top
          : Number.POSITIVE_INFINITY;
      };
      const tableRect = document.querySelector('#table-with-filter')?.getBoundingClientRect();
      const builderContent = document.querySelector('#mobile-builder-content');
      const builderToggle = document.querySelector('#mobile-builder-toggle');
      const mobileActionBar = document.querySelector('#mobile-table-action-bar');
      const desktopToolbar = document.querySelector('#table-toolbar');
      const filterSidePanel = document.querySelector('#filter-side-panel');
      return {
        actionBarDisplay: mobileActionBar ? window.getComputedStyle(mobileActionBar).display : '',
        actionBarPosition: mobileActionBar ? window.getComputedStyle(mobileActionBar).position : '',
        bubbleTop: visibleTop('#field-bubble-stage'),
        builderCollapsed: builderContent ? window.getComputedStyle(builderContent).display === 'none' : false,
        builderExpanded: builderToggle?.getAttribute('aria-expanded') || '',
        builderToggleDisplay: builderToggle ? window.getComputedStyle(builderToggle).display : '',
        filterPanelDisplay: filterSidePanel ? window.getComputedStyle(filterSidePanel).display : '',
        formTop: visibleTop('#form-mode-card'),
        hasLoadedData: document.body.classList.contains('has-loaded-data'),
        hasQueryColumns: document.body.classList.contains('has-query-columns'),
        searchTop: visibleTop('#field-search-section'),
        tableToolbarDisplay: desktopToolbar ? window.getComputedStyle(desktopToolbar).display : '',
        tableTop: tableRect?.top ?? Number.POSITIVE_INFINITY
      };
    });
    if (
      !mobileResultsLayout.hasLoadedData
      || !mobileResultsLayout.hasQueryColumns
      || mobileResultsLayout.tableTop > mobileResultsLayout.formTop + 1
      || mobileResultsLayout.tableTop > mobileResultsLayout.bubbleTop + 1
      || mobileResultsLayout.tableTop > mobileResultsLayout.searchTop + 1
    ) {
      throw new Error(`Mobile table should be the first main-screen surface once display fields exist: ${JSON.stringify(mobileResultsLayout)}`);
    }
    if (
      mobileResultsLayout.actionBarDisplay === 'none'
      || mobileResultsLayout.actionBarPosition !== 'sticky'
      || mobileResultsLayout.builderToggleDisplay === 'none'
      || !mobileResultsLayout.builderCollapsed
      || mobileResultsLayout.builderExpanded !== 'false'
      || mobileResultsLayout.filterPanelDisplay !== 'none'
      || mobileResultsLayout.tableToolbarDisplay !== 'none'
    ) {
      throw new Error(`Mobile table should use a sticky action bar and collapsed builder drawer: ${JSON.stringify(mobileResultsLayout)}`);
    }
    const mobileTableDensityMetrics = await mobilePage.locator('#table-container').evaluate(container => {
      const table = document.querySelector('#example-table');
      const cell = document.querySelector('#example-table tbody td');
      const containerRect = container.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const cellStyle = cell ? window.getComputedStyle(cell) : null;
      return {
        cellFontSize: cellStyle ? Number.parseFloat(cellStyle.fontSize) : 0,
        containerWidth: containerRect.width,
        tableWidth: tableRect?.width || 0
      };
    });
    if (
      mobileTableDensityMetrics.tableWidth > mobileTableDensityMetrics.containerWidth + 4
      || mobileTableDensityMetrics.cellFontSize < 11.2
      || mobileTableDensityMetrics.cellFontSize > 12.5
    ) {
      throw new Error(`Mobile table should use balanced compact density so more columns are visible without making text too small: ${JSON.stringify(mobileTableDensityMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '#mobile-table-action-bar .mobile-table-action', 'Mobile table action bar controls');
    const mobileActionLabels = await mobilePage.locator('#mobile-table-action-bar .mobile-table-action').evaluateAll(buttons => {
      return buttons.map(button => (button.textContent || '').trim().replace(/\s+/gu, ' '));
    });
    ['Run', 'Fields', 'Add', 'Filters', 'Export', 'Expand', 'Clear'].forEach(expectedLabel => {
      if (!mobileActionLabels.includes(expectedLabel)) {
        throw new Error(`Mobile table action bar is missing "${expectedLabel}": ${JSON.stringify(mobileActionLabels)}`);
      }
    });
    const mobileActionBarMetrics = await mobilePage.locator('#mobile-table-action-bar').evaluate(element => ({
      clientWidth: element.clientWidth,
      height: element.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth
    }));
    if (mobileActionBarMetrics.scrollWidth - mobileActionBarMetrics.clientWidth > 2 || mobileActionBarMetrics.height > 128) {
      throw new Error(`Mobile table action bar should show all actions without horizontal scrolling: ${JSON.stringify(mobileActionBarMetrics)}`);
    }
    await expectMinimumTapTarget(mobilePage, '#mobile-builder-toggle', 'Mobile builder drawer toggle');

    await mobilePage.locator('#mobile-builder-toggle').click();
    await mobilePage.waitForFunction(() => {
      const content = document.querySelector('#mobile-builder-content');
      return content && window.getComputedStyle(content).display !== 'none';
    }, null, { timeout: 5000 });
    const mobileBuilderOpenLayout = await mobilePage.evaluate(() => {
      const tableRect = document.querySelector('#table-with-filter')?.getBoundingClientRect();
      const builderRect = document.querySelector('#mobile-builder-drawer')?.getBoundingClientRect();
      return {
        builderExpanded: document.querySelector('#mobile-builder-toggle')?.getAttribute('aria-expanded') || '',
        builderTop: builderRect?.top ?? 0,
        tableTop: tableRect?.top ?? 0
      };
    });
    if (mobileBuilderOpenLayout.builderExpanded !== 'true' || mobileBuilderOpenLayout.builderTop < mobileBuilderOpenLayout.tableTop - 1) {
      throw new Error(`Mobile builder drawer should expand below the table: ${JSON.stringify(mobileBuilderOpenLayout)}`);
    }
    await mobilePage.locator('#mobile-builder-toggle').click();

    await mobilePage.locator('[data-mobile-table-action="fields-panel"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#filter-side-panel', 'Mobile display and filters sheet');
    await expectMinimumTapTarget(mobilePage, '#filter-panel-mobile-close', 'Mobile display and filters close button');
    const mobileFilterSheetMetrics = await mobilePage.locator('#filter-side-panel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const body = document.querySelector('#filter-panel-body');
      return {
        bottomGap: Math.abs(window.innerHeight - rect.bottom),
        bodyText: (body?.textContent || '').trim().replace(/\s+/gu, ' '),
        display: window.getComputedStyle(element).display,
        position: window.getComputedStyle(element).position,
        top: rect.top
      };
    });
    if (
      mobileFilterSheetMetrics.position !== 'fixed'
      || mobileFilterSheetMetrics.display === 'none'
      || mobileFilterSheetMetrics.top < 48
      || mobileFilterSheetMetrics.bottomGap > 24
      || !/Smoke Title/u.test(mobileFilterSheetMetrics.bodyText)
    ) {
      throw new Error(`Mobile display and filters should open as a usable sheet: ${JSON.stringify(mobileFilterSheetMetrics)}`);
    }
    await expectNoHorizontalOverflow(mobilePage, 'Mobile display and filters sheet');
    await mobilePage.locator('#filter-panel-mobile-close').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    const closedMobileFilterDisplay = await mobilePage.locator('#filter-side-panel').evaluate(element => window.getComputedStyle(element).display);
    if (closedMobileFilterDisplay !== 'none') {
      throw new Error(`Closed mobile display and filters sheet should not sit above the table: ${closedMobileFilterDisplay}`);
    }

    await mobilePage.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
    await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-field-picker-modal:not(.hidden)', 'Mobile add field dialog');
    await expectLightInput(mobilePage, '.form-mode-field-picker-search-field input[type="search"]', 'Mobile add field search input');
    await expectMinimumTapTarget(mobilePage, '.form-mode-field-picker-close, .form-mode-field-picker-category-select, .form-mode-field-picker-option', 'Mobile add field controls');
    const mobileAddFieldMetrics = await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').evaluate(modal => {
      const modalRect = modal.getBoundingClientRect();
      const listRect = modal.querySelector('.form-mode-field-picker-list')?.getBoundingClientRect();
      const detailsRect = modal.querySelector('.form-mode-field-picker-details')?.getBoundingClientRect();
      const footer = modal.querySelector('.form-mode-field-picker-footer');
      return {
        bottomGap: Math.abs(window.innerHeight - modalRect.bottom),
        detailsHeight: detailsRect?.height || 0,
        detailsTop: detailsRect?.top || 0,
        footerDisplay: footer ? window.getComputedStyle(footer).display : '',
        listBottom: listRect?.bottom || 0,
        listHeight: listRect?.height || 0,
        top: modalRect.top,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileAddFieldMetrics.top > 16
      || mobileAddFieldMetrics.bottomGap > 16
      || mobileAddFieldMetrics.footerDisplay !== 'none'
      || mobileAddFieldMetrics.listHeight < 240
      || mobileAddFieldMetrics.detailsHeight > mobileAddFieldMetrics.viewportHeight * 0.42
      || mobileAddFieldMetrics.listBottom > mobileAddFieldMetrics.detailsTop + 1
    ) {
      throw new Error(`Mobile add field picker should be a non-overlapping full-height sheet: ${JSON.stringify(mobileAddFieldMetrics)}`);
    }
    await expectNoHorizontalOverflow(mobilePage, 'Mobile add field dialog');
    await mobilePage.locator('.form-mode-field-picker-close').click();

    const mobileRunAction = mobilePage.locator('[data-mobile-table-action-target="run-query-btn"]');
    const mobileRunDisabled = await mobileRunAction.evaluate(button => button.disabled);
    if (mobileRunDisabled) {
      throw new Error('Mobile run action is disabled after seeding display fields');
    }
    mobileQueryApiStub.enqueue({
      body: 'Mobile run result|Main|Open\n',
      contentType: 'text/plain; charset=utf-8',
      rawColumns: smokeResultHeaders
    });
    await mobileRunAction.click();
    await mobilePage.waitForFunction(() => {
      return document.querySelector('#table-results-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });

    await mobilePage.locator('[data-mobile-table-action-target="table-expand-btn"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#table-shell.table-shell-expanded', 'Mobile expanded table');
    await mobilePage.locator('#table-expand-btn').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

    await mobilePage.locator('[data-mobile-table-action-target="post-filter-btn"]').click();
    await mobilePage.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#post-filter-overlay .post-filter-dialog', 'Mobile post filter dialog');
    await expectMinimumTapTarget(mobilePage, '#post-filter-overlay .post-filter-dialog__close, #post-filter-field, #post-filter-operator, #post-filter-logic, #post-filter-add-btn, #post-filter-clear-btn, #post-filter-done-btn', 'Mobile post filter controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile post filter dialog');

    await mobilePage.locator('#post-filter-operator').selectOption('equals');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').waitFor({ state: 'visible', timeout: 5000 });
    await expectMinimumTapTarget(mobilePage, '#post-filter-value-picker-host .form-mode-popup-list-trigger', 'Mobile post filter value picker trigger');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').click();
    await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-popup-list-popup:not([hidden])', 'Mobile popup list picker');
    await expectLightInput(mobilePage, '.form-mode-popup-list-popup input[type="search"]', 'Mobile popup list search input');
    await expectMinimumTapTarget(mobilePage, '.form-mode-popup-list-done', 'Mobile popup list done control');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile popup list picker');
    await mobilePage.locator('.form-mode-popup-list-done').click();
    await mobilePage.locator('#post-filter-done-btn').click();

    const mobileExportAction = mobilePage.locator('[data-mobile-table-action-target="download-btn"]');
    await mobileExportAction.scrollIntoViewIfNeeded();
    const downloadDisabled = await mobileExportAction.evaluate(button => button.disabled);
    if (downloadDisabled) {
      throw new Error('Download button is disabled after seeding loaded mobile results');
    }
    await mobileExportAction.click();
    await mobilePage.locator('#export-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#export-overlay .export-dialog', 'Mobile export dialog');
    await expectMinimumTapTarget(mobilePage, '#export-overlay-close, #export-cancel-btn, #export-confirm-btn', 'Mobile export dialog controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile export dialog');
    await mobilePage.locator('#export-cancel-btn').click();

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
