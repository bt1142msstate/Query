import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSiteUpdateAutoReloadState,
  getSiteUpdateStatusMessage,
  isEditableElement,
  normalizeSiteUpdateVersion
} from '../../../src/ui/siteUpdate.js';

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
