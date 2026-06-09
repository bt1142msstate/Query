import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';

const DEFAULT_LIVE_SITE_URL = 'https://bt1142msstate.github.io/Query/';
const DEFAULT_LIVE_API_URL = 'https://mlp.sirsi.net/uhtbin/query_api.pl';
const LIVE_TEST_TIMEOUT_MS = Number(process.env.LIVE_TEST_TIMEOUT_MS || 90000);

function buildLiveLaunchUrl(siteUrl, apiUrl) {
  const url = new URL(siteUrl || DEFAULT_LIVE_SITE_URL);
  const normalizedApiUrl = String(apiUrl || DEFAULT_LIVE_API_URL).trim();
  if (normalizedApiUrl) {
    url.searchParams.set('api_url', normalizedApiUrl);
  }
  url.searchParams.set('live_test', '1');
  return url.href;
}

function attachLiveFailureListeners(page, failures, apiUrl) {
  const normalizedApiUrl = String(apiUrl || '').trim();

  page.on('console', message => {
    if (!['error', 'warning', 'warn'].includes(message.type())) {
      return;
    }

    const location = message.location();
    if (
      normalizedApiUrl
      && location.url?.startsWith(normalizedApiUrl)
      && /Failed to load resource/iu.test(message.text())
    ) {
      return;
    }

    const locationText = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : '';
    failures.push(`console ${message.type()}: ${message.text()}${locationText}`);
  });

  page.on('pageerror', error => {
    failures.push(`page error: ${error.stack || error.message}`);
  });

  page.on('requestfailed', request => {
    if (normalizedApiUrl && request.url().startsWith(normalizedApiUrl)) {
      return;
    }

    failures.push(`request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
  });

  page.on('response', response => {
    if (normalizedApiUrl && response.url().startsWith(normalizedApiUrl)) {
      return;
    }

    if (/^https?:/u.test(response.url()) && response.status() >= 400) {
      failures.push(`bad response: ${response.status()} ${response.url()}`);
    }
  });
}

async function readCompatibilityReport(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#api-compatibility-results .api-compatibility-row'));
    return {
      checks: rows.map(row => ({
        id: row.getAttribute('data-check-id'),
        status: row.getAttribute('data-status'),
        text: row.textContent?.replace(/\s+/gu, ' ').trim() || ''
      })),
      status: document.querySelector('#api-settings-status')?.textContent?.trim() || '',
      summary: document.querySelector('#api-compatibility-summary')?.textContent?.trim() || ''
    };
  });
}

test('live site connects to the real API without hidden warnings', { timeout: LIVE_TEST_TIMEOUT_MS }, async () => {
  const siteUrl = process.env.LIVE_SITE_URL || DEFAULT_LIVE_SITE_URL;
  const apiUrl = process.env.LIVE_API_URL || DEFAULT_LIVE_API_URL;
  const launchUrl = buildLiveLaunchUrl(siteUrl, apiUrl);
  const failures = [];
  const browser = await chromium.launch({ headless: process.env.LIVE_HEADLESS !== 'false' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  attachLiveFailureListeners(page, failures, apiUrl);

  try {
    await page.goto(launchUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(
      () => document.documentElement.dataset.queryAppReady === 'true'
        && !document.body.classList.contains('app-starting'),
      null,
      { timeout: 25000 }
    );

    await page.getByRole('button', { name: 'API Settings' }).click();
    await page.locator('#api-settings-container').waitFor({ state: 'visible', timeout: 5000 });

    const configuredApiUrl = await page.locator('#api-settings-url-input').inputValue();
    assert.equal(configuredApiUrl, apiUrl, 'API Settings should use the live API URL passed to the page');

    await page.locator('#api-settings-test-btn').click();
    await page.waitForFunction(
      () => /^(Connected\. Loaded \d+ fields\.|Could not|Request timed out|The API responded)/u
        .test(document.querySelector('#api-settings-status')?.textContent?.trim() || ''),
      null,
      { timeout: 20000 }
    );

    const connectionStatus = await page.locator('#api-settings-status').textContent();
    assert.match(
      connectionStatus || '',
      /^Connected\. Loaded \d+ fields\./u,
      `Live API field metadata check failed: ${connectionStatus}`
    );

    await page.locator('#api-settings-compatibility-btn').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#api-compatibility-results .api-compatibility-row').length >= 5
        && document.querySelector('#api-settings-compatibility-btn')?.getAttribute('aria-busy') !== 'true',
      null,
      { timeout: 45000 }
    );

    const report = await readCompatibilityReport(page);
    const blockingChecks = report.checks.filter(check => {
      if (check.status === 'supported') return false;
      if (check.status === 'missing' && String(check.id || '').startsWith('optional-')) return false;
      return true;
    });

    assert.equal(
      blockingChecks.length,
      0,
      `Live API compatibility has blocking warnings or failures: ${JSON.stringify({ report, blockingChecks }, null, 2)}`
    );

    assert.equal(
      failures.length,
      0,
      `Live site emitted browser warnings/errors or asset failures: ${failures.map(failure => `\n- ${failure}`).join('')}`
    );
  } finally {
    await browser.close();
  }
});
