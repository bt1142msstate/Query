import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { forbiddenAppWindowBridgeNames } = require('../config/windowBridgeGlobals.cjs');
const {
  forbiddenWindowMemberReads,
  legacyLargeModuleBudgets,
  maxModuleLines,
  moduleBoundaryRules,
  sourceEntries
} = require('../config/architectureRules.cjs');

const staticImportPattern = /\bimport\s+(?:[^'"]*?\bfrom\s*)?["']([^"']+)["']/gu;
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
const reExportPattern = /\bexport\s+[^'"]*?\bfrom\s*["']([^"']+)["']/gu;

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

function findForbiddenWindowMemberReads(source) {
  const reads = [];
  const names = new Set([
    ...forbiddenWindowMemberReads.keys(),
    ...forbiddenAppWindowBridgeNames
  ]);

  for (const name of names) {
    const pattern = new RegExp(`\\bwindow\\.${name}\\b`, 'u');
    if (pattern.test(source)) {
      reads.push(name);
    }
  }
  return reads;
}

function toRepoPath(filePath) {
  return relative(rootDir, filePath).split(sep).join('/');
}

function findImportSpecifiers(source) {
  return [
    ...[...source.matchAll(staticImportPattern)].map(match => match[1]),
    ...[...source.matchAll(dynamicImportPattern)].map(match => match[1]),
    ...[...source.matchAll(reExportPattern)].map(match => match[1])
  ];
}

function resolveLocalImport(importerPath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const resolvedPath = resolve(rootDir, dirname(importerPath), specifier);
  return toRepoPath(resolvedPath);
}

function classifyLayer(relativePath) {
  if (relativePath === 'appModules.js') {
    return 'entry';
  }

  return relativePath.split('/')[0] || 'unknown';
}

function findBoundaryRule(relativePath) {
  return moduleBoundaryRules.find(rule => {
    if (rule.path) {
      return rule.path === relativePath;
    }

    return Boolean(rule.prefix && relativePath.startsWith(rule.prefix));
  });
}

function describeBoundary(rule) {
  return rule?.path || `${rule?.prefix || '<unknown>'}*`;
}

function assertAcyclicImportGraph(graph) {
  const state = new Map();
  const stack = [];
  const cycles = [];

  function visit(node) {
    state.set(node, 'visiting');
    stack.push(node);

    for (const child of graph.get(node) || []) {
      if (state.get(child) === 'visiting') {
        const cycleStart = stack.indexOf(child);
        cycles.push([...stack.slice(cycleStart), child].join(' -> '));
        continue;
      }

      if (!state.has(child)) {
        visit(child);
      }
    }

    stack.pop();
    state.set(node, 'visited');
  }

  for (const node of graph.keys()) {
    if (!state.has(node)) {
      visit(node);
    }
  }

  return cycles;
}

function collectReachableModules(graph, entryPath) {
  const reachable = new Set();

  function visit(node) {
    if (reachable.has(node)) {
      return;
    }

    reachable.add(node);
    for (const child of graph.get(node) || []) {
      visit(child);
    }
  }

  visit(entryPath);
  return reachable;
}

const sourceFiles = (await Promise.all(sourceEntries.map(collectJavaScriptFiles))).flat();
const sourceFilePaths = new Set(sourceFiles.map(toRepoPath));
const importGraph = new Map();
const failures = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, 'utf8');
  const relativePath = toRepoPath(filePath);
  const lines = lineCount(source);
  const legacyBudget = legacyLargeModuleBudgets.get(relativePath);
  const localImports = [];

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
    failures.push(`${relativePath}: window.${exportName} export is forbidden; use ES modules or the private appRuntime registry`);
  }

  for (const readName of findForbiddenWindowMemberReads(source)) {
    const message = forbiddenWindowMemberReads.get(readName)
      || 'Do not read former application bridge APIs from window; import directly or use appRuntime while legacy cycles remain';
    failures.push(`${relativePath}: window.${readName} is forbidden; ${message}`);
  }

  for (const specifier of findImportSpecifiers(source)) {
    const importedPath = resolveLocalImport(relativePath, specifier);
    if (!importedPath) {
      continue;
    }

    if (extname(importedPath) !== '.js') {
      failures.push(`${relativePath}: local import "${specifier}" must resolve to an explicit .js module`);
      continue;
    }

    if (!sourceFilePaths.has(importedPath)) {
      failures.push(`${relativePath}: local import "${specifier}" resolves to missing or non-application module ${importedPath}`);
      continue;
    }

    const boundaryRule = findBoundaryRule(relativePath);
    const importedLayer = classifyLayer(importedPath);
    if (!boundaryRule || !boundaryRule.allowedLayers.includes(importedLayer)) {
      failures.push(`${relativePath}: ${describeBoundary(boundaryRule)} modules cannot import ${importedPath} (${importedLayer} layer)`);
    }

    localImports.push(importedPath);
  }

  importGraph.set(relativePath, localImports);
}

for (const cycle of assertAcyclicImportGraph(importGraph)) {
  failures.push(`Import cycle detected: ${cycle}`);
}

const reachableModules = collectReachableModules(importGraph, 'appModules.js');
for (const sourcePath of sourceFilePaths) {
  if (!reachableModules.has(sourcePath)) {
    failures.push(`${sourcePath}: application module is not reachable from appModules.js`);
  }
}

if (failures.length > 0) {
  throw new Error(`Architecture fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
}

console.log('Architecture fitness check passed');
