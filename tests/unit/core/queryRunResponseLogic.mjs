import assert from 'node:assert/strict';
import test from 'node:test';

import { assertQueryRunStreamResponse } from '../../../src/core/queryRunResponse.js';

function createResponse({
  ok = true,
  status = 200,
  statusText = 'OK',
  contentType = 'text/plain; charset=utf-8',
  body = ''
} = {}) {
  let textReadCount = 0;

  return {
    ok,
    status,
    statusText,
    headers: {
      get(name) {
        return String(name || '').toLowerCase() === 'content-type' ? contentType : '';
      }
    },
    async text() {
      textReadCount += 1;
      return body;
    },
    clone() {
      return createResponse({ ok, status, statusText, contentType, body });
    },
    get textReadCount() {
      return textReadCount;
    }
  };
}

function createBackendApi() {
  return {
    async parseJsonResponse(response) {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    },
    buildHttpError(response, payload = {}) {
      const error = new Error(payload.error || `Server error: ${response.status} ${response.statusText}`);
      error.name = 'BackendApiError';
      error.status = response.status;
      error.payload = payload;
      return error;
    }
  };
}

test('allows successful text stream responses without consuming the body', async () => {
  const response = createResponse({ body: 'row one\nrow two\n' });

  await assertQueryRunStreamResponse(response, createBackendApi());

  assert.equal(response.textReadCount, 0);
});

test('rejects JSON error payloads even when the backend returns HTTP 200', async () => {
  const response = createResponse({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      error: "Display field 'MARC ABC' not found in field map.",
      error_details: {
        schema_version: 1,
        component: 'field_definition',
        stage: 'query_build',
        code: 'invalid_display_field'
      }
    })
  });

  await assert.rejects(
    () => assertQueryRunStreamResponse(response, createBackendApi()),
    error => {
      assert.equal(error.name, 'BackendApiError');
      assert.equal(error.status, 200);
      assert.equal(error.message, "Display field 'MARC ABC' not found in field map.");
      assert.equal(error.payload.error_details.code, 'invalid_display_field');
      return true;
    }
  );
  assert.equal(response.textReadCount, 0);
});

test('allows JSON result payloads without consuming the original response body', async () => {
  const response = createResponse({
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({
      columns: ['Title'],
      rows: [{ Title: 'JSON result row' }]
    })
  });

  await assertQueryRunStreamResponse(response, createBackendApi());

  assert.equal(response.textReadCount, 0);
});

test('rejects non-OK stream responses with an HTTP error', async () => {
  const response = createResponse({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    body: 'server failed'
  });

  await assert.rejects(
    () => assertQueryRunStreamResponse(response, createBackendApi()),
    error => {
      assert.equal(error.name, 'BackendApiError');
      assert.equal(error.status, 500);
      assert.equal(error.message, 'Server error: 500 Internal Server Error');
      return true;
    }
  );
  assert.equal(response.textReadCount, 0);
});
