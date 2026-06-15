import { readFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

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

function buildJsonlResultStream({
  columns = smokeResultHeaders,
  queryId = 'browser-smoke-query',
  rows = []
} = {}) {
  return [
    { type: 'meta', version: 1, format: 'jsonl', query_id: queryId, columns },
    ...rows.map(values => ({ type: 'row', values })),
    { type: 'done', rows: rows.length }
  ].map(event => JSON.stringify(event)).join('\n') + '\n';
}

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
  },
  {
    name: 'Smoke Due Date',
    category: 'Smoke',
    desc: 'Smoke-test due date field',
    filters: ['equals', 'before', 'after', 'between'],
    type: 'date'
  },
  {
    name: 'Public Note',
    category: 'Smoke',
    desc: 'Smoke-test multi-value public note field',
    filters: ['contains', 'equals'],
    type: 'string'
  },
  {
    name: 'MARC Field',
    category: 'Smoke',
    desc: 'Smoke-test buildable MARC field placeholder',
    filters: ['contains', 'equals'],
    type: 'string',
    builder: {
      outputFieldIdTemplate: 'MARC {tag}${subfield}',
      displayLabelTemplate: 'MARC {tag}${subfield}',
      matchPattern: '^(?:MARC\\s+\\d{3}(?:\\$[0-9A-Za-z])?|Marc\\d{3}(?:\\$[0-9A-Za-z])?)$',
      inputs: [
        {
          id: 'tag',
          label: 'MARC tag',
          pattern: '^\\d{3}$',
          error_msg: 'Enter a three digit MARC tag'
        },
        {
          id: 'subfield',
          label: 'Subfield',
          pattern: '^[0-9A-Za-z]$',
          optional: 1,
          placeholder: 'Optional'
        }
      ]
    }
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

function encodeFormSpecForUrl(spec) {
  return Buffer.from(JSON.stringify(spec), 'utf8')
    .toString('base64')
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/gu, '');
}

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
    case 'get_results':
      return {
        body: JSON.stringify({ error: 'Saved result not available in smoke stub.', unsupported: true }),
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

function queueHistoryStatusResponses(queryApiStub, count = 6) {
  queryApiStub.enqueue(Array.from({ length: count }, () => ({
    action: 'status',
    body: JSON.stringify(buildHistoryStatusResponse()),
    contentType: 'application/json; charset=utf-8'
  })));
}

async function installQueryApiStub(page) {
  const queuedResponses = [];
  const requests = [];

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
    requests.push({ action: payload.action || '', payload });
    const queuedResponseIndex = queuedResponses.findIndex(response => {
      const actionMatches = !response.action || response.action === payload.action;
      if (!actionMatches) {
        return false;
      }
      const requestQueryId = String(payload.query_id || payload.queryId || '');
      if (!response.queryId || !requestQueryId) {
        return true;
      }
      return String(response.queryId) === requestQueryId;
    });
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
    countAction(action) {
      return requests.filter(request => request.action === action).length;
    },
    getRequests(action) {
      return requests.filter(request => !action || request.action === action);
    },
    enqueue(responses) {
      queuedResponses.push(...(Array.isArray(responses) ? responses : [responses]));
    }
  };
}

