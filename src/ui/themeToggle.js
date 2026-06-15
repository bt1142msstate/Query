import { onDOMReady } from '../core/domReady.js';

const THEME_STORAGE_KEY = 'queryProjectTheme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function getDefaultMatchMedia() {
  return globalThis.window?.matchMedia?.bind(globalThis.window);
}

function normalizeTheme(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function getSystemTheme(matchMediaRef = getDefaultMatchMedia()) {
  return typeof matchMediaRef === 'function' && matchMediaRef(DARK_QUERY).matches ? 'dark' : 'light';
}

function readStoredTheme(storage = globalThis.localStorage) {
  try {
    return normalizeTheme(storage?.getItem?.(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function resolveTheme(theme, options = {}) {
  const normalized = normalizeTheme(theme);
  return normalized === 'system'
    ? getSystemTheme(options.matchMedia)
    : normalized;
}

function applyTheme(theme, options = {}) {
  const root = options.root || globalThis.document?.documentElement;
  const storage = options.storage || globalThis.localStorage;
  const normalized = normalizeTheme(theme);
  const resolved = resolveTheme(normalized, options);

  if (!root) {
    return { mode: normalized, resolved };
  }

  try {
    if (normalized === 'system') {
      storage?.removeItem?.(THEME_STORAGE_KEY);
      delete root.dataset.theme;
    } else {
      storage?.setItem?.(THEME_STORAGE_KEY, normalized);
      root.dataset.theme = normalized;
    }
  } catch {
    if (normalized === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = normalized;
    }
  }

  root.dataset.themeResolved = resolved;
  return { mode: normalized, resolved };
}

function getOppositeSystemTheme(matchMediaRef = getDefaultMatchMedia()) {
  return getSystemTheme(matchMediaRef) === 'dark' ? 'light' : 'dark';
}

function getNextTheme(theme, options = {}) {
  const normalized = normalizeTheme(theme);
  return normalized === 'system'
    ? getOppositeSystemTheme(options.matchMedia)
    : 'system';
}

function formatThemeLabel(theme) {
  const normalized = normalizeTheme(theme);
  return normalized === 'system' ? 'Auto' : normalized[0].toUpperCase() + normalized.slice(1);
}

function updateThemeToggle(toggle, options = {}) {
  if (!toggle) {
    return;
  }

  const label = toggle.querySelector?.('.theme-toggle-label');
  const storage = options.storage || globalThis.localStorage;
  const matchMediaRef = options.matchMedia || getDefaultMatchMedia();
  const mode = readStoredTheme(storage);
  const resolved = resolveTheme(mode, { matchMedia: matchMediaRef });
  const next = getNextTheme(mode, { matchMedia: matchMediaRef });
  const modeLabel = formatThemeLabel(mode);
  const nextLabel = formatThemeLabel(next);
  const tooltip = `Theme: ${modeLabel}${mode === 'system' ? ` (${resolved})` : ''}. Click for ${nextLabel}.`;

  if (label) {
    label.textContent = modeLabel;
  }
  toggle.dataset.themeMode = mode === 'system' ? 'system' : 'manual';
  toggle.dataset.mobileMenuLabel = `Theme: ${modeLabel}`;
  toggle.setAttribute('aria-pressed', String(resolved === 'dark'));
  toggle.setAttribute('aria-label', tooltip);
  toggle.setAttribute('data-tooltip', tooltip);
  toggle.title = tooltip;
}

function initializeThemeToggle(options = {}) {
  const documentRef = options.document || globalThis.document;
  const windowRef = options.window || globalThis.window;
  const root = options.root || documentRef?.documentElement;
  const storage = options.storage || globalThis.localStorage;
  const matchMediaRef = options.matchMedia || windowRef?.matchMedia?.bind(windowRef);
  const toggle = options.toggle || documentRef?.querySelector?.('[data-theme-toggle]');

  if (!root) {
    return null;
  }

  applyTheme(readStoredTheme(storage), { root, storage, matchMedia: matchMediaRef });
  updateThemeToggle(toggle, { storage, matchMedia: matchMediaRef });

  toggle?.addEventListener?.('click', () => {
    const current = readStoredTheme(storage);
    applyTheme(getNextTheme(current, { matchMedia: matchMediaRef }), {
      root,
      storage,
      matchMedia: matchMediaRef
    });
    updateThemeToggle(toggle, { storage, matchMedia: matchMediaRef });
  });

  const systemTheme = typeof matchMediaRef === 'function' ? matchMediaRef(DARK_QUERY) : null;
  const onSystemThemeChange = () => {
    if (readStoredTheme(storage) === 'system') {
      applyTheme('system', { root, storage, matchMedia: matchMediaRef });
      updateThemeToggle(toggle, { storage, matchMedia: matchMediaRef });
    }
  };
  if (systemTheme?.addEventListener) {
    systemTheme.addEventListener('change', onSystemThemeChange);
  } else {
    systemTheme?.addListener?.(onSystemThemeChange);
  }

  return { mode: readStoredTheme(storage), resolved: resolveTheme(readStoredTheme(storage), { matchMedia: matchMediaRef }) };
}

onDOMReady(() => {
  initializeThemeToggle();
});

export {
  DARK_QUERY,
  THEME_STORAGE_KEY,
  applyTheme,
  formatThemeLabel,
  getNextTheme,
  getSystemTheme,
  initializeThemeToggle,
  normalizeTheme,
  readStoredTheme,
  resolveTheme,
  updateThemeToggle
};
