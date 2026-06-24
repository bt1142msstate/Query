import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  collectCognitiveComplexity,
  collectGitChangeCoupling,
  summarizeFolderModularity
} from './lib/architectureMetrics.mjs';
import { buildModuleGraph, summarizeModuleGraph } from './lib/moduleGraph.mjs';

const require = createRequire(import.meta.url);
const {
  changeCouplingBudgets,
  couplingModularityBudgets,
  folderModularityBudgets,
  maintainabilityBudgets,
  sourceEntries
} = require('../config/architectureRules.cjs');
const rootDir = resolve(import.meta.dirname, '..');
const report = await buildModuleGraph({ rootDir, sourceEntries });
const summary = summarizeModuleGraph(report);
const modules = [...report.modules.values()];

function printTable(title, rows) {
  console.log(`\n${title}`);
  console.table(rows.map(moduleMetrics => ({
    module: moduleMetrics.path,
    layer: moduleMetrics.layer,
    lines: moduleMetrics.lines,
    fanOut: moduleMetrics.fanOut,
    fanIn: moduleMetrics.fanIn,
    instability: Number(moduleMetrics.instability.toFixed(2))
  })));
}

console.log('Architecture Coupling / Modularity Metrics');
console.log(`Modules: ${summary.moduleCount}`);
console.log(`Average fan-out: ${summary.averageFanOut.toFixed(2)} / budget ${couplingModularityBudgets.maxAverageFanOut}`);
console.log(`Max fan-out: ${summary.maxFanOut} / entry budget ${couplingModularityBudgets.maxEntrypointFanOut}`);
console.log(`Max fan-in: ${summary.maxFanIn} / budget ${couplingModularityBudgets.maxModuleFanIn}`);
console.log(`Import cycles: ${report.cycles.length}`);

printTable(
  'Highest fan-out modules',
  modules
    .toSorted((a, b) => b.fanOut - a.fanOut || b.lines - a.lines)
    .slice(0, 12)
);

printTable(
  'Highest fan-in modules',
  modules
    .toSorted((a, b) => b.fanIn - a.fanIn || b.lines - a.lines)
    .slice(0, 12)
);

printTable(
  'Largest modules',
  modules
    .toSorted((a, b) => b.lines - a.lines || b.fanOut - a.fanOut)
    .slice(0, 12)
);

console.log('\nFolder Cohesion / Leakage');
console.table(summarizeFolderModularity(report)
  .filter(folder => !(folderModularityBudgets.ignoredFolders || []).includes(folder.folder))
  .slice(0, 12)
  .map(folder => ({
    folder: folder.folder,
    modules: folder.moduleCount,
    internalImports: folder.internalImports,
    externalImports: folder.externalImports,
    externalImportsPerModule: Number(folder.externalImportsPerModule.toFixed(2)),
    internalImportRatio: Number(folder.internalImportRatio.toFixed(2)),
    incomingExternalImports: folder.incomingExternalImports
  })));

const cognitiveResults = await collectCognitiveComplexity({ rootDir, modules });
console.log('\nHighest Cognitive Complexity Functions');
console.table(cognitiveResults.slice(0, 12).map(result => ({
  module: result.path,
  function: result.functionName,
  line: result.line,
  layer: result.layer,
  cognitiveComplexity: result.complexity,
  budget: maintainabilityBudgets.maxCognitiveComplexityByLayer[result.layer] || ''
})));

const changeCoupling = await collectGitChangeCoupling({
  commitLimit: changeCouplingBudgets.commitLimit,
  knownFiles: new Set(modules.map(moduleMetrics => moduleMetrics.path)),
  maxFilesPerCommit: changeCouplingBudgets.maxFilesPerCommit,
  rootDir
});
console.log('\nGit Change Coupling');
console.log(`Analyzed commits: ${changeCoupling.analyzedCommitCount}`);
console.log(`Skipped bulk commits: ${changeCoupling.skippedBulkCommitCount}`);
console.table(changeCoupling.pairs
  .filter(pair =>
    !pair.sameFolder
    && pair.coChanges >= changeCouplingBudgets.minCoChanges
  )
  .slice(0, 12)
  .map(pair => ({
    coChanges: pair.coChanges,
    confidence: Number(pair.confidence.toFixed(2)),
    left: pair.left,
    right: pair.right,
    leftFolder: pair.leftFolder,
    rightFolder: pair.rightFolder
  })));
