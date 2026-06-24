import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { collectArchitectureScore } from './lib/architectureScore.mjs';

const require = createRequire(import.meta.url);
const { architectureScoreBudgets } = require('../config/architectureRules.cjs');
const rootDir = resolve(import.meta.dirname, '..');
const scoreReport = await collectArchitectureScore({ rootDir });

function formatMetricValue(metric) {
  if (metric.unit === 'ratio') {
    return `${metric.actual.toFixed(2)} / ${metric.budget.toFixed(2)}`;
  }
  if (Number.isInteger(metric.actual) && Number.isInteger(metric.budget)) {
    return `${metric.actual} / ${metric.budget}`;
  }
  return `${metric.actual.toFixed(2)} / ${metric.budget.toFixed(2)}`;
}

console.log(`Architecture Score: ${scoreReport.score}/100`);
console.log(`Minimum gate: ${architectureScoreBudgets.minimumScore}/100`);
console.log(`Target: ${architectureScoreBudgets.targetScore}/100`);
console.table(scoreReport.categories.map(category => ({
  area: category.name,
  points: `${category.earned}/${category.max}`
})));

if (scoreReport.primaryFindings.length > 0) {
  console.log('\nLargest point losses');
  console.table(scoreReport.primaryFindings.map(metric => ({
    area: metric.category,
    metric: metric.label,
    value: formatMetricValue(metric),
    pointsLost: metric.lost
  })));
} else {
  console.log('\nNo architecture score point losses.');
}
