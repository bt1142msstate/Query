import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const requiredSystemTokens = [
  '--qp-sys-color-scheme',
  '--qp-sys-color-background',
  '--qp-sys-color-on-background',
  '--qp-sys-color-surface',
  '--qp-sys-color-surface-container',
  '--qp-sys-color-surface-container-high',
  '--qp-sys-color-surface-overlay',
  '--qp-sys-color-on-surface',
  '--qp-sys-color-on-surface-strong',
  '--qp-sys-color-on-surface-variant',
  '--qp-sys-color-outline',
  '--qp-sys-color-outline-strong',
  '--qp-sys-color-primary',
  '--qp-sys-color-on-primary',
  '--qp-sys-color-primary-container',
  '--qp-sys-color-focus-ring',
  '--qp-sys-color-state-hover',
  '--qp-sys-color-state-selected',
  '--qp-sys-color-input-background',
  '--qp-sys-color-input-border',
  '--qp-sys-color-list-row',
  '--qp-sys-color-list-row-hover',
  '--qp-sys-color-list-row-border',
  '--qp-sys-color-danger',
  '--qp-sys-color-warning',
  '--qp-sys-color-success',
  '--qp-sys-color-info',
  '--qp-sys-image-app-background',
  '--qp-sys-image-surface-raised',
  '--qp-sys-shadow-surface',
  '--qp-sys-shadow-surface-raised',
  '--qp-sys-shadow-list-row'
];

const requiredThemeAliases = [
  '--theme-panel-bg',
  '--theme-panel-bg-soft',
  '--theme-panel-bg-raised',
  '--theme-border',
  '--theme-border-strong',
  '--theme-text',
  '--theme-text-strong',
  '--theme-text-muted',
  '--theme-accent',
  '--theme-accent-soft',
  '--theme-list-row-bg',
  '--theme-list-row-bg-hover',
  '--theme-list-row-border'
];

function getStyleImports(appCss) {
  return [...appCss.matchAll(/@import\s+url\(["']\.\/([^"']+?\.css)(?:\?v=[^"']+)?["']\);/gu)]
    .map(match => match[1]);
}

test('theme tokens are centralized and loaded before component styles', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const [appCss, tokensCss, themeCss] = await Promise.all([
    readFile(resolve(rootDir, 'src/styles/app.css'), 'utf8'),
    readFile(resolve(rootDir, 'src/styles/tokens.css'), 'utf8'),
    readFile(resolve(rootDir, 'src/styles/theme.css'), 'utf8')
  ]);
  const styleImports = getStyleImports(appCss);

  assert.equal(styleImports[0], 'tokens.css', 'tokens.css must load before all component CSS');
  assert.ok(styleImports.indexOf('tokens.css') < styleImports.indexOf('base.css'));
  assert.ok(styleImports.indexOf('tokens.css') < styleImports.indexOf('theme.css'));
  assert.match(themeCss, /color-scheme:\s*var\(--qp-sys-color-scheme,\s*light\)/u);

  for (const token of requiredSystemTokens) {
    assert.match(tokensCss, new RegExp(`${token}\\s*:`), `${token} should be defined in tokens.css`);
  }

  assert.match(tokensCss, /:root\[data-theme-resolved="dark"\]/u);
  assert.match(tokensCss, /:root\[data-theme-accent="(?:violet|cyan)"\]/u);
  assert.match(tokensCss, /:root\[data-theme-contrast="more"\]/u);
  assert.match(tokensCss, /@media\s*\(prefers-contrast:\s*more\)/u);

  for (const alias of requiredThemeAliases) {
    assert.match(tokensCss, new RegExp(`${alias}\\s*:\\s*var\\(--qp-sys-`), `${alias} should alias a system token`);
  }

  const legacyAliasDefinitions = themeCss
    .split('\n')
    .filter(line => /^\s*--theme-(?:panel-bg|border|text|accent|list-row)[^:]*:\s*/u.test(line));
  assert.deepEqual(legacyAliasDefinitions, [], 'theme.css should not redefine legacy theme aliases with raw values');
});