function attachFailureListeners(page, failures, port) {
  page.on('console', message => {
    if (['error', 'warning', 'warn'].includes(message.type())) {
      const location = message.location();
      const locationText = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : '';
      failures.push(`console ${message.type()}: ${message.text()}${locationText}`);
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

  page.on('response', response => {
    if (/^https?:/u.test(response.url()) && response.status() >= 400) {
      failures.push(`bad response: ${response.status()} ${response.url()}`);
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

async function waitForAppReady(page, failures) {
  await waitForAppModules(page, failures);

  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.queryAppReady === 'true'
        && !document.body.classList.contains('app-starting'),
      null,
      { timeout: 15000 }
    );
  } catch (error) {
    failures.push(`app startup did not finish: ${error.message}`);
  }
}

async function expectStartupStatusVisible(page, options = {}) {
  await page.locator('#app-startup-status').waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('#app-startup-spacefield canvas').waitFor({ state: 'attached', timeout: 5000 });
  const startupMetrics = await page.locator('#app-startup-status').evaluate(element => {
    const style = window.getComputedStyle(element);
    return {
      appStarting: document.body.classList.contains('app-starting'),
      detail: element.querySelector('[data-app-startup-detail]')?.textContent || '',
      display: style.display,
      modulesReady: document.documentElement.dataset.queryAppModulesReady || '',
      ready: document.documentElement.dataset.queryAppReady,
      spacefield: Boolean(element.querySelector('#app-startup-spacefield canvas')),
      title: element.querySelector('[data-app-startup-title]')?.textContent || '',
      visibility: style.visibility
    };
  });

  if (
    !startupMetrics.appStarting
    || startupMetrics.ready !== 'false'
    || startupMetrics.display === 'none'
    || startupMetrics.visibility === 'hidden'
    || !/field metadata/iu.test(startupMetrics.title)
    || !/backend/iu.test(startupMetrics.detail)
    || !startupMetrics.spacefield
  ) {
    throw new Error(`Startup status should show backend field loading with the shared space animation: ${JSON.stringify(startupMetrics)}`);
  }

  if (options.beforeAppModules && startupMetrics.modulesReady === 'true') {
    throw new Error(`Startup space animation should start before the full app module loader finishes: ${JSON.stringify(startupMetrics)}`);
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

async function expectReadableDarkText(page, selector, label, { minContrastRatio = 4.5 } = {}) {
  const failures = await page.locator(selector).evaluate((root, options) => {
    const parseColor = value => {
      const match = value?.match(/rgba?\(([^)]+)\)/u);
      if (!match) {
        return null;
      }
      const parts = match[1].split(/[,\s/]+/u).filter(Boolean).map(Number);
      if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) {
        return null;
      }
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: Number.isFinite(parts[3]) ? parts[3] : 1
      };
    };

    const composite = (foreground, background) => {
      const alpha = Math.max(0, Math.min(1, foreground.a ?? 1));
      return {
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
        a: 1
      };
    };

    const relativeLuminance = color => {
      const convert = channel => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * convert(color.r) + 0.7152 * convert(color.g) + 0.0722 * convert(color.b);
    };

    const contrastRatio = (first, second) => {
      const firstLuma = relativeLuminance(first);
      const secondLuma = relativeLuminance(second);
      const lighter = Math.max(firstLuma, secondLuma);
      const darker = Math.min(firstLuma, secondLuma);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const isVisible = element => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0.01
        && rect.width > 0
        && rect.height > 0;
    };

    const hasDirectText = element => Array.from(element.childNodes)
      .some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());

    const elementText = element => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return element.value || element.placeholder || '';
      }
      if (element instanceof HTMLSelectElement) {
        return element.selectedOptions?.[0]?.textContent?.trim() || element.textContent.trim();
      }
      return Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(Boolean)
        .join(' ');
    };

    const resolvedBackground = element => {
      const chain = [];
      for (let node = element; node; node = node.parentElement) {
        chain.unshift(node);
      }
      return chain.reduce((background, node) => {
        const color = parseColor(window.getComputedStyle(node).backgroundColor);
        return color && color.a > 0 ? composite(color, background) : background;
      }, { r: 255, g: 255, b: 255, a: 1 });
    };

    const describeElement = element => {
      const className = String(element.className || '').trim().split(/\s+/u).filter(Boolean).slice(0, 2).join('.');
      return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
    };

    const candidates = [root, ...root.querySelectorAll('*')].filter(element => {
      if (!isVisible(element)) {
        return false;
      }
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return Boolean(elementText(element));
      }
      return hasDirectText(element);
    });

    return candidates.flatMap(element => {
      const style = window.getComputedStyle(element);
      const background = resolvedBackground(element);
      const foregroundColor = parseColor(style.color);
      if (!foregroundColor) {
        return [];
      }
      const foreground = composite(foregroundColor, background);
      const ratio = contrastRatio(foreground, background);
      if (ratio >= options.minContrastRatio) {
        return [];
      }
      return [{
        element: describeElement(element),
        text: elementText(element).slice(0, 80),
        ratio: Number(ratio.toFixed(2)),
        color: style.color,
        background: style.backgroundColor
      }];
    }).slice(0, 8);
  }, { minContrastRatio });

  if (failures.length > 0) {
    throw new Error(`${label} has unreadable dark-mode text: ${JSON.stringify(failures)}`);
  }
}

async function installHiddenTabNotificationSpy(page) {
  await page.evaluate(() => {
    window.__browserSmokeOriginalNotification = window.Notification;
    window.__browserSmokeNotifications = [];
    class BrowserSmokeNotification {
      static permission = 'granted';

      static requestPermission() {
        return Promise.resolve('granted');
      }

      constructor(title, options = {}) {
        this.title = title;
        this.options = options;
        window.__browserSmokeNotifications.push({ options, title });
      }

      close() {}
    }

    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: BrowserSmokeNotification
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => false
    });
  });
}

