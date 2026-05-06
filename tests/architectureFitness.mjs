import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceEntries = ['appModules.js', 'bubbles', 'core', 'filters', 'table', 'ui'];
const maxModuleLines = 900;
const legacyLargeModuleBudgets = new Map([
  ['core/queryHistory.js', 1681],
  ['core/queryState.js', 1191],
  ['core/queryTemplates.js', 1593],
  ['core/utils.js', 1219],
  ['filters/filterManager.js', 1371],
  ['table/dragDropInteractions.js', 1348],
  ['table/postFilters.js', 1109],
  ['table/virtualTable.js', 1383],
  ['ui/fieldPicker.js', 1266],
  ['ui/formMode.js', 2034]
]);

async function collectJavaScriptFiles(entry) {
  const fullPath = resolve(rootDir, entry);
  const entryStat = await stat(fullPath);

  if (entryStat.isFile()) {
    return extname(fullPath) === '.js' ? [fullPath] : [];
  }

  const files = [];
  const children = await readdir(fullPath);
  for (const child of children) {
    files.push(...await collectJavaScriptFiles(`${entry}/${child}`));
  }
  return files;
}

async function readAllowedWindowExports() {
  const eslintConfig = await readFile(resolve(rootDir, 'eslint.config.js'), 'utf8');
  const match = eslintConfig.match(/const allowedWindowAssignments = new Set\(\[([\s\S]*?)\]\);/u);
  if (!match) {
    throw new Error('Could not find allowedWindowAssignments in eslint.config.js');
  }

  return new Set([...match[1].matchAll(/'([^']+)'/gu)].map(result => result[1]));
}

function lineCount(source) {
  const normalizedSource = source.endsWith('\n') ? source.slice(0, -1) : source;
  return normalizedSource.split('\n').length;
}

function findPublicWindowExports(source) {
  const exports = [];

  for (const match of source.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=|>)/gu)) {
    exports.push(match[1]);
  }

  for (const match of source.matchAll(/\bObject\.defineProperty\(\s*window\s*,\s*['"]([^'"]+)['"]/gu)) {
    exports.push(match[1]);
  }

  return exports;
}

const sourceFiles = (await Promise.all(sourceEntries.map(collectJavaScriptFiles))).flat();
const allowedWindowExports = await readAllowedWindowExports();
const failures = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, 'utf8');
  const relativePath = filePath.slice(rootDir.length + 1);
  const lines = lineCount(source);
  const legacyBudget = legacyLargeModuleBudgets.get(relativePath);

  if (legacyBudget) {
    if (lines > legacyBudget) {
      failures.push(`${relativePath}: ${lines} lines exceeds legacy budget of ${legacyBudget}; split responsibilities before growing it`);
    }
  } else if (lines > maxModuleLines) {
    failures.push(`${relativePath}: ${lines} lines exceeds ${maxModuleLines}; split this module or add an explicit legacy budget with a refactor plan`);
  }

  if (/\b(?:require\(|module\.exports|exports\.)/u.test(source)) {
    failures.push(`${relativePath}: application modules must use ES module imports/exports`);
  }

  if (/(?:\bimport\s*(?:\([\s\n\r]*|[^'"]*?\bfrom\s*)|\bexport\s+[^'"]*?\bfrom\s*)["'][^"']+[?#][^"']*["']/u.test(source)) {
    failures.push(`${relativePath}: module specifiers must not include cache-busting query strings or hashes`);
  }

  for (const exportName of findPublicWindowExports(source)) {
    if (!allowedWindowExports.has(exportName)) {
      failures.push(`${relativePath}: window.${exportName} is not in the approved public global allowlist`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Architecture fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
}

console.log('Architecture fitness check passed');
