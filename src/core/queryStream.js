const JSONL_PROTOCOL_VERSION = 1;

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

function isJsonLinesContentType(contentType = '') {
  const normalized = String(contentType || '').toLowerCase();
  return normalized.includes('application/x-ndjson')
    || normalized.includes('application/jsonl')
    || normalized.includes('application/json-lines')
    || normalized.includes('text/jsonl')
    || normalized.includes('text/x-jsonl');
}

function getResponseContentType(response) {
  return response?.headers?.get?.('Content-Type')
    || response?.headers?.get?.('content-type')
    || '';
}

function createJsonLineProtocolError(message, payload = {}) {
  const error = new Error(message || 'The backend sent an invalid JSONL result stream.');
  error.name = 'QueryJsonLineStreamError';
  error.isQueryStreamError = true;
  error.isNetworkError = false;
  error.payload = payload;
  return error;
}

function normalizeJsonLineEventType(event) {
  return String(event?.type || event?.event || '').trim().toLowerCase();
}

function getJsonLineRowPayload(event) {
  if (Array.isArray(event)) return event;
  if (!event || typeof event !== 'object') return event;
  if (Object.prototype.hasOwnProperty.call(event, 'values')) return event.values;
  if (Object.prototype.hasOwnProperty.call(event, 'row')) return event.row;
  if (Object.prototype.hasOwnProperty.call(event, 'data')) return event.data;
  if (Object.prototype.hasOwnProperty.call(event, 'record')) return event.record;
  return event;
}

function isSupportedJsonLineVersion(event) {
  return Number(event?.version) === JSONL_PROTOCOL_VERSION;
}

function getJsonLineColumns(event) {
  return event?.columns || event?.headers || event?.fields || event?.rawColumns || event?.columnOrder;
}

function validateJsonLineEvent(event, type, state) {
  if (!event || typeof event !== 'object') {
    return createJsonLineProtocolError('JSONL stream events must be JSON objects.', { event });
  }

  if (state.doneEvent) {
    return createJsonLineProtocolError('The backend sent JSONL events after the done event.', { event });
  }

  if (type !== 'meta' && type !== 'metadata' && type !== 'header' && type !== 'columns' && !state.metaEvent) {
    return createJsonLineProtocolError('The backend must send a JSONL meta event before row, progress, warning, error, or done events.', { event });
  }

  if (type === 'meta' || type === 'metadata' || type === 'header' || type === 'columns') {
    if (state.metaEvent) {
      return createJsonLineProtocolError('The backend sent more than one JSONL meta event.', { event });
    }
    if (!isSupportedJsonLineVersion(event)) {
      return createJsonLineProtocolError(
        `Unsupported JSONL protocol version. Expected version ${JSONL_PROTOCOL_VERSION}.`,
        { event, expectedVersion: JSONL_PROTOCOL_VERSION }
      );
    }
    if (String(event.format || '').toLowerCase() !== 'jsonl') {
      return createJsonLineProtocolError('The JSONL meta event must include format "jsonl".', { event });
    }
    if (!Array.isArray(getJsonLineColumns(event))) {
      return createJsonLineProtocolError('The JSONL meta event must include an ordered columns array.', { event });
    }
    return null;
  }

  if (type === 'row' || type === 'result' || type === '') {
    if (!Array.isArray(event.values)) {
      return createJsonLineProtocolError('JSONL row events must include a values array.', { event });
    }
    return null;
  }

  if (type === 'done' || type === 'complete') {
    const rows = getJsonLineRowCount(event, undefined);
    if (!Number.isFinite(rows)) {
      return createJsonLineProtocolError('JSONL done events must include a numeric rows count.', { event });
    }
    return null;
  }

  if (type === 'error' || type === 'failed') {
    if (!event.error && !event.message) {
      return createJsonLineProtocolError('JSONL error events must include error or message text.', { event });
    }
    return null;
  }

  if (type === 'progress' || type === 'warning') {
    return null;
  }

  return createJsonLineProtocolError(`Unsupported JSONL event type: ${type}`, { event });
}

function getJsonLineRowCount(event, fallback) {
  const candidates = [
    event?.rows,
    event?.row_count,
    event?.rowCount,
    event?.count,
    event?.current,
    event?.progress?.rows,
    event?.progress?.row_count,
    event?.progress?.current
  ];
  const value = candidates.find(candidate => Number.isFinite(Number(candidate)));
  return value === undefined ? fallback : Math.max(0, Number(value) || 0);
}