async function restoreVisibleTabNotificationSpy(page) {
  await page.evaluate(() => {
    if (window.__browserSmokeOriginalNotification) {
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: window.__browserSmokeOriginalNotification
      });
    }
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible'
    });
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true
    });
  });
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
  '.template-query-btn',
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

async function expectLightSurface(page, selector, label) {
  const theme = await page.locator(selector).evaluate(element => {
    const readChannels = value => (value.match(/\d+(?:\.\d+)?/gu) || []).slice(0, 4).map(Number);
    const style = window.getComputedStyle(element);
    const [backgroundRed = 255, backgroundGreen = 255, backgroundBlue = 255, backgroundAlpha = 1] = readChannels(style.backgroundColor);
    const [textRed = 0, textGreen = 0, textBlue = 0] = readChannels(style.color);

    return {
      backgroundAlpha,
      backgroundLuma: (backgroundRed + backgroundGreen + backgroundBlue) / 3,
      resolvedTheme: document.documentElement.dataset.themeResolved || '',
      textLuma: (textRed + textGreen + textBlue) / 3
    };
  });

  if (
    theme.resolvedTheme !== 'light'
    || theme.textLuma > 130
    || (theme.backgroundAlpha > 0.01 && theme.backgroundLuma < 150)
  ) {
    throw new Error(`${label} is not using the light surface theme: ${JSON.stringify(theme)}`);
  }
}

async function expectReadableLightText(page, selector, label, minRatio = 4.5) {
  const checks = await page.locator(selector).evaluateAll((elements, ratioThreshold) => {
    const parseColor = value => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/iu);
      if (!match) return null;
      const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
      return {
        a: parts.length >= 4 && !Number.isNaN(parts[3]) ? parts[3] : 1,
        b: parts[2],
        g: parts[1],
        r: parts[0]
      };
    };
    const blend = (foreground, background) => {
      const alpha = Math.max(0, Math.min(1, foreground.a ?? 1));
      return {
        a: 1,
        b: foreground.b * alpha + background.b * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        r: foreground.r * alpha + background.r * (1 - alpha)
      };
    };
    const luminance = color => {
      const channel = value => {
        const scaled = value / 255;
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    };
    const contrastRatio = (text, background) => {
      const textLuma = luminance(text);
      const backgroundLuma = luminance(background);
      return (Math.max(textLuma, backgroundLuma) + 0.05) / (Math.min(textLuma, backgroundLuma) + 0.05);
    };
    const effectiveBackground = element => {
      let background = { a: 1, b: 255, g: 255, r: 255 };
      const ancestry = [];
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        ancestry.unshift(node);
      }
      ancestry.forEach(node => {
        const color = parseColor(window.getComputedStyle(node).backgroundColor);
        if (color && color.a > 0) {
          background = blend(color, background);
        }
      });
      return background;
    };

    return elements
      .filter(element => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && String(element.textContent || '').trim();
      })
      .map(element => {
        const style = window.getComputedStyle(element);
        const textColor = parseColor(style.color) || { a: 1, b: 0, g: 0, r: 0 };
        const background = effectiveBackground(element);
        const ratio = contrastRatio(textColor, background);
        return {
          className: String(element.className || ''),
          id: element.id || '',
          ratio,
          tagName: element.tagName,
          text: String(element.textContent || '').trim().replace(/\s+/gu, ' ').slice(0, 100)
        };
      })
      .filter(result => result.ratio < ratioThreshold);
  }, minRatio);

  if (checks.length > 0) {
    throw new Error(`${label} has light-mode text below ${minRatio}: ${JSON.stringify(checks.slice(0, 8))}`);
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
    return window.matchMedia('(max-width: 1180px)').matches === expected;
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
      isMobile: window.matchMedia('(max-width: 1180px)').matches,
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

async function expectMobileHeaderDoesNotCoverTableOnScroll(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(resolve => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));

  const metrics = await page.evaluate(() => {
    const scrollTarget = Math.min(
      180,
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    );
    window.scrollTo(0, scrollTarget);
    return new Promise(resolve => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const header = document.querySelector('#header-bar');
          const table = document.querySelector('#table-shell');
          const headerRect = header?.getBoundingClientRect();
          const tableRect = table?.getBoundingClientRect();
          const overlaps = Boolean(headerRect && tableRect
            && headerRect.bottom > tableRect.top + 1
            && headerRect.top < tableRect.bottom - 1);

          resolve({
            bodyPaddingTop: window.getComputedStyle(document.body).paddingTop,
            headerBottom: headerRect?.bottom ?? null,
            headerPosition: header ? window.getComputedStyle(header).position : '',
            headerTop: headerRect?.top ?? null,
            overlaps,
            scrollY: window.scrollY,
            tableBottom: tableRect?.bottom ?? null,
            tableTop: tableRect?.top ?? null
          });
        });
      });
    });
  });

  if (
    metrics.headerPosition === 'fixed'
    || metrics.bodyPaddingTop !== '0px'
    || metrics.overlaps
  ) {
    throw new Error(`${label} should keep the mobile header in page flow instead of covering the table: ${JSON.stringify(metrics)}`);
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

async function openExportOverlayPromptly(page, triggerSelector, label) {
  const trigger = page.locator(triggerSelector).first();
  await trigger.waitFor({ state: 'visible', timeout: 5000 });
  await trigger.evaluate(element => {
    window.__browserSmokeExportOverlayStartedAt = performance.now();
    element.click();
  });
  await page.locator('#export-overlay:not(.hidden)').waitFor({ state: 'visible', timeout: 5000 });
  const elapsedMs = await page.evaluate(() => {
    return performance.now() - (window.__browserSmokeExportOverlayStartedAt || performance.now());
  });
  if (elapsedMs > 300) {
    throw new Error(`${label} should show the export dialog within 300ms, took ${elapsedMs.toFixed(1)}ms`);
  }
  return elapsedMs;
}

async function waitForExportOptionsReady(page, label) {
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#export-overlay');
    const confirmBtn = document.querySelector('#export-confirm-btn');
    const previewText = document.querySelector('#export-group-preview')?.textContent || '';
    return overlay
      && !overlay.classList.contains('hidden')
      && confirmBtn
      && !confirmBtn.disabled
      && !/Preparing export options/iu.test(previewText);
  }, null, { timeout: 5000 }).catch(error => {
    throw new Error(`${label} export options should finish preparing: ${error.message}`);
  });
}

