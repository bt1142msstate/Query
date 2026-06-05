import { hasResultRowsPayload } from './queryResultParser.js';

async function assertQueryRunStreamResponse(response, backendApi) {
  const contentType = response.headers.get('Content-Type') || '';

  if (contentType.toLowerCase().includes('application/json')) {
    const parseTarget = typeof response.clone === 'function' ? response.clone() : response;
    const data = await backendApi.parseJsonResponse(parseTarget);
    const hasErrorPayload = Boolean(data?.error || data?.error_details || data?.errorDetails);
    const hasResultPayload = hasResultRowsPayload(data);

    if (response.ok && hasResultPayload && !hasErrorPayload) {
      return;
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
}

export { assertQueryRunStreamResponse };
