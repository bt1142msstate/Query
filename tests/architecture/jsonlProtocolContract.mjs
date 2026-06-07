import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function formatValidationErrors(errors = []) {
  return errors
    .map(error => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
}

function extractJsonlExampleStreams(markdown) {
  const streams = [];
  const pattern = /```jsonl\s*([\s\S]*?)```/gu;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const events = match[1]
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line));
    streams.push(events);
  }
  return streams;
}

function assertCanonicalStreamOrder(events, label) {
  assert.ok(events.length >= 2, `${label} should include at least meta and done events`);
  assert.equal(events[0].type, 'meta', `${label} should start with a meta event`);
  assert.equal(events[0].version, 1, `${label} meta event should declare JSONL protocol version 1`);
  assert.equal(events[0].format, 'jsonl', `${label} meta event should declare format jsonl`);
  assert.equal(events.at(-1).type, 'done', `${label} should finish with a done event`);

  let doneIndex = -1;
  events.forEach((event, index) => {
    if (index > 0) {
      assert.notEqual(event.type, 'meta', `${label} should not include a second meta event`);
    }
    if (doneIndex !== -1) {
      throw new Error(`${label} should not include events after done`);
    }
    if (event.type === 'done') {
      doneIndex = index;
    }
  });
}

test('streaming JSONL event schema validates documented examples', async () => {
  const [schemaText, integrationText] = await Promise.all([
    readFile(resolve(rootDir, 'docs/schemas/query-api.schema.json'), 'utf8'),
    readFile(resolve(rootDir, 'docs/INTEGRATION.md'), 'utf8')
  ]);
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(schema);

  const validateJsonlEvent = ajv.compile({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $ref: `${schema.$id}#/$defs/jsonlEvent`
  });

  assert.ok(schema.$defs.jsonlEvent, 'query API schema should define streaming JSONL events');
  assert.equal(schema.$defs.jsonlProtocolVersion.const, 1, 'JSONL protocol version should remain explicit');

  const exampleStreams = extractJsonlExampleStreams(integrationText);
  assert.ok(exampleStreams.length >= 2, 'integration guide should include JSONL example streams');

  exampleStreams.forEach((events, streamIndex) => {
    const label = `INTEGRATION.md jsonl example ${streamIndex + 1}`;
    assertCanonicalStreamOrder(events, label);
    events.forEach((event, eventIndex) => {
      const isValid = validateJsonlEvent(event);
      assert.equal(
        isValid,
        true,
        `${label} event ${eventIndex + 1} should match docs/schemas/query-api.schema.json: ${formatValidationErrors(validateJsonlEvent.errors || [])}`
      );
    });
  });

  const invalidEvents = [
    {
      label: 'unsupported meta version',
      event: { type: 'meta', version: 2, format: 'jsonl', columns: ['Title'] }
    },
    {
      label: 'meta without format',
      event: { type: 'meta', version: 1, columns: ['Title'] }
    },
    {
      label: 'row without values',
      event: { type: 'row', row: ['Title'] }
    },
    {
      label: 'done without row count',
      event: { type: 'done' }
    },
    {
      label: 'error without message',
      event: { type: 'error' }
    }
  ];

  invalidEvents.forEach(({ label, event }) => {
    assert.equal(validateJsonlEvent(event), false, `${label} should fail the JSONL event schema`);
  });
});

test('streaming JSONL examples enforce meta-first and done-last ordering', () => {
  assert.throws(
    () => assertCanonicalStreamOrder([
      { type: 'row', values: ['Title'] },
      { type: 'done', rows: 1 }
    ], 'row-first stream'),
    /start with a meta event/u
  );

  assert.throws(
    () => assertCanonicalStreamOrder([
      { type: 'meta', version: 1, format: 'jsonl', columns: ['Title'] },
      { type: 'done', rows: 0 },
      { type: 'row', values: ['Late row'] }
    ], 'late-row stream'),
    /finish with a done event|events after done/u
  );
});
