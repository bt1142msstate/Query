import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('documentation consistency', async () => {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const require = createRequire(import.meta.url);
  const { sourceEntries } = require('../../config/architectureRules.cjs');

  const [readme, architecture, integration, testReadme, queryApiSchemaText] = await Promise.all([
    readFile(resolve(rootDir, 'README.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/ARCHITECTURE.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/INTEGRATION.md'), 'utf8'),
    readFile(resolve(rootDir, 'tests/README.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/schemas/query-api.schema.json'), 'utf8')
  ]);
  const queryApiSchema = JSON.parse(queryApiSchemaText);

  assert.deepEqual(sourceEntries, ['src'], 'architecture source entries should keep src/ as the canonical app source root');
  assert.match(readme, /## 🚀 Quick Start: Run and Connect a Backend/u);
  assert.match(readme, /Canonical layout decision: application source lives in `src\/`/u);
  assert.match(readme, /docs\/schemas\/query-api\.schema\.json/u);
  assert.match(architecture, /## Canonical Source Layout/u);
  assert.match(architecture, /The canonical application source root is `src\/`\./u);
  assert.match(integration, /## Recommended Contract/u);
  assert.match(integration, /## Fastest Setup Path/u);
  assert.match(integration, /docs\/schemas\/query-api\.schema\.json/u);
  assert.match(testReadme, /Import application modules from the canonical `src\/` tree/u);
  assert.equal(queryApiSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(queryApiSchema.$defs.fieldDefinition, 'query API schema should define field metadata');
  assert.ok(queryApiSchema.$defs.runRequest, 'query API schema should define run request payloads');
  assert.ok(queryApiSchema.$defs.queryResult, 'query API schema should define result payloads');

  const quickStartIndex = readme.indexOf('## 🚀 Quick Start: Run and Connect a Backend');
  const integrationLinkIndex = readme.indexOf('docs/INTEGRATION.md');
  const featuresIndex = readme.indexOf('## 💻 Features');
  assert.ok(quickStartIndex !== -1 && featuresIndex !== -1 && quickStartIndex < featuresIndex);
  assert.ok(integrationLinkIndex !== -1 && integrationLinkIndex < featuresIndex);
});
