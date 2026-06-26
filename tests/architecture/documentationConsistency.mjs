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

  const [
    readme,
    architecture,
    integration,
    testReadme,
    authGuide,
    aiApiGuide,
    queryApiSchemaText,
    queryApiOpenApiText,
    aiToolManifestText,
    openAiToolsText,
    mcpToolsText,
    aiRunRequestText,
    aiStreamExampleText
  ] = await Promise.all([
    readFile(resolve(rootDir, 'README.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/ARCHITECTURE.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/INTEGRATION.md'), 'utf8'),
    readFile(resolve(rootDir, 'tests/README.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/AUTH.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/AI_API.md'), 'utf8'),
    readFile(resolve(rootDir, 'docs/schemas/query-api.schema.json'), 'utf8'),
    readFile(resolve(rootDir, 'docs/schemas/query-api.openapi.json'), 'utf8'),
    readFile(resolve(rootDir, 'examples/ai/query-api-tool-manifest.json'), 'utf8'),
    readFile(resolve(rootDir, 'examples/ai/openai-tools.json'), 'utf8'),
    readFile(resolve(rootDir, 'examples/ai/mcp-tools.json'), 'utf8'),
    readFile(resolve(rootDir, 'examples/ai/run-request.json'), 'utf8'),
    readFile(resolve(rootDir, 'examples/ai/stream-example.jsonl'), 'utf8')
  ]);
  const queryApiSchema = JSON.parse(queryApiSchemaText);
  const queryApiOpenApi = JSON.parse(queryApiOpenApiText);
  const aiToolManifest = JSON.parse(aiToolManifestText);
  const openAiTools = JSON.parse(openAiToolsText);
  const mcpTools = JSON.parse(mcpToolsText);
  const aiRunRequest = JSON.parse(aiRunRequestText);

  assert.deepEqual(sourceEntries, ['src'], 'architecture source entries should keep src/ as the canonical app source root');
  assert.match(readme, /## 🚀 Quick Start: Run and Connect a Backend/u);
  assert.match(readme, /Canonical layout decision: application source lives in `src\/`/u);
  assert.match(readme, /docs\/schemas\/query-api\.schema\.json/u);
  assert.match(readme, /docs\/AUTH\.md/u);
  assert.match(readme, /docs\/AI_API\.md/u);
  assert.match(readme, /docs\/schemas\/query-api\.openapi\.json/u);
  assert.match(architecture, /## Canonical Source Layout/u);
  assert.match(architecture, /The canonical application source root is `src\/`\./u);
  assert.match(integration, /## Recommended Contract/u);
  assert.match(integration, /## Fastest Setup Path/u);
  assert.match(integration, /docs\/schemas\/query-api\.schema\.json/u);
  assert.match(integration, /docs\/AUTH\.md/u);
  assert.match(integration, /docs\/AI_API\.md/u);
  assert.match(integration, /docs\/schemas\/query-api\.openapi\.json/u);
  assert.match(authGuide, /## Recommended Pattern/u);
  assert.match(authGuide, /same-origin authenticated backend-for-frontend/u);
  assert.match(authGuide, /OpenID Connect/u);
  assert.match(authGuide, /SAML/u);
  assert.match(authGuide, /CAS/u);
  assert.match(authGuide, /credentials: "same-origin"/u);
  assert.match(aiApiGuide, /## Modern AI Integration Targets/u);
  assert.match(aiApiGuide, /MCP adapter/u);
  assert.match(aiApiGuide, /Strict function tools/u);
  assert.match(testReadme, /Import application modules from the canonical `src\/` tree/u);
  assert.equal(queryApiSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.ok(queryApiSchema.$defs.fieldDefinition, 'query API schema should define field metadata');
  assert.ok(queryApiSchema.$defs.runRequest, 'query API schema should define run request payloads');
  assert.ok(queryApiSchema.$defs.queryResult, 'query API schema should define result payloads');
  assert.equal(queryApiOpenApi.openapi, '3.1.0');
  assert.ok(queryApiOpenApi.paths['/query-api'].post, 'OpenAPI contract should document POST /query-api');
  assert.ok(
    queryApiOpenApi.paths['/query-api'].post.responses['200'].content['application/x-ndjson'],
    'OpenAPI contract should document JSONL streams'
  );
  assert.equal(aiRunRequest.action, 'run');
  assert.equal(aiRunRequest.result_format, 'jsonl');
  assert.deepEqual(
    aiStreamExampleText
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).type),
    ['meta', 'row', 'done'],
    'AI JSONL stream example should keep meta -> row -> done order'
  );
  assert.deepEqual(
    aiToolManifest.tools.map((tool) => tool.name),
    ['get_fields', 'run_query', 'get_status', 'cancel_query', 'get_results', 'list_templates']
  );
  assert.deepEqual(
    openAiTools.map((tool) => tool.name),
    [
      'query_api_get_fields',
      'query_api_run',
      'query_api_get_status',
      'query_api_cancel',
      'query_api_get_results',
      'query_api_list_templates'
    ]
  );
  assert.deepEqual(
    mcpTools.tools.map((tool) => tool.name),
    openAiTools.map((tool) => tool.name),
    'MCP and strict function examples should expose the same tool set'
  );
  openAiTools.forEach((tool) => {
    assert.equal(tool.strict, true, `${tool.name} should use strict tool mode`);
    assert.equal(tool.parameters.additionalProperties, false, `${tool.name} should not accept arbitrary inputs`);
    assertObjectSchemaIsClosed(tool.parameters, tool.name);
  });
  mcpTools.tools.forEach((tool) => {
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} MCP schema should not accept arbitrary inputs`);
    assertObjectSchemaIsClosed(tool.inputSchema, tool.name);
  });
  assert.doesNotMatch(openAiToolsText, /api_url|query_api_url/u, 'model tool args should not expose API URL selection');
  assert.doesNotMatch(mcpToolsText, /api_url|query_api_url/u, 'MCP tool args should not expose API URL selection');

  const quickStartIndex = readme.indexOf('## 🚀 Quick Start: Run and Connect a Backend');
  const integrationLinkIndex = readme.indexOf('docs/INTEGRATION.md');
  const authGuideLinkIndex = readme.indexOf('docs/AUTH.md');
  const aiGuideLinkIndex = readme.indexOf('docs/AI_API.md');
  const featuresIndex = readme.indexOf('## 💻 Features');
  assert.ok(quickStartIndex !== -1 && featuresIndex !== -1 && quickStartIndex < featuresIndex);
  assert.ok(integrationLinkIndex !== -1 && integrationLinkIndex < featuresIndex);
  assert.ok(authGuideLinkIndex !== -1 && authGuideLinkIndex < featuresIndex);
  assert.ok(aiGuideLinkIndex !== -1 && aiGuideLinkIndex < featuresIndex);
});

function assertObjectSchemaIsClosed(schema, path) {
  if (!schema || typeof schema !== 'object') {
    return;
  }

  if (schema.type === 'object' || schema.properties) {
    assert.equal(schema.additionalProperties, false, `${path} should close object schemas`);
    const propertyNames = Object.keys(schema.properties || {});
    assert.deepEqual(new Set(schema.required || []), new Set(propertyNames), `${path} should make optional values explicit`);
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'description' || key === 'title') {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertObjectSchemaIsClosed(item, `${path}.${key}[${index}]`));
    } else if (value && typeof value === 'object') {
      assertObjectSchemaIsClosed(value, `${path}.${key}`);
    }
  }
}
