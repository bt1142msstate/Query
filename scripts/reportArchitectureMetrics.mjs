import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { buildModuleGraph, summarizeModuleGraph } from './lib/moduleGraph.mjs';

const require = createRequire(import.meta.url);
const { couplingModularityBudgets, sourceEntries } = require('../config/architectureRules.cjs');
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
