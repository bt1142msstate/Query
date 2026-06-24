import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  collectCognitiveComplexity,
  collectGitChangeCoupling,
  summarizeFolderModularity
} from './architectureMetrics.mjs';
import { buildModuleGraph, classifyLayer, summarizeModuleGraph } from './moduleGraph.mjs';

const require = createRequire(import.meta.url);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreLowerIsBetter({ actual, budget, ideal, points, label, unit = '' }) {
  const safePoints = Math.max(0, Math.round(points));
  const safeBudget = Number.isFinite(budget) && budget > 0 ? budget : 1;
  const safeIdeal = Number.isFinite(ideal) ? ideal : 0;
  const safeActual = Number.isFinite(actual) ? actual : safeBudget * 2;
  const passingLossCap = Math.max(1, Math.ceil(safePoints * 0.2));
  let loss = 0;

  if (safeActual > safeIdeal && safeActual <= safeBudget) {
    const range = Math.max(1, safeBudget - safeIdeal);
    loss = Math.ceil(((safeActual - safeIdeal) / range) * passingLossCap);
  } else if (safeActual > safeBudget) {
    const overBudgetRatio = (safeActual - safeBudget) / safeBudget;
    loss = passingLossCap + Math.ceil(overBudgetRatio * (safePoints - passingLossCap) * 2);
  }

  const earned = clamp(safePoints - loss, 0, safePoints);
  return {
    actual: safeActual,
    budget: safeBudget,
    earned,
    ideal: safeIdeal,
    label,
    max: safePoints,
    unit
  };
}

function scoreHigherIsBetter({ actual, budget, ideal, points, label, unit = '' }) {
  const safePoints = Math.max(0, Math.round(points));
  const safeBudget = Number.isFinite(budget) ? budget : 0;
  const safeIdeal = Number.isFinite(ideal) ? ideal : safeBudget;
  const safeActual = Number.isFinite(actual) ? actual : 0;
  const passingLossCap = Math.max(1, Math.ceil(safePoints * 0.2));
  let loss = 0;

  if (safeActual < safeIdeal && safeActual >= safeBudget) {
    const range = Math.max(0.01, safeIdeal - safeBudget);
    loss = Math.ceil(((safeIdeal - safeActual) / range) * passingLossCap);
  } else if (safeActual < safeBudget) {
    const belowBudgetRatio = (safeBudget - safeActual) / Math.max(0.01, safeBudget);
    loss = passingLossCap + Math.ceil(belowBudgetRatio * (safePoints - passingLossCap) * 2);
  }

  const earned = clamp(safePoints - loss, 0, safePoints);
  return {
    actual: safeActual,
    budget: safeBudget,
    earned,
    ideal: safeIdeal,
    label,
    max: safePoints,
    unit
  };
}

function scoreBinary({ actual, budget = 0, points, label, unit = '' }) {
  return scoreLowerIsBetter({
    actual,
    budget,
    ideal: 0,
    label,
    points,
    unit
  });
}

function sumMetrics(metrics) {
  return metrics.reduce((total, metric) => total + metric.earned, 0);
}

function buildCategory(name, metrics) {
  const max = metrics.reduce((total, metric) => total + metric.max, 0);
  return {
    earned: sumMetrics(metrics),
    max,
    metrics,
    name
  };
}

function getBoundaryRule(relativePath, moduleBoundaryRules) {
  return moduleBoundaryRules.find(rule => {
    if (rule.path) {
      return rule.path === relativePath;
    }
    return Boolean(rule.prefix && relativePath.startsWith(rule.prefix));
  });
}

function getBoundaryViolationCount(modules, moduleBoundaryRules) {
  let violations = 0;
  modules.forEach(moduleMetrics => {
    const boundaryRule = getBoundaryRule(moduleMetrics.path, moduleBoundaryRules);
    moduleMetrics.imports.forEach(importedPath => {
      const importedLayer = classifyLayer(importedPath);
      if (!boundaryRule || !boundaryRule.allowedLayers.includes(importedLayer)) {
        violations += 1;
      }
    });
  });
  return violations;
}

function collectReachableModules(graphReport, entryPaths) {
  const reachable = new Set();

  function visit(node) {
    if (!node || reachable.has(node)) {
      return;
    }
    reachable.add(node);
    for (const child of graphReport.graph.get(node) || []) {
      visit(child);
    }
  }

  entryPaths.forEach(visit);
  return reachable;
}

