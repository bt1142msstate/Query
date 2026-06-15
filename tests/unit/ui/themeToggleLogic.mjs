import assert from 'node:assert/strict';
import test from 'node:test';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  formatThemeLabel,
  getNextTheme,
  initializeThemeToggle,
  readStoredTheme,
  resolveTheme
} from '../../../src/ui/themeToggle.js';

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) {
    values.set(THEME_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function createRoot() {
  return { dataset: {} };
}

function createMatchMedia(matches) {
  return () => ({ matches });
}

function createMutableMatchMedia(matches = false) {
  const media = {
    matches,
    listeners: [],
    addEventListener(type, listener) {
      if (type === 'change') {
        this.listeners.push(listener);
      }
    },
    setMatches(nextMatches) {
      this.matches = nextMatches;
      this.listeners.forEach(listener => listener({ matches: nextMatches }));
    }
  };

  return {
    media,
    matchMedia() {
      return media;
    }
  };
}

function createToggle() {
  const label = { textContent: '' };
  const listeners = new Map();

  return {
    attributes: {},
    dataset: {},
    label,
    title: '',
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    click() {
      listeners.get('click')?.();
    },
    querySelector(selector) {
      return selector === '.theme-toggle-label' ? label : null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

test('theme helpers normalize storage and resolve system preference', () => {
  assert.equal(readStoredTheme(createStorage('dark')), 'dark');
  assert.equal(readStoredTheme(createStorage('light')), 'light');
  assert.equal(readStoredTheme(createStorage('unexpected')), 'system');

  assert.equal(resolveTheme('system', { matchMedia: createMatchMedia(true) }), 'dark');
  assert.equal(resolveTheme('system', { matchMedia: createMatchMedia(false) }), 'light');
  assert.equal(resolveTheme('dark', { matchMedia: createMatchMedia(false) }), 'dark');

  assert.equal(getNextTheme('system', { matchMedia: createMatchMedia(false) }), 'dark');
  assert.equal(getNextTheme('system', { matchMedia: createMatchMedia(true) }), 'light');
  assert.equal(getNextTheme('dark', { matchMedia: createMatchMedia(true) }), 'system');

  assert.equal(formatThemeLabel('system'), 'Auto');
  assert.equal(formatThemeLabel('dark'), 'Dark');
  assert.equal(formatThemeLabel('light'), 'Light');
});

test('applyTheme persists manual themes and clears storage for Auto', () => {
  const root = createRoot();
  const storage = createStorage();

  assert.deepEqual(applyTheme('dark', { root, storage, matchMedia: createMatchMedia(false) }), {
    mode: 'dark',
    resolved: 'dark'
  });
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themeResolved, 'dark');

  assert.deepEqual(applyTheme('system', { root, storage, matchMedia: createMatchMedia(true) }), {
    mode: 'system',
    resolved: 'dark'
  });
  assert.equal(storage.getItem(THEME_STORAGE_KEY), null);
  assert.equal(root.dataset.theme, undefined);
  assert.equal(root.dataset.themeResolved, 'dark');
});

test('theme toggle click switches between Auto and a manual override', () => {
  const root = createRoot();
  const storage = createStorage();
  const toggle = createToggle();

  initializeThemeToggle({
    root,
    storage,
    toggle,
    matchMedia: createMatchMedia(false)
  });

  assert.equal(root.dataset.themeResolved, 'light');
  assert.equal(toggle.label.textContent, 'Auto');
  assert.equal(toggle.dataset.mobileMenuLabel, 'Theme: Auto');
  assert.equal(toggle.dataset.themeMode, 'system');

  toggle.click();

  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.dataset.themeResolved, 'dark');
  assert.equal(toggle.label.textContent, 'Dark');
  assert.equal(toggle.dataset.themeMode, 'manual');
  assert.equal(toggle.attributes['aria-pressed'], 'true');

  toggle.click();

  assert.equal(storage.getItem(THEME_STORAGE_KEY), null);
  assert.equal(root.dataset.theme, undefined);
  assert.equal(root.dataset.themeResolved, 'light');
  assert.equal(toggle.label.textContent, 'Auto');
  assert.equal(toggle.dataset.themeMode, 'system');
});

test('Auto mode follows operating-system theme changes', () => {
  const root = createRoot();
  const storage = createStorage();
  const toggle = createToggle();
  const media = createMutableMatchMedia(false);

  initializeThemeToggle({
    root,
    storage,
    toggle,
    matchMedia: media.matchMedia
  });

  assert.equal(root.dataset.themeResolved, 'light');

  media.media.setMatches(true);

  assert.equal(root.dataset.themeResolved, 'dark');
  assert.equal(toggle.label.textContent, 'Auto');
  assert.match(toggle.attributes['aria-label'], /Theme: Auto \(dark\)/u);
});
