import assert from 'node:assert/strict';
import { createStreamedQueryResultReader } from '../../../src/core/queryStream.js';
import test from 'node:test';

test('query stream', async () => {
  const encoder = new TextEncoder();

  function createChunkedResponse(chunks, headers = {}) {
    let index = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      }
    }), { headers });
  }

  function createErroredResponse(chunks, error = new TypeError('network error'), headers = {}) {
    let index = 0;
    return new Response(new ReadableStream({
      pull(controller) {
        if (index >= chunks.length) {
          controller.error(error);
          return;
        }
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      }
    }), { headers });
  }

  {
    const progress = [];
    const readStreamedQueryResult = createStreamedQueryResultReader();
    const result = await readStreamedQueryResult(createChunkedResponse([
      '{"type":"meta","version":1,"format":"jsonl","query_id":"jsonl-smoke","columns":["Title","Public Note"]}\n',
      '{"type":"row","values":["Alpha",["One","Two"]]}\n',
      '{"type":"progress","rows":1,"message":"One row"}\n',
      '{"type":"row","values":["Beta","Only"]}\n',
      '{"type":"done","rows":2}\n'
    ], { 'Content-Type': 'application/x-ndjson; charset=utf-8' }), {
      onProgress: rowCount => progress.push(rowCount)
    });

    assert.equal(result.source, 'jsonl');
    assert.deepEqual(result.jsonPayload, {
      query_id: 'jsonl-smoke',
      columns: ['Title', 'Public Note'],
      rows: [
        ['Alpha', ['One', 'Two']],
        ['Beta', 'Only']
      ]
    });
    assert.equal(result.partial, false);
    assert.equal(result.streamError, null);
    assert.deepEqual(progress, [1, 2]);
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    await assert.rejects(
      () => readStreamedQueryResult(createChunkedResponse(['A|B\n'], { 'Content-Type': 'text/plain; charset=utf-8' })),
      error => {
        assert.equal(error.isQueryStreamError, true);
        assert.match(error.message, /must return streaming JSONL/u);
        return true;
      }
    );
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    await assert.rejects(
      () => readStreamedQueryResult(createChunkedResponse([
        '{"type":"meta","version":1,"format":"jsonl","columns":["Title"]}\n',
        '{"type":"error","error":"MARC enrichment failed","stage":"marc"}\n'
      ], { 'Content-Type': 'application/x-ndjson; charset=utf-8' })),
      error => {
        assert.equal(error.isQueryStreamError, true);
        assert.equal(error.message, 'MARC enrichment failed');
        assert.equal(error.payload.stage, 'marc');
        return true;
      }
    );
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    const result = await readStreamedQueryResult(createErroredResponse([
      '{"type":"meta","version":1,"format":"jsonl","columns":["Title"]}\n',
      '{"type":"row","values":["Partial"]}\n'
    ], new TypeError('network error'), { 'Content-Type': 'application/x-ndjson; charset=utf-8' }));

    assert.deepEqual(result.jsonPayload.rows, [['Partial']]);
    assert.equal(result.partial, true);
    assert.equal(result.streamError?.isQueryStreamError, true);
    assert.match(result.streamError.message, /ended early after 1 result/u);
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    await assert.rejects(
      () => readStreamedQueryResult(createChunkedResponse([
        '{"type":"meta","version":2,"format":"jsonl","columns":["Title"]}\n',
        '{"type":"row","values":["Unsupported"]}\n'
      ], { 'Content-Type': 'application/x-ndjson; charset=utf-8' })),
      error => {
        assert.equal(error.isQueryStreamError, true);
        assert.match(error.message, /Unsupported JSONL protocol version/u);
        assert.equal(error.payload.expectedVersion, 1);
        return true;
      }
    );
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    await assert.rejects(
      () => readStreamedQueryResult(createChunkedResponse([
        '{"type":"row","values":["No meta"]}\n'
      ], { 'Content-Type': 'application/x-ndjson; charset=utf-8' })),
      error => {
        assert.equal(error.isQueryStreamError, true);
        assert.match(error.message, /meta event before/u);
        return true;
      }
    );
  }

  {
    const readStreamedQueryResult = createStreamedQueryResultReader();
    await assert.rejects(
      () => readStreamedQueryResult(createChunkedResponse([
        '{"type":"meta","version":1,"format":"jsonl","columns":["Title"]}\n',
        '{"type":"row","row":["Missing canonical values"]}\n'
      ], { 'Content-Type': 'application/x-ndjson; charset=utf-8' })),
      error => {
        assert.equal(error.isQueryStreamError, true);
        assert.match(error.message, /values array/u);
        return true;
      }
    );
  }
});