async function waitForGroupedExportAvailable(page, label) {
  await page.waitForFunction(() => {
    const groupedMode = document.querySelector('#export-mode-grouped');
    return groupedMode && !groupedMode.disabled;
  }, null, { timeout: 5000 }).catch(error => {
    throw new Error(`${label} grouped export option should become available: ${error.message}`);
  });
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
    const { toast } = await import('./src/core/toast.js');
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
    const { toast } = await import('./src/core/toast.js');
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

  const expectedBodyTop = metrics.lockY === 0 ? '0px' : `-${metrics.lockY}px`;
  if (!metrics.bodyLocked || !metrics.htmlLocked || metrics.bodyPosition !== 'fixed' || metrics.bodyTop !== expectedBodyTop) {
    throw new Error(`${label} should lock the mobile page scroll: ${JSON.stringify(metrics)}`);
  }

  await page.evaluate(lockY => {
    document.body.dataset.browserSmokeLastLockY = String(lockY);
  }, metrics.lockY);

  return metrics;
}

async function expectMobileScrollLockReleased(page, label) {
  await page.waitForFunction(() => !document.body.classList.contains('mobile-overlay-scroll-locked'), null, { timeout: 5000 });
  const metrics = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains('mobile-overlay-scroll-locked'),
    bodyPosition: window.getComputedStyle(document.body).position,
    htmlLocked: document.documentElement.classList.contains('mobile-overlay-scroll-locked'),
    lastLockY: Number.parseInt(document.body.dataset.browserSmokeLastLockY || '0', 10),
    windowScrollY: window.scrollY
  }));

  await page.evaluate(() => {
    delete document.body.dataset.browserSmokeLastLockY;
  });

  const restoredMeaningfulScroll = metrics.lastLockY < 50 || metrics.windowScrollY >= metrics.lastLockY - 20;
  if (metrics.bodyLocked || metrics.htmlLocked || metrics.bodyPosition === 'fixed' || !restoredMeaningfulScroll) {
    throw new Error(`${label} should restore the mobile page scroll after closing: ${JSON.stringify(metrics)}`);
  }
}

