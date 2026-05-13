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
    const fulfillResponse = () => route.fulfill({
      body: response.body || '',
      contentType: response.contentType || 'text/plain; charset=utf-8',
      headers: {
        ...corsHeaders,
        'X-Query-Id': response.queryId || 'browser-smoke-query',
        'X-Raw-Columns': (response.rawColumns || smokeResultHeaders).join('|')
      },
      status: response.status || 200
    });

    if (response.delayMs) {
      setTimeout(fulfillResponse, response.delayMs);
      return;
    }

    fulfillResponse();
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

const nonSelectableControlSelector = [
  'button',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'a[href]',
  'summary',
  '[role="button"]',
  '.collapse-btn',
  '.mobile-menu-item',
  '.mobile-table-action',
  '.mobile-builder-toggle',
  '.table-toolbar-btn',
  '.th-insert-button',
  '.templates-primary-btn',
  '.templates-secondary-btn',
  '.templates-danger-btn',
  '.templates-categories-close',
  '.templates-list-item',
  '.templates-list-pin-btn',
  '.pinned-template-bubble',
  '.history-book-summary',
  '.history-monitor-tab',
  '.history-monitor-close',
  '.history-expand-btn',
  '.load-query-btn',
  '.rerun-query-btn',
  '.stop-query-btn',
  '.filter-panel-mobile-close',
  '.fp-icon-btn',
  '.fp-display-item',
  '.fp-display-btn',
  '.fp-display-insert-btn',
  '.fp-field-group',
  '.fp-cond-btn',
  '.fp-add-cond-btn',
  '.post-filter-dialog__close',
  '.post-filter-add-btn',
  '.export-dialog__close',
  '.export-action-btn'
].join(', ');

async function expectControlsNonSelectable(page, rootSelector, label) {
  const violations = await page.locator(rootSelector).evaluate((root, selector) => {
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
    const isTapHighlightTransparent = value => {
      const normalized = String(value || '').replace(/\s+/gu, '').toLowerCase();
      return normalized === ''
        || normalized === 'transparent'
        || normalized === 'rgba(0,0,0,0)';
    };

    return Array.from(root.querySelectorAll(selector))
      .filter(isVisible)
      .map(element => {
        const style = window.getComputedStyle(element);
        return {
          className: String(element.className || ''),
          id: element.id || '',
          tagName: element.tagName,
          tapHighlight: style.webkitTapHighlightColor || '',
          text: String(element.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 80),
          userSelect: style.userSelect || '',
          webkitUserSelect: style.webkitUserSelect || ''
        };
      })
      .filter(control => (
        control.userSelect !== 'none'
        || (control.webkitUserSelect && control.webkitUserSelect !== 'none')
        || !isTapHighlightTransparent(control.tapHighlight)
      ));
  }, nonSelectableControlSelector);

  if (violations.length > 0) {
    throw new Error(`${label} has selectable/highlightable controls: ${JSON.stringify(violations.slice(0, 12))}`);
  }
}

