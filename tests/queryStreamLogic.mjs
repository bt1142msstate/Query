import assert from 'node:assert/strict';
import { createStreamedQueryTextReader } from '../core/queryStream.js';

const encoder = new TextEncoder();

function createChunkedResponse(chunks) {
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
  }));
}

function createErroredResponse(chunks, error = new TypeError('network error')) {
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
  }));
}

{
  const progress = [];
  const readStreamedQueryText = createStreamedQueryTextReader();
  const result = await readStreamedQueryText(createChunkedResponse(['A|B\n', 'C|D\n']), {
    onProgress: rowCount => progress.push(rowCount)
  });

  assert.deepEqual(result.lines, ['A|B', 'C|D']);
  assert.equal(result.partial, false);
  assert.equal(result.streamError, null);
  assert.deepEqual(progress, [1, 2]);
}

{
  const progress = [];
  const readStreamedQueryText = createStreamedQueryTextReader();
  const result = await readStreamedQueryText(createErroredResponse(['A|B\n', 'C|D']), {
    onProgress: rowCount => progress.push(rowCount)
  });

  assert.deepEqual(result.lines, ['A|B', 'C|D']);
  assert.equal(result.partial, true);
  assert.equal(result.streamError?.isQueryStreamError, true);
  assert.match(result.streamError.message, /ended early after 2 results/u);
  assert.deepEqual(progress, [1, 2]);
}

{
  const readStreamedQueryText = createStreamedQueryTextReader();
  await assert.rejects(
    () => readStreamedQueryText(createErroredResponse([])),
    error => {
      assert.equal(error.isQueryStreamError, true);
      assert.match(error.message, /before any results were received/u);
      return true;
    }
  );
}

{
  let running = true;
  const readStreamedQueryText = createStreamedQueryTextReader({
    isQueryRunning: () => running
  });
  const result = await readStreamedQueryText(createChunkedResponse(['A|B\n', 'C|D\n']), {
    onProgress: () => {
      running = false;
    }
  });

  assert.deepEqual(result.lines, ['A|B']);
  assert.equal(result.partial, true);
  assert.equal(result.streamError, null);
}

console.log('Query stream logic tests passed');
