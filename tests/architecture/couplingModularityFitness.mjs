import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildModuleGraph, summarizeModuleGraph } from '../../scripts/lib/moduleGraph.mjs';

test('coupling and modularity fitness', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { couplingModularityBudgets, sourceEntries } = require('../../config/architectureRules.cjs');
  const report = await buildModuleGraph({ rootDir, sourceEntries });
  const summary = summarizeModuleGraph(report);
  const modules = [...report.modules.values()];
  const failures = [];

  if (summary.averageFanOut > couplingModularityBudgets.maxAverageFanOut) {
    failures.push(
      `Average fan-out ${summary.averageFanOut.toFixed(2)} exceeds ${couplingModularityBudgets.maxAverageFanOut}; split coordinators or inject dependencies`
    );
  }

  for (const moduleMetrics of modules) {
    if (
      moduleMetrics.path !== 'src/appModules.js'
      && moduleMetrics.fanOut > couplingModularityBudgets.maxNonEntrypointFanOut
    ) {
      failures.push(
        `${moduleMetrics.path}: fan-out ${moduleMetrics.fanOut} exceeds ${couplingModularityBudgets.maxNonEntrypointFanOut}; move orchestration into smaller feature modules`
      );
    }

    if (
      moduleMetrics.path === 'src/appModules.js'
      && moduleMetrics.fanOut > couplingModularityBudgets.maxEntrypointFanOut
    ) {
      failures.push(
        `${moduleMetrics.path}: entry fan-out ${moduleMetrics.fanOut} exceeds ${couplingModularityBudgets.maxEntrypointFanOut}; group app startup side effects behind feature entrypoints`
      );
    }

    if (moduleMetrics.fanIn > couplingModularityBudgets.maxModuleFanIn) {
      failures.push(
        `${moduleMetrics.path}: fan-in ${moduleMetrics.fanIn} exceeds ${couplingModularityBudgets.maxModuleFanIn}; this module is becoming a shared hub and may need a narrower facade`
      );
    }
  }

  const largeCoordinators = modules.filter(moduleMetrics =>
    moduleMetrics.lines > couplingModularityBudgets.largeCoordinatorLineThreshold
  );
  if (largeCoordinators.length > couplingModularityBudgets.maxLargeCoordinatorCount) {
    failures.push(
      `Large coordinator count ${largeCoordinators.length} exceeds ${couplingModularityBudgets.maxLargeCoordinatorCount}; split: ${largeCoordinators.map(moduleMetrics => moduleMetrics.path).join(', ')}`
    );
  }

  const largeHighFanOutCoordinators = largeCoordinators.filter(moduleMetrics =>
    moduleMetrics.fanOut >= couplingModularityBudgets.highFanOutThreshold
  );
  if (largeHighFanOutCoordinators.length > couplingModularityBudgets.maxLargeHighFanOutCoordinatorCount) {
    failures.push(
      `Large high-fan-out coordinator count ${largeHighFanOutCoordinators.length} exceeds ${couplingModularityBudgets.maxLargeHighFanOutCoordinatorCount}; split: ${largeHighFanOutCoordinators.map(moduleMetrics => moduleMetrics.path).join(', ')}`
    );
  }

  if (report.cycles.length > 0) {
    failures.push(`Import cycles found: ${report.cycles.map(cycle => cycle.join(' -> ')).join('; ')}`);
  }

  if (failures.length > 0) {
    throw new Error(`Coupling/modularity fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  }
});