async function expectOverlayConsumesScroll(page, scrollSelector, label) {
  const minimumOverlayScrollTop = 10;
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
  await page.waitForFunction(
    ({ minimumScrollTop, selector }) => (document.querySelector(selector)?.scrollTop || 0) > minimumScrollTop,
    { minimumScrollTop: minimumOverlayScrollTop, selector: scrollSelector },
    { timeout: 5000 }
  );

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

  if (after.scrollerTop <= minimumOverlayScrollTop || after.lockY !== before.lockY || after.bodyTop !== before.bodyTop) {
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

async function openDesktopTableContextMenu(page, selector, label) {
  const target = page.locator(selector).first();
  await target.waitFor({ state: 'visible', timeout: 5000 });
  await page.locator('.tcm').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await target.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + Math.min(Math.max(rect.width / 2, 8), Math.max(rect.width - 8, 8));
    const clientY = rect.top + Math.min(Math.max(rect.height / 2, 8), Math.max(rect.height - 8, 8));
    element.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      buttons: 2,
      cancelable: true,
      clientX,
      clientY
    }));
  });
  await page.locator('.tcm.tcm--visible').waitFor({ state: 'visible', timeout: 5000 });
  const menuItems = await page.locator('.tcm.tcm--visible .tcm-item').count();
  if (menuItems <= 0) {
    throw new Error(`${label} should open the table context menu with visible actions`);
  }
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

async function expectMobileHeaderDragDoesNotOpenContextMenu(page) {
  const titleHeader = page.locator('#example-table th[data-sort-field="Smoke Title"]').first();
  await titleHeader.waitFor({ state: 'visible', timeout: 5000 });
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.tcm').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => window.getSelection?.()?.removeAllRanges?.());

  await dragTouchLocator(page, titleHeader, {
    deltaX: 36,
    deltaY: 1,
    holdMs: 520,
    horizontalRatio: 0.5,
    steps: 6,
    verticalRatio: 0.5
  });
  await page.waitForTimeout(250);

  await dragTouchLocator(page, titleHeader, {
    deltaX: 36,
    deltaY: 1,
    holdMs: 760,
    horizontalRatio: 0.5,
    steps: 6,
    verticalRatio: 0.5
  });
  await page.waitForTimeout(250);

  const menuVisible = await page.locator('.tcm.tcm--visible').count();
  const selectedText = await page.evaluate(() => (window.getSelection?.()?.toString?.() || '').trim());
  if (menuVisible > 0 || selectedText) {
    throw new Error(`Mobile header drag should not open the table context menu or select text: ${JSON.stringify({ menuVisible, selectedText })}`);
  }

  await dragTouchLocator(page, titleHeader, {
    holdMs: 760,
    horizontalRatio: 0.5,
    steps: 1,
    verticalRatio: 0.5
  });
  await page.locator('.tcm.tcm--visible').waitFor({ state: 'visible', timeout: 5000 });
  const headerMenuLabels = await page.locator('.tcm.tcm--visible .tcm-label').evaluateAll(labels => {
    return labels.map(label => (label.textContent || '').trim());
  });
  ['Sort Ascending', 'Add Filter', 'Add Post Filter', 'Copy Column', 'Resize Column'].forEach(expectedLabel => {
    if (!headerMenuLabels.includes(expectedLabel)) {
      throw new Error(`Mobile stationary header long-press is missing "${expectedLabel}": ${JSON.stringify(headerMenuLabels)}`);
    }
  });
  ['Copy Cell', 'Copy Row'].forEach(unexpectedLabel => {
    if (headerMenuLabels.includes(unexpectedLabel)) {
      throw new Error(`Mobile stationary header long-press should not show "${unexpectedLabel}": ${JSON.stringify(headerMenuLabels)}`);
    }
  });
  await closeMobileTableContextMenu(page);
}

