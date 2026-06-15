import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getQueryRunActionState,
  updateTableRefreshQueryButtonState
} from '../../../src/ui/tableRefreshQueryButton.js';

function createButtonStub() {
  const classes = new Set();
  const runIcon = createIconStub();
  const refreshIcon = createIconStub();
  return {
    dataset: {},
    disabled: false,
    hidden: false,
    attributes: {},
    classList: {
      contains(className) {
        return classes.has(className);
      },
      toggle(className, force) {
        if (force) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
      }
    },
    icons: {
      refresh: refreshIcon,
      run: runIcon
    },
    getAttribute(name) {
      return this.attributes[name] || null;
    },
    querySelector(selector) {
      if (selector === '[data-table-query-icon="run"]') return runIcon;
      if (selector === '[data-table-query-icon="refresh"]') return refreshIcon;
      return null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

function createIconStub() {
  const classes = new Set();
  return {
    classList: {
      contains(className) {
        return classes.has(className);
      },
      toggle(className, force) {
        if (force) {
          classes.add(className);
        } else {
          classes.delete(className);
        }
      }
    }
  };
}

test('query run action state distinguishes first run, refresh, and updated query', () => {
  assert.deepEqual(getQueryRunActionState({
    hasLoadedResultSet: false,
    queryChanged: false
  }), {
    icon: 'run',
    isRefresh: false,
    label: 'Run query',
    mode: 'run'
  });

  assert.deepEqual(getQueryRunActionState({
    hasLoadedResultSet: true,
    queryChanged: false
  }), {
    icon: 'refresh',
    isRefresh: true,
    label: 'Refresh results',
    mode: 'refresh'
  });

  assert.deepEqual(getQueryRunActionState({
    hasLoadedResultSet: true,
    queryChanged: true
  }), {
    icon: 'run',
    isRefresh: false,
    label: 'Run updated query',
    mode: 'run-updated'
  });
});

test('table refresh button tooltip tracks refresh versus updated-query mode', () => {
  const button = createButtonStub();

  updateTableRefreshQueryButtonState({
    button,
    displayedFields: ['Title'],
    lifecycleState: { hasLoadedResultSet: true },
    queryChanged: false
  });

  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-label'), 'Refresh results');
  assert.equal(button.classList.contains('table-toolbar-btn-active'), true);
  assert.equal(button.dataset.queryActionMode, 'refresh');
  assert.equal(button.icons.refresh.classList.contains('hidden'), false);
  assert.equal(button.icons.run.classList.contains('hidden'), true);

  updateTableRefreshQueryButtonState({
    button,
    displayedFields: ['Title'],
    lifecycleState: { hasLoadedResultSet: true },
    queryChanged: true
  });

  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.getAttribute('aria-label'), 'Run updated query');
  assert.equal(button.classList.contains('table-toolbar-btn-active'), false);
  assert.equal(button.dataset.queryActionMode, 'run-updated');
  assert.equal(button.icons.refresh.classList.contains('hidden'), true);
  assert.equal(button.icons.run.classList.contains('hidden'), false);
});

test('table refresh button stays hidden until a result set exists', () => {
  const button = createButtonStub();

  updateTableRefreshQueryButtonState({
    button,
    displayedFields: ['Title'],
    lifecycleState: { hasLoadedResultSet: false },
    queryChanged: false
  });

  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(button.classList.contains('hidden'), true);
  assert.equal(button.getAttribute('aria-label'), 'Run query');
});
