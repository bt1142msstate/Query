import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORM_MODE_WORKSPACE_CLASS,
  getFormModeWorkspaceState,
  setFormModeWorkspaceFocused,
  syncFormModeWorkspacePresentation
} from '../../../src/ui/form-mode/formModeWorkspace.js';

function createClassList() {
  const values = new Set();
  return {
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      if (force) values.add(value);
      else values.delete(value);
    }
  };
}

function createButton() {
  return {
    attributes: new Map(),
    classList: createClassList(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
  };
}

function createContext(overrides = {}) {
  const state = {
    active: true,
    viewMode: 'form',
    workspaceFocused: false,
    focusFormBtn: createButton(),
    showTableBtn: createButton(),
    ...overrides
  };
  let layoutRefreshes = 0;
  const scrollCalls = [];
  return {
    document: {
      body: { classList: createClassList() },
      defaultView: {
        scrollTo(options) {
          scrollCalls.push(options);
        }
      }
    },
    get layoutRefreshes() {
      return layoutRefreshes;
    },
    refreshLayout() {
      layoutRefreshes += 1;
    },
    scrollCalls,
    state
  };
}

test('workspace presentation defaults to form and table', () => {
  const context = createContext();
  const focused = syncFormModeWorkspacePresentation(context);

  assert.equal(focused, false);
  assert.equal(context.document.body.classList.contains(FORM_MODE_WORKSPACE_CLASS), false);
  assert.equal(context.state.focusFormBtn.attributes.get('aria-pressed'), 'false');
  assert.equal(context.state.showTableBtn.attributes.get('aria-pressed'), 'true');
  assert.equal(context.layoutRefreshes, 1);
});

test('workspace focus survives card presentation sync and restores the table', () => {
  const context = createContext();

  assert.equal(setFormModeWorkspaceFocused(context, true), true);
  assert.equal(context.state.workspaceFocused, true);
  assert.equal(context.document.body.classList.contains(FORM_MODE_WORKSPACE_CLASS), true);
  assert.equal(context.state.focusFormBtn.attributes.get('aria-pressed'), 'true');
  assert.equal(context.state.showTableBtn.attributes.get('aria-pressed'), 'false');
  assert.deepEqual(context.scrollCalls, [{ top: 0, left: 0, behavior: 'auto' }]);

  assert.equal(setFormModeWorkspaceFocused(context, false), false);
  assert.equal(context.state.workspaceFocused, false);
  assert.equal(context.document.body.classList.contains(FORM_MODE_WORKSPACE_CLASS), false);
  assert.equal(context.state.showTableBtn.attributes.get('aria-pressed'), 'true');
  assert.equal(context.layoutRefreshes, 2);
  assert.equal(context.scrollCalls.length, 1);
});

test('workspace focus is inactive outside an active form', () => {
  assert.deepEqual(
    getFormModeWorkspaceState({ active: false, viewMode: 'form', workspaceFocused: true }),
    { focused: false }
  );
});