async function expectMobileTableTextNonSelectable(page) {
  await page.locator('#example-table tbody td[data-col-index="0"]').first().waitFor({ state: 'visible', timeout: 5000 });
  const violations = await page.locator('#example-table').evaluate(table => {
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
    const isTapHighlightTransparent = value => {
      const normalized = String(value || '').replace(/\s+/gu, '').toLowerCase();
      return normalized === ''
        || normalized === 'transparent'
        || normalized === 'rgba(0,0,0,0)';
    };

    return Array.from(table.querySelectorAll('th[data-col-index], td[data-col-index], th[data-col-index] *, td[data-col-index] *'))
      .filter(isVisible)
      .map(element => {
        const style = window.getComputedStyle(element);
        return {
          className: String(element.className || ''),
          id: element.id || '',
          tagName: element.tagName,
          tapHighlight: style.webkitTapHighlightColor || '',
          text: String(element.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 80),
          userSelect: style.userSelect || '',
          webkitTouchCallout: style.webkitTouchCallout || '',
          webkitUserSelect: style.webkitUserSelect || ''
        };
      })
      .filter(cell => (
        cell.userSelect !== 'none'
        || (cell.webkitUserSelect && cell.webkitUserSelect !== 'none')
        || (cell.webkitTouchCallout && cell.webkitTouchCallout !== 'none')
        || !isTapHighlightTransparent(cell.tapHighlight)
      ));
  });

  if (violations.length > 0) {
    throw new Error(`Mobile table cells should not be selectable/highlightable: ${JSON.stringify(violations.slice(0, 12))}`);
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

async function waitForResponsiveResize(page, expectedMobile) {
  await page.waitForFunction(expected => {
    return window.matchMedia('(max-width: 1024px)').matches === expected;
  }, expectedMobile, { timeout: 5000 });
  await page.evaluate(() => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));
}

async function readResponsiveShellMetrics(page) {
  return page.evaluate(() => {
    const displayOf = selector => {
      const element = document.querySelector(selector);
      return element ? window.getComputedStyle(element).display : '';
    };
    const classHas = (selector, className) => {
      return document.querySelector(selector)?.classList.contains(className) || false;
    };
    const tableShell = document.querySelector('#table-shell');
    const tableRect = document.querySelector('#example-table')?.getBoundingClientRect();
    const tableContainerRect = document.querySelector('#table-container')?.getBoundingClientRect();

    return {
      actionBarDisplay: displayOf('#mobile-table-action-bar'),
      bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
      bodyModalPanelOpen: document.body.classList.contains('modal-panel-open'),
      builderActive: classHas('#mobile-builder-drawer', 'is-active'),
      builderOpen: classHas('#mobile-builder-drawer', 'is-open'),
      builderExpanded: document.querySelector('#mobile-builder-toggle')?.getAttribute('aria-expanded') || '',
      filterPanelMobileOpen: document.body.classList.contains('mobile-filter-panel-open')
        || classHas('#filter-side-panel', 'mobile-filter-panel-open'),
      headerControlsDisplay: displayOf('#header-controls'),
      isExpanded: document.body.classList.contains('table-expanded-open'),
      isMobile: window.matchMedia('(max-width: 1024px)').matches,
      mobileMenuDisplay: displayOf('#mobile-menu-toggle'),
      mobileMenuOpen: classHas('#mobile-menu-dropdown', 'show')
        && !classHas('#mobile-menu-dropdown', 'hidden'),
      tableContainerWidth: tableContainerRect?.width || 0,
      tableToolbarDisplay: displayOf('#table-toolbar'),
      tableWidth: tableRect?.width || 0,
      tableZoom: tableShell?.style.getPropertyValue('--table-zoom') || ''
    };
  });
}

async function expectResponsiveShellMode(page, mode, label) {
  const metrics = await readResponsiveShellMetrics(page);

  if (mode === 'mobile') {
    if (
      !metrics.isMobile
      || metrics.headerControlsDisplay !== 'none'
      || metrics.mobileMenuDisplay === 'none'
      || metrics.actionBarDisplay !== 'grid'
      || metrics.tableToolbarDisplay !== 'none'
      || metrics.tableZoom !== '0.84'
      || !metrics.builderActive
      || metrics.builderOpen
      || metrics.builderExpanded !== 'false'
      || metrics.tableContainerWidth <= 0
    ) {
      throw new Error(`${label} should use the mobile responsive shell: ${JSON.stringify(metrics)}`);
    }
  } else if (
    metrics.isMobile
    || metrics.headerControlsDisplay === 'none'
    || metrics.mobileMenuDisplay !== 'none'
    || metrics.actionBarDisplay !== 'none'
    || metrics.tableToolbarDisplay === 'none'
    || metrics.tableZoom !== '1.00'
    || metrics.builderOpen
    || metrics.filterPanelMobileOpen
    || metrics.bodyLocked
  ) {
    throw new Error(`${label} should use the desktop responsive shell: ${JSON.stringify(metrics)}`);
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

async function expectMobileEditableFocusContained(page, controlSelector, editorSelector, label) {
  await page.locator(controlSelector).focus();
  await page.evaluate(() => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));

  const metrics = await page.locator(controlSelector).evaluate((control, selector) => {
    const editor = control.closest(selector) || document.querySelector(selector);
    const controlRect = control.getBoundingClientRect();
    const editorRect = editor?.getBoundingClientRect() || controlRect;
    const style = window.getComputedStyle(control);
    return {
      active: document.activeElement === control,
      controlBottom: controlRect.bottom,
      controlTop: controlRect.top,
      editorBottom: editorRect.bottom,
      editorTop: editorRect.top,
      fontSize: Number.parseFloat(style.fontSize || '0'),
      visualScale: window.visualViewport?.scale || 1,
      viewportHeight: window.innerHeight
    };
  }, editorSelector);

  const lowerBound = Math.min(metrics.editorBottom, metrics.viewportHeight);
  if (
    !metrics.active
    || metrics.fontSize < 16
    || metrics.visualScale > 1.01
    || metrics.controlTop < metrics.editorTop - 2
    || metrics.controlBottom > lowerBound + 2
  ) {
    throw new Error(`${label} should focus without zooming or leaving the editor viewport: ${JSON.stringify(metrics)}`);
  }
}

async function openMobilePanel(page, sourceControlId, visibleSelector) {
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator(`[data-source-control-id="${sourceControlId}"]`).click();
  await page.locator(visibleSelector).waitFor({ state: 'visible', timeout: 5000 });
}

async function dragTouchLocator(page, locator, options = {}) {
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Unable to measure touch drag target');
  }

  const startX = Math.round(box.x + box.width * (options.horizontalRatio ?? 0.5));
  const startY = Math.round(box.y + box.height * (options.verticalRatio ?? 0.5));
  const endX = Math.round(startX + (options.deltaX ?? 0));
  const endY = Math.round(startY + (options.deltaY ?? 0));
  const steps = Math.max(1, Number(options.steps) || 6);
  const client = await page.context().newCDPSession(page);
  let touchActive = false;
  let previewSeen = false;

  try {
    await client.send('Input.dispatchTouchEvent', {
      touchPoints: [{ id: 1, x: startX, y: startY }],
      type: 'touchStart'
    });
    touchActive = true;

    if (options.holdMs) {
      await new Promise(resolve => setTimeout(resolve, options.holdMs));
    }

    for (let index = 1; index <= steps; index += 1) {
      const progress = index / steps;
      await client.send('Input.dispatchTouchEvent', {
        touchPoints: [{
          id: 1,
          x: Math.round(startX + ((endX - startX) * progress)),
          y: Math.round(startY + ((endY - startY) * progress))
        }],
        type: 'touchMove'
      });
      if (options.expectPreview && index >= Math.ceil(steps / 2) && !previewSeen) {
        previewSeen = await page.locator('.fp-drag-preview').isVisible();
      }
    }

    if (options.expectPreview && !previewSeen) {
      throw new Error('Expected touch drag to show a floating reorder preview');
    }

    await client.send('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd'
    });
    touchActive = false;
  } finally {
    if (touchActive) {
      try {
        await client.send('Input.dispatchTouchEvent', {
          touchPoints: [],
          type: 'touchEnd'
        });
      } catch (_) {
        // The browser may already have cancelled the touch stream.
      }
    }
    await client.detach();
  }

  if (options.expectPreview) {
    await page.locator('.fp-drag-preview').waitFor({ state: 'detached', timeout: 5000 });
  }
}

async function longPressLocatorWithDomTouchEvents(locator, holdMs = 650) {
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  await locator.evaluate(async (target, delay) => {
    const rect = target.getBoundingClientRect();
    const x = Math.round(rect.left + (rect.width / 2));
    const y = Math.round(rect.top + (rect.height / 2));
    const touch = {
      clientX: x,
      clientY: y,
      force: 1,
      identifier: 42,
      pageX: x + window.scrollX,
      pageY: y + window.scrollY,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      screenX: x,
      screenY: y,
      target
    };
    const dispatchTouchEvent = (type, touches, changedTouches) => {
      const event = new Event(type, {
        bubbles: true,
        cancelable: true,
        composed: true
      });
      Object.defineProperties(event, {
        changedTouches: { value: changedTouches },
        targetTouches: { value: touches },
        touches: { value: touches }
      });
      target.dispatchEvent(event);
    };

    dispatchTouchEvent('touchstart', [touch], [touch]);
    await new Promise(resolve => setTimeout(resolve, delay));
    dispatchTouchEvent('touchend', [], [touch]);
  }, holdMs);
}

