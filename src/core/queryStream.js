function createQueryStreamError(error, options = {}) {
  const rowCount = Math.max(0, Number(options.rowCount) || 0);
  const message = rowCount > 0
    ? `The query connection ended early after ${rowCount} result${rowCount === 1 ? '' : 's'}.`
    : 'The query connection ended before any results were received. Please try again.';
  const streamError = new Error(message);
  streamError.name = 'QueryStreamError';
  streamError.cause = error;
  streamError.isQueryStreamError = true;
  streamError.isNetworkError = true;
  streamError.originalMessage = error?.message || String(error || '');
  return streamError;
}

function createStreamedQueryTextReader(options = {}) {
  const isQueryRunning = typeof options.isQueryRunning === 'function'
    ? options.isQueryRunning
    : () => true;

  return async function readStreamedQueryText(response, readOptions = {}) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      try {
        const fallbackText = await response.text();
        const fallbackLines = fallbackText.split('\n').filter(line => line.trim().length > 0);
        if (typeof readOptions.onProgress === 'function') {
          readOptions.onProgress(fallbackLines.length);
        }
        return { text: fallbackText, lines: fallbackLines, partial: false, streamError: null };
      } catch (error) {
        throw createQueryStreamError(error, { rowCount: 0 });
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const lines = [];
    let bufferedText = '';
    let fullText = '';
    let partial = false;
    let readError = null;

    while (true) {
      if (!isQueryRunning()) {
        partial = true;
        break;
      }

      let result;
      try {
        result = await reader.read();
      } catch (error) {
        partial = true;
        readError = error;
        break;
      }

      const { value, done } = result;
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      bufferedText += chunk;

      const chunkParts = bufferedText.split(/\r?\n/);
      bufferedText = chunkParts.pop() || '';
      let didCountAdvance = false;

      chunkParts.forEach(line => {
        if (line.trim().length === 0) return;
        lines.push(line);
        didCountAdvance = true;
      });

      if (didCountAdvance && typeof readOptions.onProgress === 'function') {
        readOptions.onProgress(lines.length);
      }
    }

    const tail = readError ? '' : decoder.decode();
    if (tail) {
      fullText += tail;
      bufferedText += tail;
    }

    if (bufferedText.trim().length > 0) {
      lines.push(bufferedText);
      if (typeof readOptions.onProgress === 'function') {
        readOptions.onProgress(lines.length);
      }
    }

    if (readError) {
      const streamError = createQueryStreamError(readError, { rowCount: lines.length });
      if (lines.length === 0) {
        throw streamError;
      }
      return { text: fullText, lines, partial: true, streamError };
    }

    return { text: fullText, lines, partial, streamError: null };
  };
}

const readStreamedQueryText = createStreamedQueryTextReader();

export {
  createQueryStreamError,
  createStreamedQueryTextReader,
  readStreamedQueryText
};