function getLargeCoordinatorCounts(modules, budgets) {
  const largeCoordinators = modules.filter(moduleMetrics =>
    moduleMetrics.lines > budgets.largeCoordinatorLineThreshold
  );
  const largeHighFanOutCoordinators = largeCoordinators.filter(moduleMetrics =>
    moduleMetrics.fanOut >= budgets.highFanOutThreshold
  );

  return {
    largeCoordinatorCount: largeCoordinators.length,
    largeHighFanOutCoordinatorCount: largeHighFanOutCoordinators.length
  };
}

function getMaxNonEntrypointFanOut(modules) {
  return Math.max(0, ...modules
    .filter(moduleMetrics => moduleMetrics.path !== 'src/appModules.js')
    .map(moduleMetrics => moduleMetrics.fanOut));
}

function getLayerLineRatio(moduleMetrics, maintainabilityBudgets) {
  const lineBudget = maintainabilityBudgets.maxModuleLinesByLayer[moduleMetrics.layer];
  return lineBudget ? moduleMetrics.lines / lineBudget : 0;
}

function getCognitiveRatio(result, maintainabilityBudgets) {
  const budget = maintainabilityBudgets.maxCognitiveComplexityByLayer[result.layer];
  return budget ? result.complexity / budget : 0;
}

function getMaintainabilityMetrics({ cognitiveResults, maintainabilityBudgets, modules }) {
  const maxLineRatio = Math.max(0, ...modules.map(moduleMetrics =>
    getLayerLineRatio(moduleMetrics, maintainabilityBudgets)
  ));
  const nearLineBudgetCount = modules.filter(moduleMetrics =>
    getLayerLineRatio(moduleMetrics, maintainabilityBudgets) >= 0.95
  ).length;
  const maxCognitiveRatio = Math.max(0, ...cognitiveResults.map(result =>
    getCognitiveRatio(result, maintainabilityBudgets)
  ));
  const cognitiveHotspotCount = cognitiveResults.filter(result =>
    getCognitiveRatio(result, maintainabilityBudgets) >= 0.75
  ).length;

  return {
    cognitiveHotspotCount,
    maxCognitiveRatio,
    maxLineRatio,
    nearLineBudgetCount
  };
}

function getFolderCohesionMetrics({ folderMetrics, folderModularityBudgets }) {
  const ignoredFolders = new Set(folderModularityBudgets.ignoredFolders || []);
  const scoredFolders = folderMetrics.filter(folder => !ignoredFolders.has(folder.folder));
  const cohesionCheckedFolders = scoredFolders.filter(folder =>
    folder.moduleCount >= folderModularityBudgets.minModulesForCohesionCheck
    && folder.totalImports >= folderModularityBudgets.minImportsForCohesionCheck
  );
  const leakyFolders = scoredFolders.filter(folder =>
    folder.moduleCount >= folderModularityBudgets.minModulesForCohesionCheck
    && folder.externalImportsPerModule > folderModularityBudgets.maxExternalImportsPerModule
  );
  const lowCohesionFolders = cohesionCheckedFolders.filter(folder =>
    folder.internalImportRatio < folderModularityBudgets.minInternalImportRatio
  );

  return {
    leakyFolderCount: leakyFolders.length,
    lowCohesionFolderCount: lowCohesionFolders.length,
    maxExternalImportsPerModule: Math.max(0, ...scoredFolders
      .filter(folder => folder.moduleCount >= folderModularityBudgets.minModulesForCohesionCheck)
      .map(folder => folder.externalImportsPerModule)),
    maxIncomingExternalImportsPerModule: Math.max(0, ...scoredFolders.map(folder => folder.incomingExternalImportsPerModule)),
    minCheckedInternalImportRatio: Math.min(1, ...cohesionCheckedFolders.map(folder => folder.internalImportRatio))
  };
}

function getChangeCouplingMetrics({ changeCoupling, changeCouplingBudgets }) {
  const crossFolderPairs = changeCoupling.pairs.filter(pair =>
    !pair.sameFolder && pair.coChanges >= changeCouplingBudgets.minCoChanges
  );
  const highConfidenceCrossFolderPairs = crossFolderPairs.filter(pair =>
    pair.confidence >= changeCouplingBudgets.highConfidenceThreshold
  );

  return {
    analyzedCommitCount: changeCoupling.analyzedCommitCount,
    highConfidenceCrossFolderPairCount: highConfidenceCrossFolderPairs.length,
    topCrossFolderConfidence: Math.max(0, ...crossFolderPairs.map(pair => pair.confidence))
  };
}