async function dragTouchLocatorToLocator(page, sourceLocator, targetLocator, options = {}) {
  await sourceLocator.waitFor({ state: 'visible', timeout: 5000 });
  await targetLocator.waitFor({ state: 'visible', timeout: 5000 });

  const sourceBox = await sourceLocator.boundingBox();
  const targetBox = await targetLocator.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Unable to measure touch drag targets: ${JSON.stringify({ sourceBox, targetBox })}`);
  }

  const startX = Math.round(sourceBox.x + sourceBox.width * (options.sourceHorizontalRatio ?? 0.5));
  const startY = Math.round(sourceBox.y + sourceBox.height * (options.sourceVerticalRatio ?? 0.5));
  const targetX = Math.round(targetBox.x + targetBox.width * (options.targetHorizontalRatio ?? 0.5));
  const targetY = Math.round(targetBox.y + targetBox.height * (options.targetVerticalRatio ?? 0.75));

  await dragTouchLocator(page, sourceLocator, {
    deltaX: targetX - startX,
    deltaY: targetY - startY,
    expectPreview: options.expectPreview === true,
    holdMs: options.holdMs ?? 180,
    horizontalRatio: options.sourceHorizontalRatio ?? 0.5,
    steps: options.steps ?? 10,
    verticalRatio: options.sourceVerticalRatio ?? 0.5
  });
}

async function exerciseMobileToastQueue(page) {
  await page.evaluate(async () => {
    const { toast } = await import('./core/toast.js');
    toast.dismissAll();
    toast.info('Mobile toast one', 240);
    toast.success('Mobile toast two', 240);
    toast.warning('Mobile toast three', 240);
  });

  await page.waitForFunction(() => {
    const visibleToasts = document.querySelectorAll('#toast-container .app-toast.is-visible');
    return visibleToasts.length === 1 && /Mobile toast one/u.test(visibleToasts[0]?.textContent || '');
  }, null, { timeout: 5000 });

  const mobileToastMetrics = await page.locator('#toast-container').evaluate(container => {
    const rect = container.getBoundingClientRect();
    const menuRect = document.querySelector('#mobile-menu-toggle')?.getBoundingClientRect();
    return {
      centerDelta: Math.abs((rect.left + rect.width / 2) - (window.innerWidth / 2)),
      menuGap: menuRect ? menuRect.left - rect.right : 0,
      toastCount: container.querySelectorAll('.app-toast').length,
      top: rect.top,
      visibleToastCount: container.querySelectorAll('.app-toast.is-visible').length,
      width: rect.width
    };
  });

  if (
    mobileToastMetrics.visibleToastCount !== 1
    || mobileToastMetrics.toastCount !== 1
    || mobileToastMetrics.centerDelta > 3
    || mobileToastMetrics.menuGap < 4
    || mobileToastMetrics.top > 16
  ) {
    throw new Error(`Mobile toasts should use one centered header slot clear of the menu button: ${JSON.stringify(mobileToastMetrics)}`);
  }

  await page.waitForFunction(() => {
    return /Mobile toast two/u.test(document.querySelector('#toast-container .app-toast.is-visible')?.textContent || '');
  }, null, { timeout: 3000 });

  await page.evaluate(async () => {
    const { toast } = await import('./core/toast.js');
    toast.dismissAll();
  });
  await page.waitForFunction(() => {
    return document.querySelectorAll('#toast-container .app-toast.is-visible').length === 0;
  }, null, { timeout: 5000 });
}

async function primeMobilePageScroll(page) {
  await page.evaluate(() => {
    if (!document.body.dataset.browserSmokePreviousMinHeight) {
      document.body.dataset.browserSmokePreviousMinHeight = document.body.style.minHeight || ' ';
    }
    document.body.style.minHeight = '1800px';
    window.scrollTo(0, 260);
  });
  await page.waitForFunction(() => window.scrollY >= 200, null, { timeout: 5000 });
}

async function cleanupMobilePageScroll(page) {
  await page.evaluate(() => {
    const previousMinHeight = document.body.dataset.browserSmokePreviousMinHeight;
    if (previousMinHeight !== undefined) {
      document.body.style.minHeight = previousMinHeight === ' ' ? '' : previousMinHeight;
      delete document.body.dataset.browserSmokePreviousMinHeight;
    }
    window.scrollTo(0, 0);
  });
}

async function expectMobileScrollLockActive(page, label) {
  const metrics = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
    bodyPosition: window.getComputedStyle(document.body).position,
    bodyTop: document.body.style.top,
    htmlLocked: document.documentElement.classList.contains('mobile-overlay-scroll-locked'),
    lockY: Number.parseInt(document.body.dataset.mobileScrollLockY || '0', 10),
    windowScrollY: window.scrollY
  }));

  if (!metrics.bodyLocked || !metrics.htmlLocked || metrics.bodyPosition !== 'fixed' || metrics.lockY < 200 || metrics.bodyTop !== `-${metrics.lockY}px`) {
    throw new Error(`${label} should lock the mobile page scroll: ${JSON.stringify(metrics)}`);
  }

  return metrics;
}

async function expectMobileScrollLockReleased(page, label) {
  await page.waitForFunction(() => !document.body.classList.contains('mobile-overlay-scroll-locked'), null, { timeout: 5000 });
  const metrics = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
    bodyPosition: window.getComputedStyle(document.body).position,
    htmlLocked: document.documentElement.classList.contains('mobile-overlay-scroll-locked'),
    windowScrollY: window.scrollY
  }));

  if (metrics.bodyLocked || metrics.htmlLocked || metrics.bodyPosition === 'fixed' || metrics.windowScrollY < 200) {
    throw new Error(`${label} should restore the mobile page scroll after closing: ${JSON.stringify(metrics)}`);
  }
}

async function expectOverlayConsumesScroll(page, scrollSelector, label) {
  await page.locator(scrollSelector).waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(selector => {
    const scroller = document.querySelector(selector);
    if (!scroller || scroller.querySelector('[data-browser-smoke-overlay-filler]')) {
      return;
    }

    const filler = document.createElement('div');
    filler.dataset.browserSmokeOverlayFiller = 'true';
    filler.style.flex = '0 0 900px';
    filler.style.height = '900px';
    filler.style.pointerEvents = 'none';
    scroller.appendChild(filler);
    scroller.scrollTop = 0;
  }, scrollSelector);

  const before = await expectMobileScrollLockActive(page, label);
  await page.locator(scrollSelector).hover();
  await page.mouse.wheel(0, 700);
  await page.waitForFunction(selector => (document.querySelector(selector)?.scrollTop || 0) > 20, scrollSelector, { timeout: 5000 });

  const after = await page.evaluate(selector => ({
    bodyTop: document.body.style.top,
    lockY: Number.parseInt(document.body.dataset.mobileScrollLockY || '0', 10),
    scrollerTop: document.querySelector(selector)?.scrollTop || 0,
    windowScrollY: window.scrollY
  }), scrollSelector);

  await page.evaluate(selector => {
    const scroller = document.querySelector(selector);
    if (!scroller) {
      return;
    }
    scroller.querySelector('[data-browser-smoke-overlay-filler]')?.remove();
    scroller.scrollTop = 0;
  }, scrollSelector);

  if (after.scrollerTop <= 20 || after.lockY !== before.lockY || after.bodyTop !== before.bodyTop) {
    throw new Error(`${label} should scroll inside the overlay without moving the page: ${JSON.stringify({ before, after })}`);
  }
}

async function expectOverlayTouchPanScroll(page, touchLocator, scrollSelector, label) {
  await page.locator(scrollSelector).waitFor({ state: 'visible', timeout: 5000 });
  await touchLocator.waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(selector => {
    const scroller = document.querySelector(selector);
    if (!scroller || scroller.querySelector('[data-browser-smoke-overlay-filler]')) {
      return;
    }

    const filler = document.createElement('div');
    filler.dataset.browserSmokeOverlayFiller = 'true';
    filler.style.flex = '0 0 900px';
    filler.style.height = '900px';
    filler.style.pointerEvents = 'none';
    scroller.appendChild(filler);
    scroller.scrollTop = 0;
  }, scrollSelector);

  const before = await expectMobileScrollLockActive(page, label);
  await dragTouchLocator(page, touchLocator, { deltaY: -150, steps: 8 });
  await page.waitForFunction(selector => (document.querySelector(selector)?.scrollTop || 0) > 20, scrollSelector, { timeout: 5000 });

  const after = await page.evaluate(selector => ({
    bodyTop: document.body.style.top,
    lockY: Number.parseInt(document.body.dataset.mobileScrollLockY || '0', 10),
    scrollerTop: document.querySelector(selector)?.scrollTop || 0,
    windowScrollY: window.scrollY
  }), scrollSelector);

  await page.evaluate(selector => {
    const scroller = document.querySelector(selector);
    if (!scroller) {
      return;
    }
    scroller.querySelector('[data-browser-smoke-overlay-filler]')?.remove();
    scroller.scrollTop = 0;
  }, scrollSelector);

  if (after.scrollerTop <= 20 || after.lockY !== before.lockY || after.bodyTop !== before.bodyTop) {
    throw new Error(`${label} should allow touch panning inside the overlay without moving the page: ${JSON.stringify({ before, after })}`);
  }
}

async function expectVisibleMobileTableContextMenu(page, label) {
  await page.locator('.tcm.tcm--visible').waitFor({ state: 'visible', timeout: 5000 });

  const selectedText = await page.evaluate(() => (window.getSelection?.()?.toString?.() || '').trim());
  if (selectedText) {
    throw new Error(`${label} should open the custom menu without selecting table text: "${selectedText.slice(0, 120)}"`);
  }

  const menuMetrics = await page.locator('.tcm.tcm--visible').evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      className: menu.className,
      clientHeight: menu.clientHeight,
      labels: Array.from(menu.querySelectorAll('.tcm-label')).map(label => (label.textContent || '').trim()),
      left: rect.left,
      right: rect.right,
      scrollHeight: menu.scrollHeight,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });

  ['Sort Ascending', 'Add Filter', 'Add Post Filter', 'Copy Cell', 'Copy Row', 'Copy Column', 'Resize Column'].forEach(expectedLabel => {
    if (!menuMetrics.labels.includes(expectedLabel)) {
      throw new Error(`${label} mobile table context menu is missing "${expectedLabel}": ${JSON.stringify(menuMetrics)}`);
    }
  });

  const viewportPad = 6;
  if (
    !String(menuMetrics.className || '').includes('tcm--touch')
    || menuMetrics.left < viewportPad
    || menuMetrics.top < viewportPad
    || menuMetrics.right > menuMetrics.viewportWidth - viewportPad
    || menuMetrics.bottom > menuMetrics.viewportHeight - viewportPad
    || menuMetrics.clientHeight > menuMetrics.viewportHeight - (viewportPad * 2)
  ) {
    throw new Error(`${label} should open the mobile table context menu within the viewport: ${JSON.stringify(menuMetrics)}`);
  }

  await expectControlsNonSelectable(page, '.tcm.tcm--visible', 'Mobile table context menu controls');
  await expectMinimumTapTarget(page, '.tcm.tcm--visible .tcm-item', 'Mobile table context menu items');
}

async function closeMobileTableContextMenu(page) {
  await page.keyboard.press('Escape');
  await page.locator('.tcm').waitFor({ state: 'detached', timeout: 5000 });
}

async function expectMobileTableContextMenu(page) {
  const firstCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]');
  await firstCell.waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(() => window.getSelection?.()?.removeAllRanges?.());
  await dragTouchLocator(page, firstCell, {
    holdMs: 650,
    steps: 1
  });
  await expectVisibleMobileTableContextMenu(page, 'CDP touch long-press');
  await closeMobileTableContextMenu(page);

  await page.evaluate(() => window.getSelection?.()?.removeAllRanges?.());
  await longPressLocatorWithDomTouchEvents(firstCell);
  await expectVisibleMobileTableContextMenu(page, 'DOM touch long-press');
  await closeMobileTableContextMenu(page);

  await page.locator('#table-container').evaluate(container => {
    container.scrollLeft = container.scrollWidth;
  });
  const rightEdgeCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="2"]');
  await rightEdgeCell.waitFor({ state: 'visible', timeout: 5000 });
  await page.evaluate(() => window.getSelection?.()?.removeAllRanges?.());
  await dragTouchLocator(page, rightEdgeCell, {
    holdMs: 650,
    horizontalRatio: 0.95,
    steps: 1,
    verticalRatio: 0.8
  });
  await expectVisibleMobileTableContextMenu(page, 'Right-edge touch long-press');
  await closeMobileTableContextMenu(page);
  await page.locator('#table-container').evaluate(container => {
    container.scrollLeft = 0;
  });
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

async function exerciseLiveResponsiveResize(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForResponsiveResize(page, false);
  await seedLoadedResults(page, { rowCount: 24 });
  await expectResponsiveShellMode(page, 'desktop', 'Live resize desktop baseline');
  await expectNoHorizontalOverflow(page, 'Live resize desktop baseline');

  await page.setViewportSize({ width: 1024, height: 768 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize desktop-to-tablet-landscape');
  await expectNoHorizontalOverflow(page, 'Live resize desktop-to-tablet-landscape');

  await page.setViewportSize({ width: 844, height: 390 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize phone landscape');
  await expectNoHorizontalOverflow(page, 'Live resize phone landscape');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  await expectResponsiveShellMode(page, 'mobile', 'Live resize desktop-to-mobile');
  await expectNoHorizontalOverflow(page, 'Live resize desktop-to-mobile');

  await page.locator('#mobile-builder-toggle').click();
  await page.waitForFunction(() => {
    return document.querySelector('#mobile-builder-drawer')?.classList.contains('is-open');
  }, null, { timeout: 5000 });

  await page.locator('[data-mobile-table-action="fields-panel"]').click();
  await page.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });

  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, false);
  await expectResponsiveShellMode(page, 'desktop', 'Live resize mobile-to-desktop closes mobile-only surfaces');
  await expectNoHorizontalOverflow(page, 'Live resize mobile-to-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  await page.locator('#mobile-menu-toggle').click();
  await page.locator('#mobile-menu-dropdown.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.setViewportSize({ width: 1180, height: 820 });
  await waitForResponsiveResize(page, false);
  await page.locator('#mobile-menu-dropdown.hidden').waitFor({ state: 'attached', timeout: 5000 });
  const menuResizeMetrics = await readResponsiveShellMetrics(page);
  if (menuResizeMetrics.mobileMenuOpen || menuResizeMetrics.bodyModalPanelOpen) {
    throw new Error(`Live resize to desktop should close the mobile menu: ${JSON.stringify(menuResizeMetrics)}`);
  }

  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForResponsiveResize(page, true);
  const expandedMobileMetrics = await readResponsiveShellMetrics(page);
  if (!expandedMobileMetrics.isExpanded || expandedMobileMetrics.tableZoom !== '0.90') {
    throw new Error(`Expanded table should compact when live-resized to mobile: ${JSON.stringify(expandedMobileMetrics)}`);
  }
  await expectElementWithinViewport(page, '#table-shell.table-shell-expanded', 'Live-resized expanded mobile table');

  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForResponsiveResize(page, false);
  const expandedDesktopMetrics = await readResponsiveShellMetrics(page);
  if (!expandedDesktopMetrics.isExpanded || expandedDesktopMetrics.tableZoom !== '1.00') {
    throw new Error(`Expanded table should restore desktop zoom when live-resized back: ${JSON.stringify(expandedDesktopMetrics)}`);
  }
  await expectElementWithinViewport(page, '#table-shell.table-shell-expanded', 'Live-resized expanded desktop table');
  await page.locator('#table-expand-btn').click();
  await page.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForResponsiveResize(page, false);
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

async function expectMobileColumnResizeInteraction(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    appServices.setManualColumnWidth?.('Smoke Title', 96);
    appServices.renderVirtualTable?.();
  });

  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  const firstCell = page.locator('#example-table tbody tr[data-row-index="0"] td[data-col-index="0"]');
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await firstCell.waitFor({ state: 'visible', timeout: 5000 });

  await longPressLocatorWithDomTouchEvents(firstCell);
  await expectVisibleMobileTableContextMenu(page, 'Mobile resize action long-press');
  await page.locator('.tcm.tcm--visible .tcm-item', { hasText: 'Resize Column' }).click();
  await page.waitForFunction(() => document.body.classList.contains('table-resize-mode'), null, { timeout: 5000 });

  const readMetrics = () => page.evaluate(() => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    return {
      cellWidth: Math.round(titleCellEl?.getBoundingClientRect().width || 0),
      headerWidth: Math.round(titleHeaderEl?.getBoundingClientRect().width || 0),
      resizeModeActive: document.body.classList.contains('table-resize-mode'),
      rowWidth: Math.round(titleRowEl?.getBoundingClientRect().width || 0),
      tableWidth: Math.round(tableEl?.getBoundingClientRect().width || 0)
    };
  });

  const beforeMetrics = await readMetrics();
  const resizeDelta = 72;
  await dragTouchLocator(page, titleHeader, {
    deltaX: resizeDelta,
    horizontalRatio: 0.5,
    steps: 8,
    verticalRatio: 0.5
  });

  await page.waitForFunction(({ expectedWidth }) => {
    const titleHeaderEl = document.querySelector('#example-table th[data-sort-field="Smoke Title"]');
    const titleRowEl = document.querySelector('#example-table tbody tr[data-row-index="0"]');
    const titleCellEl = titleRowEl?.querySelector('td[data-col-index="0"]');
    const tableEl = document.querySelector('#example-table');
    const headerWidth = Math.round(titleHeaderEl?.getBoundingClientRect().width || 0);
    const cellWidth = Math.round(titleCellEl?.getBoundingClientRect().width || 0);
    const rowWidth = Math.round(titleRowEl?.getBoundingClientRect().width || 0);
    const tableWidth = Math.round(tableEl?.getBoundingClientRect().width || 0);
    return Math.abs(headerWidth - expectedWidth) <= 4
      && Math.abs(headerWidth - cellWidth) <= 1
      && Math.abs(tableWidth - rowWidth) <= 1;
  }, { expectedWidth: beforeMetrics.headerWidth + resizeDelta }, { timeout: 5000 });

  const afterMetrics = await readMetrics();
  const actualDelta = afterMetrics.headerWidth - beforeMetrics.headerWidth;
  if (
    !beforeMetrics.resizeModeActive
    || !afterMetrics.resizeModeActive
    || Math.abs(actualDelta - resizeDelta) > 4
    || Math.abs(afterMetrics.headerWidth - afterMetrics.cellWidth) > 1
    || Math.abs(afterMetrics.tableWidth - afterMetrics.rowWidth) > 1
  ) {
    throw new Error(`Mobile column resize should drag from the active header with aligned cells: before=${JSON.stringify(beforeMetrics)}, after=${JSON.stringify(afterMetrics)}`);
  }

  await page.evaluate(async () => {
    const { appServices } = await import('./core/appServices.js');
    appServices.clearColumnResizeMode?.();
    appServices.setManualColumnWidth?.('Smoke Title', 96);
    appServices.renderVirtualTable?.();
  });
}

async function expectMobileFilterEditorSheet(page) {
  const filterGroup = page.locator('.fp-field-group', { hasText: 'Smoke Title' }).first();
  await filterGroup.waitFor({ state: 'visible', timeout: 5000 });
  await filterGroup.locator('.fp-edit-btn').first().click();
  await page.locator('#filter-card.show').waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });

  const metrics = await page.locator('#filter-card.show').evaluate(card => {
    const rect = card.getBoundingClientRect();
    const close = card.querySelector('#filter-card-close-btn');
    const closeRect = close?.getBoundingClientRect();
    const operator = card.querySelector('#condition-operator-select');
    const input = card.querySelector('#condition-input');
    const conditionPanel = card.querySelector('#condition-panel');
    const clone = document.querySelector('.mobile-bubble-editor-clone');
    const active = document.activeElement;
    return {
      activeElementId: active?.id || '',
      activeElementTag: active?.tagName || '',
      bottom: rect.bottom,
      closeHeight: closeRect?.height || 0,
      closeWidth: closeRect?.width || 0,
      conditionPanelVisible: conditionPanel ? window.getComputedStyle(conditionPanel).display !== 'none' : false,
      inputFontSize: input ? Number.parseFloat(window.getComputedStyle(input).fontSize || '0') : 16,
      left: rect.left,
      mobilePanelOpen: document.body.classList.contains('mobile-filter-panel-open'),
      operatorFontSize: operator ? Number.parseFloat(window.getComputedStyle(operator).fontSize || '0') : 16,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      zoomCloneDisplay: clone ? window.getComputedStyle(clone).display : ''
    };
  });

  if (
    metrics.mobilePanelOpen
    || metrics.left < 4
    || metrics.right > metrics.viewportWidth - 4
    || metrics.top < 48
    || metrics.bottom > metrics.viewportHeight - 4
    || metrics.closeWidth < 44
    || metrics.closeHeight < 44
    || !metrics.conditionPanelVisible
    || metrics.operatorFontSize < 16
    || metrics.inputFontSize < 16
    || metrics.zoomCloneDisplay !== 'none'
    || ['condition-input', 'condition-input-2', 'condition-operator-select'].includes(metrics.activeElementId)
  ) {
    throw new Error(`Mobile filter editor should open as a contained sheet without focus zoom: ${JSON.stringify(metrics)}`);
  }

  await expectNoHorizontalOverflow(page, 'Mobile filter editor sheet');
  await expectMobileEditableFocusContained(page, '#filter-card.show #condition-input', '#filter-card', 'Mobile filter value input');
  await page.locator('#filter-card-close-btn').click();
  await page.waitForFunction(() => {
    return !document.querySelector('#filter-card')?.classList.contains('show')
      && !document.querySelector('#overlay')?.classList.contains('show')
      && !document.querySelector('.active-bubble, .bubble-clone');
  }, null, { timeout: 5000 });
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
    await expectControlsNonSelectable(page, 'body', 'Desktop initial layout');
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
    await exerciseLiveResponsiveResize(page);

    queryApiStub.enqueue(Array.from({ length: 2 }, () => ({
      action: 'status',
      body: JSON.stringify(buildHistoryStatusResponse()),
      contentType: 'application/json; charset=utf-8'
    })));
    await page.getByRole('button', { name: 'Queries' }).click();
    await page.locator('input[placeholder="Search queries..."]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkInput(page, '#queries-search', 'Query history search input');
    await page.waitForFunction(() => {
      return document.querySelector('[data-history-book="complete"] .history-book-count')?.textContent?.trim() === '1';
    }, null, { timeout: 5000 });
    await page.locator('[data-history-book="complete"] .history-book-summary').click();
    await page.locator('.history-monitor').waitFor({ state: 'visible', timeout: 5000 });
    queryApiStub.enqueue({
      action: 'get_results',
      body: 'Loaded One|Main|Open\nLoaded Two|East|Closed\n',
      delayMs: 300,
      rawColumns: smokeResultHeaders
    });
    const historyLoadClick = page.locator('.history-monitor .load-query-btn').first().click();
    await page.locator('.history-result-load-progress').waitFor({ state: 'visible', timeout: 5000 });
    const historyLoadProgressText = await page.locator('.history-result-load-progress').textContent();
    if (!/Loading saved results/iu.test(historyLoadProgressText || '') || !/Waiting for rows|rows received/iu.test(historyLoadProgressText || '')) {
      throw new Error(`History result load progress should be visible while waiting: ${historyLoadProgressText}`);
    }
    await historyLoadClick;
    await page.locator('.history-result-load-progress').waitFor({ state: 'detached', timeout: 5000 });

    await page.getByRole('button', { name: 'Templates' }).click();
    await page.locator('input[placeholder="Search templates"]').waitFor({ state: 'visible', timeout: 5000 });
    await expectDarkSurface(page, '#templates-panel > h2', 'Templates panel header');
    await expectDarkInput(page, '#templates-search-input', 'Templates search input');
    await page.locator('#templates-list .templates-list-item').click();
    await page.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(page, '#templates-panel', 1, 'Desktop template detail overlay');
    await expectControlsNonSelectable(page, '#templates-panel', 'Desktop template controls');
    await page.locator('#templates-detail-close-btn').click();
    await page.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });

    await page.getByRole('button', { name: 'Help' }).click();
    await page.locator('#help-container').waitFor({ state: 'visible', timeout: 5000 });
    await expectControlsNonSelectable(page, '#help-panel', 'Desktop help controls');

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
    await exerciseMobileToastQueue(mobilePage);

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
    await expectControlsNonSelectable(mobilePage, '#mobile-menu-dropdown', 'Mobile menu controls');
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
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile templates controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile templates panel');
    const mobileTemplatesPanelMetrics = await mobilePage.locator('#templates-container').evaluate(container => {
      const top = container.querySelector('.templates-browser-top');
      const listShell = container.querySelector('.templates-browser-list-shell');
      const actions = container.querySelector('.templates-sidebar-actions--library');
      const actionButtons = Array.from(actions?.querySelectorAll('button') || []);
      const containerRect = container.getBoundingClientRect();
      const topRect = top?.getBoundingClientRect();
      const listRect = listShell?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const actionColumns = actions ? window.getComputedStyle(actions).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      return {
        actionColumns,
        actionCount: actionButtons.length,
        actionsHeight: actionsRect?.height || 0,
        containerHeight: containerRect.height,
        listHeight: listRect?.height || 0,
        topHeight: topRect?.height || 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplatesPanelMetrics.actionColumns < 3
      || mobileTemplatesPanelMetrics.actionCount < 3
      || mobileTemplatesPanelMetrics.actionsHeight > 72
      || mobileTemplatesPanelMetrics.topHeight > mobileTemplatesPanelMetrics.viewportHeight * 0.38
      || mobileTemplatesPanelMetrics.listHeight < mobileTemplatesPanelMetrics.viewportHeight * 0.3
    ) {
      throw new Error(`Mobile templates panel should keep controls compact and leave room for the template list: ${JSON.stringify(mobileTemplatesPanelMetrics)}`);
    }
    await mobilePage.locator('#templates-list .templates-list-item').click();
    await mobilePage.locator('#templates-detail-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template detail overlay');
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile template detail controls');
    const mobileTemplateDetailMetrics = await mobilePage.locator('#templates-detail').evaluate(detail => {
      const container = document.querySelector('#templates-container');
      const body = detail.querySelector('.templates-detail-body');
      const actions = detail.querySelector('.templates-detail-actions');
      const close = detail.querySelector('#templates-detail-close-btn');
      const detailRect = detail.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      const actionColumns = actions ? window.getComputedStyle(actions).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
      return {
        actionColumns,
        actionsHeight: actionsRect?.height || 0,
        bodyHeight: bodyRect?.height || 0,
        bottomGap: containerRect ? Math.abs(containerRect.bottom - detailRect.bottom) : 0,
        closeHeight: closeRect?.height || 0,
        closeWidth: closeRect?.width || 0,
        topGap: containerRect ? Math.abs(detailRect.top - containerRect.top) : 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplateDetailMetrics.topGap > 2
      || mobileTemplateDetailMetrics.bottomGap > 2
      || mobileTemplateDetailMetrics.bodyHeight < mobileTemplateDetailMetrics.viewportHeight * 0.36
      || mobileTemplateDetailMetrics.actionsHeight > 128
      || mobileTemplateDetailMetrics.actionColumns < 2
      || mobileTemplateDetailMetrics.closeWidth < 40
      || mobileTemplateDetailMetrics.closeHeight < 40
    ) {
      throw new Error(`Mobile template detail should be a full-height sheet with compact actions: ${JSON.stringify(mobileTemplateDetailMetrics)}`);
    }
    await mobilePage.locator('#templates-detail-close-btn').click();
    await mobilePage.locator('#templates-detail-overlay.hidden').waitFor({ state: 'attached', timeout: 5000 });
    await mobilePage.locator('#templates-manage-categories-btn').click();
    await mobilePage.locator('#templates-categories-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectVisibleCloseControlCount(mobilePage, '#templates-panel', 1, 'Mobile template categories overlay');
    await expectControlsNonSelectable(mobilePage, '#templates-panel', 'Mobile template category controls');
    const mobileTemplateCategoriesMetrics = await mobilePage.locator('.templates-categories-dialog').evaluate(dialog => {
      const container = document.querySelector('#templates-container');
      const body = dialog.querySelector('.templates-categories-body');
      const close = dialog.querySelector('#templates-categories-close-btn');
      const dialogRect = dialog.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const bodyRect = body?.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      return {
        bodyHeight: bodyRect?.height || 0,
        bottomGap: containerRect ? Math.abs(containerRect.bottom - dialogRect.bottom) : 0,
        closeHeight: closeRect?.height || 0,
        closeWidth: closeRect?.width || 0,
        topGap: containerRect ? Math.abs(dialogRect.top - containerRect.top) : 0,
        viewportHeight: window.innerHeight
      };
    });
    if (
      mobileTemplateCategoriesMetrics.topGap > 2
      || mobileTemplateCategoriesMetrics.bottomGap > 2
      || mobileTemplateCategoriesMetrics.bodyHeight < mobileTemplateCategoriesMetrics.viewportHeight * 0.45
      || mobileTemplateCategoriesMetrics.closeWidth < 40
      || mobileTemplateCategoriesMetrics.closeHeight < 40
    ) {
      throw new Error(`Mobile template categories should be a full-height sheet with a scrollable body: ${JSON.stringify(mobileTemplateCategoriesMetrics)}`);
    }
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
    await expectControlsNonSelectable(mobilePage, '#table-with-filter', 'Mobile table controls');
    await expectMobileTableTextNonSelectable(mobilePage);
    await expectMobileTableContextMenu(mobilePage);
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
    const mobileHeaderLabelMetrics = await mobilePage.locator('#example-table thead').evaluate(thead => {
      return Array.from(thead.querySelectorAll('.th-text')).map(label => {
        const style = window.getComputedStyle(label);
        const headerRect = label.closest('th')?.getBoundingClientRect();
        return {
          clientWidth: label.clientWidth,
          headerHeight: headerRect?.height || 0,
          scrollWidth: label.scrollWidth,
          text: label.textContent || '',
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace
        };
      });
    });
    const truncatedMobileHeader = mobileHeaderLabelMetrics.find(label => (
      label.textOverflow === 'ellipsis'
      || label.whiteSpace === 'nowrap'
      || label.scrollWidth - label.clientWidth > 1
      || label.headerHeight <= 0
    ));
    if (truncatedMobileHeader) {
      throw new Error(`Mobile table headers should wrap instead of truncating with ellipsis: ${JSON.stringify(mobileHeaderLabelMetrics)}`);
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
    await expectMobileColumnResizeInteraction(mobilePage);
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

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action="fields-panel"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#filter-side-panel', 'Mobile display and filters sheet');
    await expectControlsNonSelectable(mobilePage, '#filter-side-panel', 'Mobile display and filters controls');
    await expectOverlayConsumesScroll(mobilePage, '#filter-panel-body', 'Mobile display and filters sheet');
    await expectOverlayTouchPanScroll(
      mobilePage,
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Title' }),
      '#filter-panel-body',
      'Mobile display and filters sheet'
    );
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
    const reorderHandleCount = await mobilePage.locator('.fp-display-drag, .fp-drag-handle').count();
    if (reorderHandleCount !== 0) {
      throw new Error(`Display & Filters should not expose separate dot drag handles: found ${reorderHandleCount}`);
    }

    await dragTouchLocatorToLocator(
      mobilePage,
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Title' }),
      mobilePage.locator('.fp-display-item', { hasText: 'Smoke Status' }),
      { expectPreview: true, targetVerticalRatio: 0.85 }
    );
    await mobilePage.waitForFunction(async () => {
      const { QueryStateReaders } = await import('./core/queryState.js');
      return QueryStateReaders.getDisplayedFields().join('|') === 'Smoke Branch|Smoke Status|Smoke Title';
    }, null, { timeout: 5000 });

    await mobilePage.evaluate(async () => {
      const { QueryChangeManager } = await import('./core/queryState.js');
      QueryChangeManager.setQueryState({
        activeFilters: {
          'Smoke Title': { filters: [{ cond: 'contains', val: 'Alpha' }] },
          'Smoke Branch': { filters: [{ cond: 'equals', val: 'Main' }] },
          'Smoke Status': { filters: [{ cond: 'equals', val: 'Open' }] }
        }
      }, { source: 'BrowserSmoke.seedMobileFilterGroups' });
    });
    await mobilePage.waitForFunction(() => document.querySelectorAll('.fp-field-group').length >= 3, null, { timeout: 5000 });
    await expectMobileFilterEditorSheet(mobilePage);
    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action="fields-panel"]').click();
    await mobilePage.waitForFunction(() => document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await dragTouchLocatorToLocator(
      mobilePage,
      mobilePage.locator('.fp-field-group', { hasText: 'Smoke Title' }),
      mobilePage.locator('.fp-field-group', { hasText: 'Smoke Status' }),
      { expectPreview: true, targetVerticalRatio: 0.85 }
    );
    await mobilePage.waitForFunction(async () => {
      const { QueryStateReaders } = await import('./core/queryState.js');
      return Object.keys(QueryStateReaders.getActiveFilters()).join('|') === 'Smoke Branch|Smoke Status|Smoke Title';
    }, null, { timeout: 5000 });
    await mobilePage.evaluate(async ({ headers }) => {
      const { QueryChangeManager } = await import('./core/queryState.js');
      QueryChangeManager.setQueryState({
        activeFilters: {},
        displayedFields: headers
      }, { source: 'BrowserSmoke.resetMobileReorderState' });
    }, { headers: smokeResultHeaders });

    await mobilePage.locator('#filter-panel-mobile-close').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('mobile-filter-panel-open'), null, { timeout: 5000 });
    await expectMobileScrollLockReleased(mobilePage, 'Mobile display and filters sheet');
    await cleanupMobilePageScroll(mobilePage);
    const closedMobileFilterDisplay = await mobilePage.locator('#filter-side-panel').evaluate(element => window.getComputedStyle(element).display);
    if (closedMobileFilterDisplay !== 'none') {
      throw new Error(`Closed mobile display and filters sheet should not sit above the table: ${closedMobileFilterDisplay}`);
    }

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action-target="table-add-field-btn"]').click();
    await mobilePage.locator('.form-mode-field-picker-modal:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-field-picker-modal:not(.hidden)', 'Mobile add field dialog');
    await expectOverlayConsumesScroll(mobilePage, '.form-mode-field-picker-list', 'Mobile add field dialog');
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
    await expectMobileScrollLockReleased(mobilePage, 'Mobile add field dialog');
    await cleanupMobilePageScroll(mobilePage);

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
    const mobileExpandedTableMetrics = await mobilePage.locator('#table-shell.table-shell-expanded').evaluate(shell => {
      const topBar = shell.querySelector('#table-top-bar');
      const toolbar = shell.querySelector('#table-toolbar');
      const container = shell.querySelector('#table-container');
      const table = shell.querySelector('#example-table');
      const nameShell = shell.querySelector('#table-name-shell');
      const zoomControls = shell.querySelector('#table-zoom-controls');
      const visibleToolbarItems = Array.from(toolbar?.children || [])
        .filter(child => {
          const rect = child.getBoundingClientRect();
          const style = window.getComputedStyle(child);
          return style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
        })
        .map(child => child.id || child.className || child.tagName);
      const shellRect = shell.getBoundingClientRect();
      const topBarRect = topBar?.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const tableRect = table?.getBoundingClientRect();
      const zoomStyle = zoomControls ? window.getComputedStyle(zoomControls) : null;
      const nameStyle = nameShell ? window.getComputedStyle(nameShell) : null;
      return {
        containerHeight: containerRect?.height || 0,
        containerTop: containerRect?.top || 0,
        containerWidth: containerRect?.width || 0,
        shellBottomGap: Math.abs(window.innerHeight - (shellRect?.bottom || 0)),
        shellTop: shellRect?.top || 0,
        tableWidth: tableRect?.width || 0,
        tableZoom: shell.style.getPropertyValue('--table-zoom') || '',
        topBarHeight: topBarRect?.height || 0,
        visibleToolbarItems,
        viewportHeight: window.innerHeight,
        zoomDisplay: zoomStyle?.display || '',
        nameDisplay: nameStyle?.display || ''
      };
    });
    if (
      mobileExpandedTableMetrics.topBarHeight > 70
      || mobileExpandedTableMetrics.containerTop > 88
      || mobileExpandedTableMetrics.containerHeight < mobileExpandedTableMetrics.viewportHeight - 110
      || mobileExpandedTableMetrics.tableWidth > mobileExpandedTableMetrics.containerWidth + 4
      || mobileExpandedTableMetrics.shellTop > 10
      || mobileExpandedTableMetrics.shellBottomGap > 10
      || mobileExpandedTableMetrics.zoomDisplay === 'none'
      || mobileExpandedTableMetrics.nameDisplay !== 'none'
      || mobileExpandedTableMetrics.tableZoom !== '0.90'
      || mobileExpandedTableMetrics.visibleToolbarItems.join('|') !== 'table-zoom-controls|table-expand-btn'
    ) {
      throw new Error(`Mobile expanded table should use compact full-screen chrome: ${JSON.stringify(mobileExpandedTableMetrics)}`);
    }
    await mobilePage.locator('#table-expand-btn').click();
    await mobilePage.waitForFunction(() => !document.body.classList.contains('table-expanded-open'), null, { timeout: 5000 });

    await primeMobilePageScroll(mobilePage);
    await mobilePage.locator('[data-mobile-table-action-target="post-filter-btn"]').click();
    await mobilePage.locator('#post-filter-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#post-filter-overlay .post-filter-dialog', 'Mobile post filter dialog');
    await expectOverlayConsumesScroll(mobilePage, '.post-filter-dialog__body', 'Mobile post filter dialog');
    await expectMinimumTapTarget(mobilePage, '#post-filter-overlay .post-filter-dialog__close, #post-filter-field, #post-filter-operator, #post-filter-logic, #post-filter-add-btn, #post-filter-clear-btn, #post-filter-done-btn', 'Mobile post filter controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile post filter dialog');
    await expectMobileEditableFocusContained(mobilePage, '#post-filter-operator', '.post-filter-dialog__body', 'Mobile post filter operator');

    await mobilePage.locator('#post-filter-operator').selectOption('equals');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').waitFor({ state: 'visible', timeout: 5000 });
    await expectMinimumTapTarget(mobilePage, '#post-filter-value-picker-host .form-mode-popup-list-trigger', 'Mobile post filter value picker trigger');
    await mobilePage.locator('#post-filter-value-picker-host .form-mode-popup-list-trigger').click();
    await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '.form-mode-popup-list-popup:not([hidden])', 'Mobile popup list picker');
    await expectLightInput(mobilePage, '.form-mode-popup-list-popup input[type="search"]', 'Mobile popup list search input');
    const popupAutoFocus = await mobilePage.locator('.form-mode-popup-list-popup:not([hidden])').evaluate(popup => {
      const active = document.activeElement;
      return {
        activeClass: String(active?.className || ''),
        activeTag: active?.tagName || '',
        popupFocused: active === popup
      };
    });
    if (!popupAutoFocus.popupFocused || ['INPUT', 'TEXTAREA', 'SELECT'].includes(popupAutoFocus.activeTag)) {
      throw new Error(`Mobile popup list should open without auto-focusing a text control: ${JSON.stringify(popupAutoFocus)}`);
    }
    await expectMobileEditableFocusContained(mobilePage, '.form-mode-popup-list-popup input[type="search"]', '.form-mode-popup-list-popup-body', 'Mobile popup list search input');
    await expectMinimumTapTarget(mobilePage, '.form-mode-popup-list-done', 'Mobile popup list done control');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile popup list picker');
    await mobilePage.locator('.form-mode-popup-list-done').click();
    await mobilePage.locator('#post-filter-done-btn').click();
    await expectMobileScrollLockReleased(mobilePage, 'Mobile post filter dialog');
    await cleanupMobilePageScroll(mobilePage);

    const mobileExportAction = mobilePage.locator('[data-mobile-table-action-target="download-btn"]');
    await mobileExportAction.scrollIntoViewIfNeeded();
    const downloadDisabled = await mobileExportAction.evaluate(button => button.disabled);
    if (downloadDisabled) {
      throw new Error('Download button is disabled after seeding loaded mobile results');
    }
    await primeMobilePageScroll(mobilePage);
    await mobileExportAction.click();
    await mobilePage.locator('#export-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
    await expectElementWithinViewport(mobilePage, '#export-overlay .export-dialog', 'Mobile export dialog');
    await expectOverlayConsumesScroll(mobilePage, '.export-dialog__body', 'Mobile export dialog');
    await expectMinimumTapTarget(mobilePage, '#export-overlay-close, #export-cancel-btn, #export-confirm-btn', 'Mobile export dialog controls');
    await expectNoHorizontalOverflow(mobilePage, 'Mobile export dialog');
    await mobilePage.locator('#export-cancel-btn').click();
    await expectMobileScrollLockReleased(mobilePage, 'Mobile export dialog');
    await cleanupMobilePageScroll(mobilePage);

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
