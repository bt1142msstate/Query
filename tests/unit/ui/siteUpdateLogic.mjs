import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCacheBypassUrl,
  getSiteUpdateAutoReloadState,
  getSiteUpdateStatusMessage,
  isEditableElement,
  normalizeSiteUpdateVersionValue,
  normalizeSiteUpdateSummary,
  normalizeSiteUpdateVersion,
  readCurrentVersion,
  readEmbeddedSiteUpdateVersion,
  readStoredSiteUpdateVersion,
  rememberLoadedSiteUpdateVersion
} from '../../../src/ui/siteUpdate.js';
import { getSiteUpdateDetails } from '../../../src/ui/siteUpdateDetails.js';

function createElementStub({ tag = 'input', type = 'text', disabled = false, readOnly = false, contentEditable = false } = {}) {
  return {
    disabled,
    isContentEditable: contentEditable,
    readOnly,
    tag,
    type,
    matches(selector) {
      if (selector === 'input') {
        return this.tag === 'input';
      }
      if (selector.includes('textarea')) {
        return ['textarea', 'select', 'contenteditable'].includes(this.tag);
      }
      return false;
    }
  };
}

test('site update version normalizes supported cache manifest keys', () => {
  assert.equal(normalizeSiteUpdateVersion({ version: ' abc123 ' }), 'abc123');
  assert.equal(normalizeSiteUpdateVersion({ sha: 'def456' }), 'def456');
  assert.equal(normalizeSiteUpdateVersion({ commit: 12345 }), '12345');
  assert.equal(normalizeSiteUpdateVersion({ build: 'build-7' }), 'build-7');
  assert.equal(normalizeSiteUpdateVersion({}), '');
  assert.equal(normalizeSiteUpdateVersion(null), '');
  assert.equal(normalizeSiteUpdateVersionValue(null), '');
  assert.equal(normalizeSiteUpdateVersionValue('  deploy-a  '), 'deploy-a');
});

test('site update reads current version from explicit, embedded, and stored fallbacks', () => {
  const storage = new Map();
  const storageAdapter = {
    getItem: key => storage.get(key) || '',
    setItem: (key, value) => storage.set(key, value)
  };
  const root = { dataset: { queryAppCacheVersion: 'root-version' } };
  const documentWithMeta = {
    documentElement: root,
    querySelector(selector) {
      assert.equal(selector, 'meta[name="query-app-cache-version"]');
      return { getAttribute: () => ' meta-version ' };
    }
  };
  const documentWithoutMeta = {
    documentElement: root,
    querySelector: () => null
  };

  assert.equal(readEmbeddedSiteUpdateVersion({ document: documentWithMeta, root }), 'meta-version');
  assert.equal(readEmbeddedSiteUpdateVersion({ document: documentWithoutMeta, root }), 'root-version');
  assert.equal(readCurrentVersion({ explicitVersion: ' explicit-version ', document: documentWithMeta, root, storage: storageAdapter }), 'explicit-version');
  assert.equal(readCurrentVersion({ document: documentWithoutMeta, root, storage: storageAdapter }), 'root-version');

  delete root.dataset.queryAppCacheVersion;
  assert.equal(rememberLoadedSiteUpdateVersion(' stored-version ', { storage: storageAdapter }), true);
  assert.equal(readStoredSiteUpdateVersion({ storage: storageAdapter }), 'stored-version');
  assert.equal(readCurrentVersion({ document: documentWithoutMeta, root, storage: storageAdapter }), 'stored-version');
});

test('site update cache bypass URL includes timestamp and random nonce', () => {
  const url = buildCacheBypassUrl('./cache-bust.json', {
    baseHref: 'https://example.test/app/index.html?mode=live',
    now: () => 12345,
    random: () => 0.6789
  });

  assert.equal(url, 'https://example.test/app/cache-bust.json?siteUpdate=12345-6789');
});

test('site update summary normalizes deployment metadata fallbacks', () => {
  assert.equal(
    normalizeSiteUpdateSummary({ update: { title: '  Fresh   query tools  ', summary: 'Ignored summary' } }),
    'Fresh query tools'
  );
  assert.equal(normalizeSiteUpdateSummary({ updateSummary: '  Streamlined update banner  ' }), 'Streamlined update banner');
  assert.equal(normalizeSiteUpdateSummary({ summary: '  Safer deployments  ' }), 'Safer deployments');
  assert.equal(normalizeSiteUpdateSummary({}), '');
  assert.equal(normalizeSiteUpdateSummary(null), '');
});

test('site update details parse nested, flat, and delimited manifest metadata', () => {
  assert.deepEqual(
    getSiteUpdateDetails({
      update: {
        title: '  Better   updater  ',
        summary: '  Shows deployment details.  ',
        items: ['  Recheck on focus  ', '  Keep idle auto update  ']
      }
    }),
    {
      title: 'Better updater',
      summary: 'Shows deployment details.',
      items: ['Recheck on focus', 'Keep idle auto update']
    }
  );

  assert.deepEqual(getSiteUpdateDetails({ updateItems: 'First change|Second change\nThird change' }).items, [
    'First change',
    'Second change',
    'Third change'
  ]);
});

test('site update auto reload waits for work and reloads only when idle or hidden', () => {
  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: '' }), {
    canReload: false,
    reason: 'none',
    nextCheckMs: null
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', queryRunning: true, runningRecheckMs: 25 }), {
    canReload: false,
    reason: 'running-query',
    nextCheckMs: 25
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', hasLocalEdits: true }), {
    canReload: false,
    reason: 'local-edits',
    nextCheckMs: null
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', activeEditor: true, editingRecheckMs: 20 }), {
    canReload: false,
    reason: 'editing',
    nextCheckMs: 20
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', visibilityState: 'hidden' }), {
    canReload: true,
    reason: 'hidden',
    nextCheckMs: 0
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', idleMs: 45_000, idleThresholdMs: 45_000 }), {
    canReload: true,
    reason: 'idle',
    nextCheckMs: 0
  });

  assert.deepEqual(getSiteUpdateAutoReloadState({ updateVersion: 'next', idleMs: 10_000, idleThresholdMs: 45_000 }), {
    canReload: false,
    reason: 'active',
    nextCheckMs: 35_000
  });
});

test('site update status messages explain why reload is waiting', () => {
  assert.equal(
    getSiteUpdateStatusMessage({ canReload: false, reason: 'running-query' }),
    'Update will wait for the running query to finish.'
  );
  assert.equal(
    getSiteUpdateStatusMessage({ canReload: false, reason: 'local-edits' }),
    'Update is ready when your current edits are done.'
  );
  assert.equal(
    getSiteUpdateStatusMessage({ canReload: true, reason: 'idle' }),
    'Updating automatically in a few seconds.'
  );
});

test('site update editable-element detection ignores non-editing controls', () => {
  assert.equal(isEditableElement(createElementStub()), true);
  assert.equal(isEditableElement(createElementStub({ tag: 'textarea' })), true);
  assert.equal(isEditableElement(createElementStub({ contentEditable: true })), true);
  assert.equal(isEditableElement(createElementStub({ disabled: true })), false);
  assert.equal(isEditableElement(createElementStub({ type: 'button' })), false);
  assert.equal(isEditableElement(null), false);
});
