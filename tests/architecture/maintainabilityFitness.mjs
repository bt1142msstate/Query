import { ESLint } from 'eslint';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildModuleGraph } from '../../scripts/lib/moduleGraph.mjs';

function groupModulesByLayer(modules) {
  const grouped = new Map();
  modules.forEach(moduleMetrics => {
    if (moduleMetrics.layer === 'entry' || moduleMetrics.layer === 'styles') {
      return;
    }
    if (!grouped.has(moduleMetrics.layer)) {
      grouped.set(moduleMetrics.layer, []);
    }
    grouped.get(moduleMetrics.layer).push(moduleMetrics);
  });
  return grouped;
}

async function collectEslintBudgetFailures({ layer, modules, ruleId, ruleConfig }) {
  if (!modules.length) {
    return [];
  }

  const eslint = new ESLint({
    overrideConfig: {
      rules: {
        [ruleId]: ruleConfig
      }
    }
  });
  const results = await eslint.lintFiles(modules.map(moduleMetrics => moduleMetrics.path));
  const failures = [];

  results.forEach(result => {
    const relativePath = result.filePath.replace(`${process.cwd()}/`, '');
    result.messages
      .filter(message => message.ruleId === ruleId)
      .forEach(message => {
        failures.push(`${relativePath}:${message.line}: ${layer} ${ruleId} budget failed: ${message.message}`);
      });
  });

  return failures;
}

test('maintainability budgets by layer', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { maintainabilityBudgets, sourceEntries } = require('../../config/architectureRules.cjs');
  const report = await buildModuleGraph({ rootDir, sourceEntries });
  const modules = [...report.modules.values()];
  const modulesByLayer = groupModulesByLayer(modules);
  const failures = [];

  for (const moduleMetrics of modules) {
    const maxModuleLines = maintainabilityBudgets.maxModuleLinesByLayer[moduleMetrics.layer];
    if (maxModuleLines && moduleMetrics.lines > maxModuleLines) {
      failures.push(`${moduleMetrics.path}: ${moduleMetrics.lines} lines exceeds ${moduleMetrics.layer} budget of ${maxModuleLines}`);
    }
  }

  for (const [layer, layerModules] of modulesByLayer.entries()) {
    const maxFunctionLines = maintainabilityBudgets.maxFunctionLinesByLayer[layer];
    if (maxFunctionLines) {
      failures.push(...await collectEslintBudgetFailures({
        layer,
        modules: layerModules,
        ruleConfig: ['error', {
          IIFEs: false,
          max: maxFunctionLines,
          skipBlankLines: true,
          skipComments: true
        }],
        ruleId: 'max-lines-per-function'
      }));
    }

    const maxComplexity = maintainabilityBudgets.maxCyclomaticComplexityByLayer[layer];
    if (maxComplexity) {
      failures.push(...await collectEslintBudgetFailures({
        layer,
        modules: layerModules,
        ruleConfig: ['error', { max: maxComplexity }],
        ruleId: 'complexity'
      }));
    }

    const maxDepth = maintainabilityBudgets.maxDepthByLayer[layer];
    if (maxDepth) {
      failures.push(...await collectEslintBudgetFailures({
        layer,
        modules: layerModules,
        ruleConfig: ['error', maxDepth],
        ruleId: 'max-depth'
      }));
    }
  }

  failures.push(...await collectEslintBudgetFailures({
    layer: 'all',
    modules,
    ruleConfig: ['error', { max: maintainabilityBudgets.maxParams }],
    ruleId: 'max-params'
  }));

  if (failures.length > 0) {
    throw new Error(`Maintainability fitness check failed:\n${failures.map(failure => `- ${failure}`).join('\n')}`);
  }
});
