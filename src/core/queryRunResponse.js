import { hasResultRowsPayload } from './queryResultParser.js';
import { isJsonLinesContentType } from './queryStream.js';

async function assertQueryRunStreamResponse(response, backendApi) {
  const contentType = response.headers.get('Content-Type') || '';

  if (isJsonLinesContentType(contentType)) {
    if (!response.ok) {
      throw backendApi.buildHttpError(response, {
        error: `Server error: ${response.status} ${response.statusText}`
      });
    }
    return;
  }

  if (contentType.toLowerCase().includes('application/json')) {
    const parseTarget = typeof response.clone === 'function' ? response.clone() : response;
    const data = await backendApi.parseJsonResponse(parseTarget);
    const hasErrorPayload = Boolean(data?.error || data?.error_details || data?.errorDetails);
    const hasResultPayload = hasResultRowsPayload(data);

    if (response.ok && hasResultPayload && !hasErrorPayload) {
      throw backendApi.buildHttpError(response, {
        ...data,
        error: 'The backend returned non-streaming JSON results. Results must be streamed as JSONL.'
      });
    }

    throw backendApi.buildHttpError(response, {
      ...data,
      error: data?.error || 'Query execution failed before results started streaming.'
    });
  }

  if (!response.ok) {
    throw backendApi.buildHttpError(response, {
      error: `Server error: ${response.status} ${response.statusText}`
    });
  }

  throw backendApi.buildHttpError(response, {
    error: 'The backend must return streaming JSONL results with Content-Type application/x-ndjson.'
  });
}

export { assertQueryRunStreamResponse };