function processJsonLineEvent(line, state, readOptions = {}) {
  let event;
  try {
    event = JSON.parse(line);
  } catch (error) {
    state.streamError ||= createJsonLineProtocolError(
      `The backend sent invalid JSONL: ${error.message}`,
      { line }
    );
    return;
  }

  const type = normalizeJsonLineEventType(event);
  state.events.push(event);

  const validationError = validateJsonLineEvent(event, type, state);
  if (validationError) {
    state.streamError ||= validationError;
    return;
  }

  if (type === 'meta' || type === 'metadata' || type === 'header' || type === 'columns') {
    state.queryId ||= event.query_id || event.queryId || '';
    state.metaEvent = event;
    const columns = getJsonLineColumns(event);
    if (Array.isArray(columns) && columns.length) {
      state.columns = columns;
    }
    return;
  }

  if (type === 'progress') {
    state.progress = event;
    const rowCount = getJsonLineRowCount(event, state.rows.length);
    if (typeof readOptions.onProgress === 'function' && rowCount !== state.lastProgressRows) {
      state.lastProgressRows = rowCount;
      readOptions.onProgress(rowCount, { progress: event });
    }
    return;
  }

  if (type === 'warning') {
    state.warnings.push(event);
    return;
  }

  if (type === 'done' || type === 'complete') {
    state.doneEvent = event;
    state.progress = event;
    const rowCount = getJsonLineRowCount(event, state.rows.length);
    if (typeof readOptions.onProgress === 'function' && rowCount !== state.lastProgressRows) {
      state.lastProgressRows = rowCount;
      readOptions.onProgress(rowCount, { progress: event });
    }
    return;
  }

  if (type === 'error' || type === 'failed') {
    state.streamError ||= createJsonLineProtocolError(
      event?.message || event?.error || 'The backend reported a JSONL stream error.',
      event
    );
    return;
  }

  if (type === 'row' || type === 'result' || type === '' || Array.isArray(event)) {
    state.rows.push(getJsonLineRowPayload(event));
    if (typeof readOptions.onProgress === 'function') {
      state.lastProgressRows = state.rows.length;
      readOptions.onProgress(state.rows.length, { row: event });
    }
    return;
  }

  state.warnings.push({
    type: 'warning',
    message: `Ignoring unsupported JSONL event type: ${type}`,
    event
  });
}

function createStreamedLineReader(options = {}) {
  const isQueryRunning = typeof options.isQueryRunning === 'function'
    ? options.isQueryRunning
    : () => true;

  return async function readStreamedLines(response, readOptions = {}) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      try {
        const fallbackText = await response.text();
        const fallbackLines = fallbackText.split('\n').filter(line => line.trim().length > 0);
        if (typeof readOptions.onProgress === 'function') {
          readOptions.onProgress(fallbackLines.length);
        }
        if (typeof readOptions.onLine === 'function') {
          fallbackLines.forEach((line, index) => {
            readOptions.onLine(line, index + 1);
          });
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
        if (typeof readOptions.onLine === 'function') {
          readOptions.onLine(line, lines.length);
        }
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
      if (typeof readOptions.onLine === 'function') {
        readOptions.onLine(bufferedText, lines.length);
      }
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

function createStreamedQueryResultReader(options = {}) {
  const readStreamedLines = createStreamedLineReader(options);

  return async function readStreamedQueryResult(response, readOptions = {}) {
    if (!isJsonLinesContentType(getResponseContentType(response))) {
      throw createJsonLineProtocolError(
        'The backend must return streaming JSONL results with Content-Type application/x-ndjson.',
        { contentType: getResponseContentType(response) }
      );
    }

    const state = {
      columns: [],
      doneEvent: null,
      events: [],
      metaEvent: null,
      progress: null,
      queryId: '',
      lastProgressRows: undefined,
      rows: [],
      streamError: null,
      warnings: []
    };

    const streamed = await readStreamedLines(response, {
      ...readOptions,
      onProgress: null,
      onLine: line => processJsonLineEvent(line, state, readOptions)
    });

    const streamError = streamed.streamError
      ? createQueryStreamError(streamed.streamError.cause || streamed.streamError, { rowCount: state.rows.length })
      : state.streamError;
    if (state.streamError && state.rows.length === 0) {
      throw state.streamError;
    }

    return {
      ...streamed,
      jsonPayload: {
        query_id: state.queryId,
        columns: state.columns,
        rows: state.rows
      },
      jsonlEvents: state.events,
      partial: Boolean(streamed.partial || state.streamError),
      progress: state.progress,
      source: 'jsonl',
      streamError,
      warnings: state.warnings
    };
  };
}

const readStreamedQueryResult = createStreamedQueryResultReader();

export {
  createQueryStreamError,
  createStreamedQueryResultReader,
  isJsonLinesContentType,
  readStreamedQueryResult
};
