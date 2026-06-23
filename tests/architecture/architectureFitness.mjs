import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('architecture fitness', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { forbiddenAppWindowBridgeNames } = require('../../config/windowBridgeGlobals.cjs');
  const {
    forbiddenWindowMemberReads,
    legacyLargeModuleBudgets,
    maxModuleLines,
    moduleBoundaryRules,
    publicModuleEntrypoints,
    runtimeBridgeUsageBudget,
    sourceEntries
  } = require('../../config/architectureRules.cjs');

  const staticImportPattern = /\bimport\s+(?:[^'"]*?\bfrom\s*)?["']([^"']+)["']/gu;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  const reExportPattern = /\bexport\s+[^'"]*?\bfrom\s*["']([^"']+)["']/gu;
  const workerEntrypointPattern = /\bnew\s+Worker\(\s*new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gu;

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

    for (const match of source.matchAll(/\bdefine[A-Za-z_$]*Property\s*\(\s*window\s*,\s*([A-Za-z_$][\w$]*|['"][^'"]+['"])/gu)) {
      const rawName = match[1];
      exports.push(/^['"]/u.test(rawName) ? rawName.slice(1, -1) : `${rawName} (dynamic window property)`);
    }

    return exports;
  }

  function stripCommentsAndStrings(source) {
    let stripped = '';

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      const nextChar = source[index + 1];

      if (char === '/' && nextChar === '/') {
        stripped += '  ';
        index += 2;
        while (index < source.length && source[index] !== '\n') {
          stripped += ' ';
          index += 1;
        }
        if (index < source.length) stripped += source[index];
        continue;
      }

      if (char === '/' && nextChar === '*') {
        stripped += '  ';
        index += 2;
        while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
          stripped += source[index] === '\n' ? '\n' : ' ';
          index += 1;
        }
        if (index < source.length) {
          stripped += '  ';
          index += 1;
        }
        continue;
      }

      if (char === '"' || char === '\'' || char === '`') {
        const quote = char;
        stripped += ' ';
        index += 1;
        while (index < source.length) {
          const innerChar = source[index];
          if (innerChar === '\\') {
            stripped += ' ';
            index += 1;
            if (index < source.length) stripped += source[index] === '\n' ? '\n' : ' ';
            index += 1;
            continue;
          }
          if (innerChar === quote) {
            stripped += ' ';
            break;
          }
          stripped += innerChar === '\n' ? '\n' : ' ';
          index += 1;
        }
        continue;
      }

      stripped += char;
    }

    return stripped;
  }

  function findAppRuntimeMemberReferences(source) {
    return [...stripCommentsAndStrings(source).matchAll(/\bappRuntime\s*\.\s*([A-Za-z_$][\w$]*)\b/gu)]
      .map(match => match[1]);
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

  function getPackageNameFromSpecifier(specifier) {
    if (specifier.startsWith('.') || specifier.startsWith('node:')) {
      return null;
    }

    if (specifier.startsWith('@')) {
      const [scope, packageName] = specifier.split('/');
      return packageName ? `${scope}/${packageName}` : specifier;
    }

    return specifier.split('/')[0];
  }

  function findWorkerEntrypointSpecifiers(source) {
    return [...source.matchAll(workerEntrypointPattern)].map(match => match[1]);
  }

  function resolveLocalImport(importerPath, specifier) {
    if (!specifier.startsWith('.')) {
      return null;
    }

    const resolvedPath = resolve(rootDir, dirname(importerPath), specifier);
    return toRepoPath(resolvedPath);
  }

  function classifyLayer(relativePath) {
    if (relativePath === 'src/appModules.js') {
      return 'entry';
    }

    if (relativePath.startsWith('src/core/')) return 'core';
    if (relativePath.startsWith('src/components/')) return 'components';
    if (relativePath.startsWith('src/lib/')) return 'lib';
    if (relativePath.startsWith('src/ui/')) return 'ui';
    if (relativePath.startsWith('src/features/filters/')) return 'filters';
    if (relativePath.startsWith('src/features/history/')) return 'history';
    if (relativePath.startsWith('src/features/table/')) return 'table';
    if (relativePath.startsWith('src/features/templates/')) return 'templates';

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
  const runtimeBridgeMembers = new Set();
  const workerEntrypoints = new Set();
  const productionDependencyImports = new Set();
  let runtimeBridgeMemberReferenceCount = 0;

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
      failures.push(`${relativePath}: window.${exportName} export is forbidden; use ES modules or explicit service/action facades`);
    }

    for (const readName of findForbiddenWindowMemberReads(source)) {
      const message = forbiddenWindowMemberReads.get(readName)
        || 'Do not read former application bridge APIs from window; import directly or use an explicit service/action facade';
      failures.push(`${relativePath}: window.${readName} is forbidden; ${message}`);
    }

    for (const memberName of findAppRuntimeMemberReferences(source)) {
      runtimeBridgeMembers.add(memberName);
      runtimeBridgeMemberReferenceCount += 1;

      if (runtimeBridgeUsageBudget.forbiddenMembers.has(memberName)) {
        failures.push(`${relativePath}: appRuntime.${memberName} is forbidden; import the owning module directly or inject the dependency`);
      }
    }

    for (const specifier of findImportSpecifiers(source)) {
      const packageName = getPackageNameFromSpecifier(specifier);
      if (packageName) {
        productionDependencyImports.add(packageName);
      }

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

    for (const specifier of findWorkerEntrypointSpecifiers(source)) {
      const workerPath = resolveLocalImport(relativePath, specifier);
      if (!workerPath || extname(workerPath) !== '.js') {
        failures.push(`${relativePath}: worker entrypoint "${specifier}" must resolve to an explicit .js module`);
        continue;
      }
      if (!sourceFilePaths.has(workerPath)) {
        failures.push(`${relativePath}: worker entrypoint "${specifier}" resolves to missing or non-application module ${workerPath}`);
        continue;
      }
      const boundaryRule = findBoundaryRule(relativePath);
      const importedLayer = classifyLayer(workerPath);
      if (!boundaryRule || !boundaryRule.allowedLayers.includes(importedLayer)) {
        failures.push(`${relativePath}: ${describeBoundary(boundaryRule)} modules cannot reference worker ${workerPath} (${importedLayer} layer)`);
      }
      workerEntrypoints.add(workerPath);
    }

    importGraph.set(relativePath, localImports);
  }

  for (const cycle of assertAcyclicImportGraph(importGraph)) {
    failures.push(`Import cycle detected: ${cycle}`);
  }

  const reachableModules = collectReachableModules(importGraph, 'src/appModules.js');
  for (const entryPath of publicModuleEntrypoints || []) {
    for (const reachablePublicModule of collectReachableModules(importGraph, entryPath)) {
      reachableModules.add(reachablePublicModule);
    }
  }
  for (const workerPath of workerEntrypoints) {
    for (const reachableWorkerModule of collectReachableModules(importGraph, workerPath)) {
      reachableModules.add(reachableWorkerModule);
    }
  }
  for (const sourcePath of sourceFilePaths) {
    if (!reachableModules.has(sourcePath)) {
      failures.push(`${sourcePath}: application module is not reachable from src/appModules.js`);
    }
  }

  if (runtimeBridgeMemberReferenceCount > runtimeBridgeUsageBudget.maxMemberReferences) {
    failures.push(`appRuntime member references: ${runtimeBridgeMemberReferenceCount} exceeds budget of ${runtimeBridgeUsageBudget.maxMemberReferences}; use ES imports or explicit dependency injection`);
  }

  if (runtimeBridgeMembers.size > runtimeBridgeUsageBudget.maxDistinctMembers) {
    failures.push(`appRuntime distinct members: ${runtimeBridgeMembers.size} exceeds budget of ${runtimeBridgeUsageBudget.maxDistinctMembers}; use ES imports or explicit dependency injection`);
  }

  const packageJson = JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf8'));
  for (const dependencyName of Object.keys(packageJson.dependencies || {})) {
    if (!productionDependencyImports.has(dependencyName)) {
      failures.push(`package.json: production dependency "${dependencyName}" is not imported by application modules; remove it or move it to devDependencies`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Architecture fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  }
});
