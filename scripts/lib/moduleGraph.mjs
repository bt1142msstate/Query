import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';

const staticImportPattern = /\bimport\s+(?:[^'"]*?\bfrom\s*)?["']([^"']+)["']/gu;
const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
const reExportPattern = /\bexport\s+[^'"]*?\bfrom\s*["']([^"']+)["']/gu;
const workerEntrypointPattern = /\bnew\s+Worker\(\s*new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gu;

function toRepoPath(rootDir, filePath) {
  return relative(rootDir, filePath).split(sep).join('/');
}

async function collectJavaScriptFiles(rootDir, entry) {
  const fullPath = resolve(rootDir, entry);
  const entryStat = await stat(fullPath);

  if (entryStat.isFile()) {
    return extname(fullPath) === '.js' ? [fullPath] : [];
  }

  const files = [];
  const children = await readdir(fullPath);
  for (const child of children) {
    files.push(...await collectJavaScriptFiles(rootDir, `${entry}/${child}`));
  }
  return files;
}

function lineCount(source) {
  const normalizedSource = source.endsWith('\n') ? source.slice(0, -1) : source;
  return normalizedSource.split('\n').length;
}

function findImportSpecifiers(source) {
  return [
    ...[...source.matchAll(staticImportPattern)].map(match => match[1]),
    ...[...source.matchAll(dynamicImportPattern)].map(match => match[1]),
    ...[...source.matchAll(reExportPattern)].map(match => match[1]),
    ...[...source.matchAll(workerEntrypointPattern)].map(match => match[1])
  ];
}

function resolveLocalImport(rootDir, importerPath, specifier) {
  if (!specifier.startsWith('.')) {
    return null;
  }

  const resolvedPath = resolve(rootDir, dirname(importerPath), specifier);
  return toRepoPath(rootDir, resolvedPath);
}

function classifyLayer(relativePath) {
  if (relativePath === 'src/appModules.js') return 'entry';
  if (relativePath.startsWith('src/core/')) return 'core';
  if (relativePath.startsWith('src/components/')) return 'components';
  if (relativePath.startsWith('src/ui/')) return 'ui';
  if (relativePath.startsWith('src/features/filters/')) return 'filters';
  if (relativePath.startsWith('src/features/history/')) return 'history';
  if (relativePath.startsWith('src/features/table/')) return 'table';
  if (relativePath.startsWith('src/features/templates/')) return 'templates';
  if (relativePath.startsWith('src/styles/')) return 'styles';
  return relativePath.split('/')[0] || 'unknown';
}

function findCycles(graph) {
  const state = new Map();
  const stack = [];
  const cycles = [];

  function visit(node) {
    state.set(node, 'visiting');
    stack.push(node);

    for (const child of graph.get(node) || []) {
      if (state.get(child) === 'visiting') {
        const cycleStart = stack.indexOf(child);
        cycles.push([...stack.slice(cycleStart), child]);
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

async function buildModuleGraph({ rootDir, sourceEntries = ['src'] }) {
  const sourceFiles = (await Promise.all(
    sourceEntries.map(entry => collectJavaScriptFiles(rootDir, entry))
  )).flat();
  const sourceFilePaths = new Set(sourceFiles.map(filePath => toRepoPath(rootDir, filePath)));
  const graph = new Map();
  const reverseGraph = new Map();
  const modules = new Map();

  for (const filePath of sourceFiles) {
    const relativePath = toRepoPath(rootDir, filePath);
    const source = await readFile(filePath, 'utf8');
    const localImports = [];

    for (const specifier of findImportSpecifiers(source)) {
      const importedPath = resolveLocalImport(rootDir, relativePath, specifier);
      if (!importedPath || !sourceFilePaths.has(importedPath)) {
        continue;
      }
      localImports.push(importedPath);
    }

    const uniqueImports = [...new Set(localImports)];
    graph.set(relativePath, uniqueImports);
    modules.set(relativePath, {
      fanIn: 0,
      fanOut: uniqueImports.length,
      imports: uniqueImports,
      importedBy: [],
      instability: 1,
      layer: classifyLayer(relativePath),
      lines: lineCount(source),
      path: relativePath
    });

    uniqueImports.forEach(importedPath => {
      if (!reverseGraph.has(importedPath)) {
        reverseGraph.set(importedPath, new Set());
      }
      reverseGraph.get(importedPath).add(relativePath);
    });
  }

  for (const [relativePath, moduleMetrics] of modules.entries()) {
    const importedBy = [...(reverseGraph.get(relativePath) || [])].sort();
    const fanIn = importedBy.length;
    const fanOut = moduleMetrics.fanOut;
    modules.set(relativePath, {
      ...moduleMetrics,
      fanIn,
      importedBy,
      instability: fanOut / Math.max(1, fanIn + fanOut)
    });
  }

  return {
    cycles: findCycles(graph),
    graph,
    modules
  };
}

function summarizeModuleGraph(graphReport) {
  const modules = [...graphReport.modules.values()];
  const averageFanOut = modules.reduce((sum, moduleMetrics) => sum + moduleMetrics.fanOut, 0) / Math.max(1, modules.length);
  const averageFanIn = modules.reduce((sum, moduleMetrics) => sum + moduleMetrics.fanIn, 0) / Math.max(1, modules.length);
  const maxFanOut = Math.max(0, ...modules.map(moduleMetrics => moduleMetrics.fanOut));
  const maxFanIn = Math.max(0, ...modules.map(moduleMetrics => moduleMetrics.fanIn));

  return {
    averageFanIn,
    averageFanOut,
    maxFanIn,
    maxFanOut,
    moduleCount: modules.length
  };
}

export {
  buildModuleGraph,
  classifyLayer,
  summarizeModuleGraph
};