async function seedLoadedResults(page, options = {}) {
  const rowCount = Math.max(0, Number(options.rowCount) || 3);
  const includeDate = options.includeDate === true;
  const includeMultiValueBranch = options.includeMultiValueBranch === true;
  const longTitle = options.longTitle === true;

  await page.evaluate(async ({ includeDate: useDate, includeMultiValueBranch: useMultiValueBranch, longTitle: useLongTitle, rowCount: requestedRowCount }) => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryTableView } = await import('./src/ui/queryTableView.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    const headers = useDate
      ? ['Smoke Title', 'Smoke Branch', 'Smoke Status', 'Smoke Due Date']
      : ['Smoke Title', 'Smoke Branch', 'Smoke Status'];
    const makeTitle = title => useLongTitle
      ? `${title} with a deliberately long title for live column resize coverage`
      : title;
    const withDate = (row, value) => useDate ? [...row, value] : row;
    const baseRows = [
      withDate([makeTitle('Alpha record'), 'Main', 'Open'], '20240131'),
      withDate([makeTitle('Beta record'), 'East', 'Closed'], 'NEVER'),
      withDate([makeTitle('Gamma record'), useMultiValueBranch ? 'Main\x1FEast' : 'Main', 'Open'], '20240215')
    ];
    const rows = requestedRowCount <= baseRows.length
      ? baseRows.slice(0, requestedRowCount)
      : Array.from({ length: requestedRowCount }, (_, index) => withDate([
          makeTitle(`Smoke record ${String(index + 1).padStart(3, '0')}`),
          useMultiValueBranch && index % 4 === 0 ? 'Main\x1FEast' : (index % 2 === 0 ? 'Main' : 'East'),
          index % 3 === 0 ? 'Closed' : 'Open'
        ], index % 5 === 0 ? 'NEVER' : '20240131'));
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
  }, { includeDate, includeMultiValueBranch, longTitle, rowCount });
  await page.locator('#example-table').waitFor({ state: 'attached', timeout: 5000 });
}