function getPrimaryFindings(categories) {
  return categories
    .flatMap(category => category.metrics.map(metric => ({
      ...metric,
      category: category.name,
      lost: metric.max - metric.earned
    })))
    .filter(metric => metric.lost > 0)
    .toSorted((left, right) =>
      right.lost - left.lost
      || right.max - left.max
      || left.label.localeCompare(right.label)
    )
    .slice(0, 8);
}

async function collectArchitectureScore({
  rootDir = resolve(import.meta.dirname, '../..')
} = {}) {
  const {
    changeCouplingBudgets,
    couplingModularityBudgets,
    folderModularityBudgets,
    maintainabilityBudgets,
    moduleBoundaryRules,
    publicModuleEntrypoints,
    sourceEntries
  } = require('../../config/architectureRules.cjs');
  const graphReport = await buildModuleGraph({ rootDir, sourceEntries });
  const graphSummary = summarizeModuleGraph(graphReport);
  const modules = [...graphReport.modules.values()];
  const reachable = collectReachableModules(graphReport, ['src/appModules.js', ...(publicModuleEntrypoints || [])]);
  const unreachableCount = modules.filter(moduleMetrics => !reachable.has(moduleMetrics.path)).length;
  const boundaryViolationCount = getBoundaryViolationCount(modules, moduleBoundaryRules);
  const maxNonEntrypointFanOut = getMaxNonEntrypointFanOut(modules);
  const coordinatorCounts = getLargeCoordinatorCounts(modules, couplingModularityBudgets);
  const cognitiveResults = await collectCognitiveComplexity({ rootDir, modules });
  const maintainabilityMetrics = getMaintainabilityMetrics({
    cognitiveResults,
    maintainabilityBudgets,
    modules
  });
  const folderMetrics = summarizeFolderModularity(graphReport);
  const folderCohesionMetrics = getFolderCohesionMetrics({
    folderMetrics,
    folderModularityBudgets
  });
  const changeCoupling = await collectGitChangeCoupling({
    commitLimit: changeCouplingBudgets.commitLimit,
    knownFiles: new Set(modules.map(moduleMetrics => moduleMetrics.path)),
    maxFilesPerCommit: changeCouplingBudgets.maxFilesPerCommit,
    rootDir
  });
  const changeCouplingMetrics = getChangeCouplingMetrics({
    changeCoupling,
    changeCouplingBudgets
  });

  const categories = [
    buildCategory('Graph Integrity', [
      scoreBinary({
        actual: graphReport.cycles.length,
        budget: 0,
        label: 'Import cycles',
        points: 8
      }),
      scoreBinary({
        actual: boundaryViolationCount,
        budget: 0,
        label: 'Layer boundary violations',
        points: 7
      }),
      scoreBinary({
        actual: unreachableCount,
        budget: 0,
        label: 'Unreachable source modules',
        points: 5
      })
    ]),
    buildCategory('Coupling And Modularity', [
      scoreLowerIsBetter({
        actual: graphSummary.averageFanOut,
        budget: couplingModularityBudgets.maxAverageFanOut,
        ideal: couplingModularityBudgets.maxAverageFanOut * 0.82,
        label: 'Average fan-out',
        points: 5
      }),
      scoreLowerIsBetter({
        actual: maxNonEntrypointFanOut,
        budget: couplingModularityBudgets.maxNonEntrypointFanOut,
        ideal: couplingModularityBudgets.maxNonEntrypointFanOut * 0.75,
        label: 'Max non-entrypoint fan-out',
        points: 4
      }),
      scoreLowerIsBetter({
        actual: graphSummary.maxFanIn,
        budget: couplingModularityBudgets.maxModuleFanIn,
        ideal: couplingModularityBudgets.maxModuleFanIn * 0.75,
        label: 'Max fan-in',
        points: 5
      }),
      scoreLowerIsBetter({
        actual: coordinatorCounts.largeCoordinatorCount,
        budget: couplingModularityBudgets.maxLargeCoordinatorCount,
        ideal: Math.max(0, couplingModularityBudgets.maxLargeCoordinatorCount - 3),
        label: 'Large coordinator count',
        points: 3
      }),
      scoreLowerIsBetter({
        actual: coordinatorCounts.largeHighFanOutCoordinatorCount,
        budget: couplingModularityBudgets.maxLargeHighFanOutCoordinatorCount,
        ideal: Math.max(0, couplingModularityBudgets.maxLargeHighFanOutCoordinatorCount - 3),
        label: 'Large high-fan-out coordinator count',
        points: 3
      })
    ]),
    buildCategory('Maintainability', [
      scoreLowerIsBetter({
        actual: maintainabilityMetrics.maxLineRatio,
        budget: 1,
        ideal: 0.82,
        label: 'Largest module line-budget pressure',
        points: 8,
        unit: 'ratio'
      }),
      scoreLowerIsBetter({
        actual: maintainabilityMetrics.nearLineBudgetCount,
        budget: 6,
        ideal: 0,
        label: 'Modules at 95%+ of line budget',
        points: 5
      }),
      scoreLowerIsBetter({
        actual: maintainabilityMetrics.maxCognitiveRatio,
        budget: 1,
        ideal: 0.7,
        label: 'Cognitive-complexity budget pressure',
        points: 7,
        unit: 'ratio'
      }),
      scoreLowerIsBetter({
        actual: maintainabilityMetrics.cognitiveHotspotCount,
        budget: 8,
        ideal: 0,
        label: 'Functions at 75%+ cognitive budget',
        points: 5
      })
    ]),
    buildCategory('Folder Cohesion', [
      scoreLowerIsBetter({
        actual: folderCohesionMetrics.leakyFolderCount,
        budget: 0,
        ideal: 0,
        label: 'Leaky folder count',
        points: 5
      }),
      scoreLowerIsBetter({
        actual: folderCohesionMetrics.maxExternalImportsPerModule,
        budget: folderModularityBudgets.maxExternalImportsPerModule,
        ideal: folderModularityBudgets.maxExternalImportsPerModule * 0.7,
        label: 'Max external imports per module',
        points: 5
      }),
      scoreLowerIsBetter({
        actual: folderCohesionMetrics.maxIncomingExternalImportsPerModule,
        budget: folderModularityBudgets.maxIncomingExternalImportsPerModule,
        ideal: folderModularityBudgets.maxIncomingExternalImportsPerModule * 0.65,
        label: 'Max incoming imports per module',
        points: 4
      }),
      scoreLowerIsBetter({
        actual: folderCohesionMetrics.lowCohesionFolderCount,
        budget: folderModularityBudgets.maxLowCohesionFolderCount,
        ideal: 0,
        label: 'Low-cohesion folder count',
        points: 4
      }),
      scoreHigherIsBetter({
        actual: folderCohesionMetrics.minCheckedInternalImportRatio,
        budget: folderModularityBudgets.minInternalImportRatio,
        ideal: 0.14,
        label: 'Minimum checked internal import ratio',
        points: 2,
        unit: 'ratio'
      })
    ]),
    buildCategory('Change Coupling', [
      scoreLowerIsBetter({
        actual: changeCouplingMetrics.highConfidenceCrossFolderPairCount,
        budget: changeCouplingBudgets.maxCrossFolderHighConfidencePairs,
        ideal: Math.max(0, changeCouplingBudgets.maxCrossFolderHighConfidencePairs - 3),
        label: 'High-confidence cross-folder change pairs',
        points: 10
      }),
      scoreLowerIsBetter({
        actual: changeCouplingMetrics.topCrossFolderConfidence,
        budget: 1,
        ideal: changeCouplingBudgets.highConfidenceThreshold,
        label: 'Top cross-folder change confidence',
        points: 3,
        unit: 'ratio'
      }),
      scoreHigherIsBetter({
        actual: changeCouplingMetrics.analyzedCommitCount,
        budget: 30,
        ideal: 80,
        label: 'Analyzed commit coverage',
        points: 2
      })
    ])
  ];

  const total = categories.reduce((sum, category) => sum + category.earned, 0);
  const max = categories.reduce((sum, category) => sum + category.max, 0);

  return {
    categories,
    max,
    primaryFindings: getPrimaryFindings(categories),
    score: clamp(Math.round((total / Math.max(1, max)) * 100), 0, 100),
    total
  };
}

export {
  collectArchitectureScore
};
