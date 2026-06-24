import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectArchitectureScore } from '../../scripts/lib/architectureScore.mjs';

test('architecture score is an integer quality gate', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { architectureScoreBudgets } = require('../../config/architectureRules.cjs');
  const scoreReport = await collectArchitectureScore({ rootDir });

  assert.equal(Number.isInteger(scoreReport.score), true);
  assert.equal(scoreReport.max, 100);
  assert.equal(scoreReport.categories.reduce((total, category) => total + category.max, 0), 100);
  assert.ok(scoreReport.score >= 0 && scoreReport.score <= 100);
  assert.ok(
    scoreReport.score >= architectureScoreBudgets.minimumScore,
    `Architecture score ${scoreReport.score}/100 is below minimum ${architectureScoreBudgets.minimumScore}/100`
  );
});