async function expectSplitTogglePreviewAnimation(page) {
  await page.evaluate(async () => {
    const { appUiActions } = await import('./src/core/appUiActions.js');
    appUiActions.updateSplitColumnsToggleState();
  });

  const toggle = page.locator('#split-columns-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 5000 });
  await toggle.scrollIntoViewIfNeeded();

  const beforeHoverState = await toggle.evaluate(button => ({
    ariaDisabled: button.getAttribute('aria-disabled'),
    className: button.className,
    disabledClass: button.classList.contains('split-toggle-disabled')
  }));
  if (beforeHoverState.ariaDisabled !== 'false' || beforeHoverState.disabledClass) {
    throw new Error(`Multi-value export toggle should be enabled for split-capable results: ${JSON.stringify(beforeHoverState)}`);
  }

  await toggle.hover();
  await page.waitForFunction(() => {
    const button = document.querySelector('#split-columns-toggle');
    const primary = button?.querySelector('.split-toggle-icon:not(.hidden)');
    const alternate = Array.from(button?.querySelectorAll('.split-toggle-icon') || [])
      .find(icon => icon.classList.contains('hidden'));
    if (!primary || !alternate) return false;

    const primaryStyle = window.getComputedStyle(primary);
    const alternateStyle = window.getComputedStyle(alternate);
    return primaryStyle.animationName.includes('splitToggleActiveIconExit')
      && primaryStyle.animationIterationCount !== 'infinite'
      && Number.parseFloat(primaryStyle.opacity || '1') <= 0.05
      && alternateStyle.animationName.includes('splitTogglePreviewIconEnter')
      && alternateStyle.animationIterationCount !== 'infinite'
      && alternateStyle.display !== 'none'
      && Number.parseFloat(alternateStyle.opacity || '0') >= 0.95;
  }, null, { timeout: 5000 });

  await page.evaluate(() => {
    document.activeElement?.blur?.();
  });
  await page.mouse.move(12, await page.evaluate(() => window.innerHeight - 12));
  await page.waitForFunction(() => {
    const button = document.querySelector('#split-columns-toggle');
    const primary = button?.querySelector('.split-toggle-icon:not(.hidden)');
    const alternate = Array.from(button?.querySelectorAll('.split-toggle-icon') || [])
      .find(icon => icon.classList.contains('hidden'));
    if (!primary || !alternate) return false;

    const primaryStyle = window.getComputedStyle(primary);
    const alternateStyle = window.getComputedStyle(alternate);
    return Number.parseFloat(primaryStyle.opacity || '0') >= 0.95
      && alternateStyle.display === 'none';
  }, null, { timeout: 5000 });
}

async function expectDestructiveFlameAnimation(page, selector, label) {
  const matchingControls = page.locator(selector);
  const controlCount = await matchingControls.count();
  if (controlCount < 1) {
    throw new Error(`${label} should exist`);
  }

  const control = matchingControls.first();
  await control.waitFor({ state: 'visible', timeout: 5000 });
  await control.scrollIntoViewIfNeeded();

  const beforeHoverState = await control.evaluate(element => ({
    ariaDisabled: element.getAttribute('aria-disabled'),
    disabled: Boolean(element.disabled),
    flameCount: element.querySelectorAll('.destructive-flame-icon').length,
    shapeCount: element.querySelectorAll('.destructive-flame-shape').length
  }));
  if (
    beforeHoverState.disabled
    || beforeHoverState.ariaDisabled === 'true'
    || beforeHoverState.flameCount < 1
    || beforeHoverState.shapeCount < 1
  ) {
    throw new Error(`${label} should be an enabled fire-icon control: ${JSON.stringify(beforeHoverState)}`);
  }

  await control.hover();
  await page.waitForFunction(targetSelector => {
    const shape = document.querySelector(`${targetSelector} .destructive-flame-shape`);
    if (!shape) return false;

    const style = window.getComputedStyle(shape);
    return style.animationName.includes('destructiveFlameWave')
      && style.animationIterationCount === 'infinite'
      && style.filter !== 'none';
  }, selector, { timeout: 5000 });

  await page.evaluate(() => {
    document.activeElement?.blur?.();
  });
  await page.mouse.move(8, 8);
}

async function expectSplitTogglePreferenceWithoutEligibleResults(page) {
  await page.evaluate(async () => {
    const { appUiActions } = await import('./src/core/appUiActions.js');
    appUiActions.updateSplitColumnsToggleState();
  });

  const toggle = page.locator('#split-columns-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 5000 });
  await toggle.scrollIntoViewIfNeeded();

  const initialState = await toggle.evaluate(button => ({
    ariaDisabled: button.getAttribute('aria-disabled'),
    className: button.className,
    disabledClass: button.classList.contains('split-toggle-disabled'),
    activeIconVisible: !button.querySelector('#split-toggle-icon-cols')?.classList.contains('hidden'),
    inactiveIconVisible: !button.querySelector('#split-toggle-icon-stack')?.classList.contains('hidden')
  }));
  if (initialState.ariaDisabled !== 'false' || initialState.disabledClass) {
    throw new Error(`Split preference toggle should stay enabled without split-capable data: ${JSON.stringify(initialState)}`);
  }

  await toggle.click();
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    return appServices.isSplitColumnsActive?.() === true;
  }, null, { timeout: 5000 });

  const activeState = await toggle.evaluate(button => ({
    ariaDisabled: button.getAttribute('aria-disabled'),
    disabledClass: button.classList.contains('split-toggle-disabled'),
    activeIconVisible: !button.querySelector('#split-toggle-icon-cols')?.classList.contains('hidden'),
    inactiveIconVisible: !button.querySelector('#split-toggle-icon-stack')?.classList.contains('hidden')
  }));
  if (
    activeState.ariaDisabled !== 'false'
    || activeState.disabledClass
    || !activeState.activeIconVisible
    || activeState.inactiveIconVisible
  ) {
    throw new Error(`Split preference toggle did not switch on without split-capable data: ${JSON.stringify(activeState)}`);
  }

  const splitPreferenceState = await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryStateReaders } = await import('./src/core/queryState.js');
    const { SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY } = await import('./src/features/table/export/splitColumnsToggleUi.js');
    return {
      active: appServices.isSplitColumnsActive?.(),
      displayedFields: QueryStateReaders.getDisplayedFields(),
      headers: appServices.getVirtualTableData?.()?.headers || [],
      storedPreference: window.localStorage.getItem(SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY)
    };
  });
  if (
    !splitPreferenceState.active
    || splitPreferenceState.storedPreference !== 'split'
    || splitPreferenceState.displayedFields.includes('Smoke Branch 2')
    || splitPreferenceState.headers.includes('Smoke Branch 2')
  ) {
    throw new Error(`Split preference should save without inventing split columns for unsplit data: ${JSON.stringify(splitPreferenceState)}`);
  }

  await toggle.click();
  await page.waitForFunction(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY } = await import('./src/features/table/export/splitColumnsToggleUi.js');
    return appServices.isSplitColumnsActive?.() === false
      && window.localStorage.getItem(SPLIT_COLUMNS_PREFERENCE_STORAGE_KEY) === 'stacked';
  }, null, { timeout: 5000 });
}

