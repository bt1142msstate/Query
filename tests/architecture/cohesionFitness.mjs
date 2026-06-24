import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  collectGitChangeCoupling,
  summarizeFolderModularity
} from '../../scripts/lib/architectureMetrics.mjs';
import { buildModuleGraph } from '../../scripts/lib/moduleGraph.mjs';

test('folder cohesion and temporal change coupling fitness', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const {
    changeCouplingBudgets,
    folderModularityBudgets,
    sourceEntries
  } = require('../../config/architectureRules.cjs');
  const report = await buildModuleGraph({ rootDir, sourceEntries });
  const modules = [...report.modules.values()];
  const failures = [];
  const ignoredFolders = new Set(folderModularityBudgets.ignoredFolders || []);

  const folderMetrics = summarizeFolderModularity(report);
  const leakyFolders = folderMetrics.filter(folder =>
    !ignoredFolders.has(folder.folder)
    && folder.moduleCount >= folderModularityBudgets.minModulesForCohesionCheck
    && folder.externalImportsPerModule > folderModularityBudgets.maxExternalImportsPerModule
  );
  leakyFolders.forEach(folder => {
    failures.push(
      `${folder.folder}: ${folder.externalImportsPerModule.toFixed(2)} external imports/module exceeds ${folderModularityBudgets.maxExternalImportsPerModule}`
    );
  });

  const inboundHubFolders = folderMetrics.filter(folder =>
    !ignoredFolders.has(folder.folder)
    && folder.incomingExternalImportsPerModule > folderModularityBudgets.maxIncomingExternalImportsPerModule
  );
  inboundHubFolders.forEach(folder => {
    failures.push(
      `${folder.folder}: ${folder.incomingExternalImportsPerModule.toFixed(2)} incoming external imports/module exceeds ${folderModularityBudgets.maxIncomingExternalImportsPerModule}`
    );
  });

  const lowCohesionFolders = folderMetrics.filter(folder =>
    !ignoredFolders.has(folder.folder)
    && folder.moduleCount >= folderModularityBudgets.minModulesForCohesionCheck
    && folder.totalImports >= folderModularityBudgets.minImportsForCohesionCheck
    && folder.internalImportRatio < folderModularityBudgets.minInternalImportRatio
  );
  if (lowCohesionFolders.length > folderModularityBudgets.maxLowCohesionFolderCount) {
    failures.push(
      `Low-cohesion folder count ${lowCohesionFolders.length} exceeds ${folderModularityBudgets.maxLowCohesionFolderCount}: ${
        lowCohesionFolders.map(folder => `${folder.folder} (${folder.internalImportRatio.toFixed(2)})`).join(', ')
      }`
    );
  }

  const changeCoupling = await collectGitChangeCoupling({
    commitLimit: changeCouplingBudgets.commitLimit,
    knownFiles: new Set(modules.map(moduleMetrics => moduleMetrics.path)),
    maxFilesPerCommit: changeCouplingBudgets.maxFilesPerCommit,
    rootDir
  });
  const highConfidenceCrossFolderPairs = changeCoupling.pairs.filter(pair =>
    !pair.sameFolder
    && pair.coChanges >= changeCouplingBudgets.minCoChanges
    && pair.confidence >= changeCouplingBudgets.highConfidenceThreshold
  );

  if (highConfidenceCrossFolderPairs.length > changeCouplingBudgets.maxCrossFolderHighConfidencePairs) {
    failures.push(
      `High-confidence cross-folder change-coupling pair count ${highConfidenceCrossFolderPairs.length} exceeds ${changeCouplingBudgets.maxCrossFolderHighConfidencePairs}: ${
        highConfidenceCrossFolderPairs
          .slice(0, 8)
          .map(pair => `${pair.left} <-> ${pair.right} (${pair.coChanges}, ${pair.confidence.toFixed(2)})`)
          .join('; ')
      }`
    );
  }

  if (failures.length > 0) {
    throw new Error(`Cohesion fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  }
});