async function seedLargeExportResults(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryTableView } = await import('./src/ui/queryTableView.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    const headers = Array.from({ length: 80 }, (_, index) => `Large Export ${index + 1}`);
    const rows = Array.from({ length: 1000 }, (_, rowIndex) => (
      headers.map((field, columnIndex) => `${field} row ${rowIndex + 1}`)
    ));
    const columnMap = new Map(headers.map((field, index) => [field, index]));

    QueryChangeManager.replaceDisplayedFields(headers, { source: 'BrowserSmoke.seedLargeExportResults' });
    QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'BrowserSmoke.seedLargeExportResults', silent: true }
    );
    appServices.setVirtualTableData({ headers, rows, columnMap });
    await QueryTableView.showExampleTable(headers, { syncQueryState: false });
    appServices.renderVirtualTable();
    QueryUI.updateButtonStates();
  });
  await page.locator('#example-table').waitFor({ state: 'attached', timeout: 5000 });
}

async function seedWideDragResults(page) {
  await page.evaluate(async () => {
    const { appServices } = await import('./src/core/appServices.js');
    const { QueryChangeManager } = await import('./src/core/queryState.js');
    const { QueryTableView } = await import('./src/ui/queryTableView.js');
    const { QueryUI } = await import('./src/ui/queryUI.js');
    const headers = Array.from({ length: 16 }, (_, index) => `Drag Column ${index + 1}`);
    const rows = Array.from({ length: 8 }, (_, rowIndex) => (
      headers.map((field, columnIndex) => `${field} value ${rowIndex + 1}-${columnIndex + 1}`)
    ));
    const columnMap = new Map(headers.map((field, index) => [field, index]));

    QueryChangeManager.replaceDisplayedFields(headers, { source: 'BrowserSmoke.seedWideDragResults' });
    QueryChangeManager.setLifecycleState(
      { hasLoadedResultSet: true, queryRunning: false },
      { source: 'BrowserSmoke.seedWideDragResults', silent: true }
    );
    appServices.setVirtualTableData({ headers, rows, columnMap });
    headers.forEach(field => appServices.setManualColumnWidth?.(field, 180));
    await QueryTableView.showExampleTable(headers, { syncQueryState: false });
    appServices.renderVirtualTable();
    QueryUI.updateButtonStates();
  });
  await page.locator('#example-table').waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForFunction(() => {
    const container = document.querySelector('#table-container');
    return Boolean(container && container.scrollWidth > container.clientWidth + 400);
  }, null, { timeout: 5000 });
}

export {
  QUERY_API_PATTERN,
  attachFailureListeners,
  buildJsonlResultStream,
  cleanupMobilePageScroll,
  closeMobileTableContextMenu,
  closeServer,
  dragTouchLocator,
  dragTouchLocatorToLocator,
  encodeFormSpecForUrl,
  exerciseMobileToastQueue,
  expectControlsNonSelectable,
  expectDarkInput,
  expectDarkSurface,
  expectReadableDarkText,
  expectDestructiveFlameAnimation,
  expectElementWithinViewport,
  expectLightInput,
  expectLightSurface,
  expectReadableLightText,
  expectMinimumTapTarget,
  expectMobileEditableFocusContained,
  expectMobileHeaderDoesNotCoverTableOnScroll,
  expectMobileHeaderDragDoesNotOpenContextMenu,
  expectMobileScrollLockReleased,
  expectMobileTableContextMenu,
  expectMobileTableTextNonSelectable,
  expectMobileViewportStability,
  expectNoHorizontalOverflow,
  expectOverlayConsumesScroll,
  expectOverlayTouchPanScroll,
  expectResponsiveShellMode,
  expectSplitTogglePreviewAnimation,
  expectSplitTogglePreferenceWithoutEligibleResults,
  expectStartupStatusVisible,
  expectVisibleCloseControlCount,
  expectVisibleMobileTableContextMenu,
  installHiddenTabNotificationSpy,
  installQueryApiStub,
  listen,
  longPressLocatorWithDomTouchEvents,
  openDesktopTableContextMenu,
  openExportOverlayPromptly,
  openMobilePanel,
  parseQueryApiPayload,
  primeMobilePageScroll,
  queueHistoryStatusResponses,
  readResponsiveShellMetrics,
  restoreVisibleTabNotificationSpy,
  seedLargeExportResults,
  seedLoadedResults,
  seedWideDragResults,
  serveStaticFile,
  smokeFieldDefinitions,
  smokeResultHeaders,
  stubExternalAssets,
  waitForAppReady,
  waitForExportOptionsReady,
  waitForGroupedExportAvailable,
  waitForResponsiveResize
};
