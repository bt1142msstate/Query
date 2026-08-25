import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getClientErrorInfo,
  getClientErrorMessage,
  isPlainSafeMessage
} from '../../../src/core/clientErrorMessages.js';
import {
  registerToastImplementation,
  showToastMessage
} from '../../../src/core/toast.js';

function errorWith(message, properties = {}) {
  return Object.assign(new Error(message), properties);
}

const scenarios = [
  ['rate limit with delay', errorWith('Too many requests', { status: 429, retryAfterSeconds: 75 }), 'Too many requests were made. Try again in 2 minutes.'],
  ['expired session', errorWith('Not authenticated', { status: 401 }), 'Your session has expired. Sign in and try again.'],
  ['permission denied', errorWith('Insufficient scope', { status: 403 }), 'You do not have permission to do that. Ask an administrator if you need access.'],
  ['locked account', errorWith('Account locked; retry later'), 'Sign-in is temporarily locked. Wait a moment and try again.'],
  ['bad credentials', errorWith('Invalid username or password'), 'The username or password is incorrect. Check it and try again.'],
  ['bad current password', errorWith('The current password is incorrect'), 'The current password is incorrect. Check it and try again.'],
  ['missing query', errorWith('Query not found', { status: 404 }), 'That item could not be found. It may have been removed or may no longer be available.'],
  ['dashboard view preparing', errorWith('That dashboard view is still being prepared. Try again after the next dashboard refresh.', { status: 404 }), 'That dashboard view is still being prepared. Try again after the next dashboard refresh.'],
  ['missing API route', errorWith('HTTP 404 Not Found', { status: 404 }), 'The Query service could not be found at this address. Check the API address and try again.'],
  ['removed item', errorWith('Gone', { status: 410 }), 'That item could not be found. It may have been removed or may no longer be available.'],
  ['stale update', errorWith('Stale version conflict', { status: 409 }), 'This information changed before your update was saved. Refresh and try again.'],
  ['failed precondition', errorWith('Precondition failed', { status: 412 }), 'This information changed before your update was saved. Refresh and try again.'],
  ['no columns', errorWith('display_fields is required'), 'Choose at least one field to display, then run the query again.'],
  ['unknown field', errorWith('Unknown display field: Old Field'), 'One of the selected fields is no longer available. Remove it or reload the field list, then try again.'],
  ['bad operator', errorWith('Unsupported operator for Item Type'), 'One of the filters uses an option that is not supported for that field. Edit the filter and try again.'],
  ['incomplete filter', errorWith('Filter value is required'), 'One of the filters is incomplete or invalid. Check the highlighted filter and try again.'],
  ['large request', errorWith('HTTP 413 payload too large'), 'This request is too large. Remove some records or fields and try again.'],
  ['large request headers', errorWith('Request Header Fields Too Large', { status: 431 }), 'This request is too large. Remove some records or fields and try again.'],
  ['large result', errorWith('Maximum rows capacity exceeded'), 'This query is too large to finish safely. Add a filter or request fewer fields, then try again.'],
  ['server storage limit', errorWith('Insufficient storage', { status: 507 }), 'This query is too large to finish safely. Add a filter or request fewer fields, then try again.'],
  ['timeout', errorWith('Backend request timed out after 1 minute', { isTimeout: true }), 'The request took too long to finish. Try again, or narrow the query if it is large.'],
  ['canceled', errorWith('The operation was aborted.', { name: 'AbortError' }), 'The action was canceled.'],
  ['proxy cancellation', errorWith('Client closed request', { status: 499 }), 'The action was canceled.'],
  ['network', errorWith('TypeError: Failed to fetch'), 'The server could not be reached. Check your connection and try again.'],
  ['bad stream', errorWith('The backend sent invalid JSONL: Unexpected token'), 'The server returned results in a format this version cannot read. Refresh the page and try again.'],
  ['unacceptable response format', errorWith('Not acceptable', { status: 406 }), 'The server returned results in a format this version cannot read. Refresh the page and try again.'],
  ['field definitions', errorWith('Failed to load field definitions'), 'The field list is temporarily unavailable. Wait a moment, then reload it.'],
  ['policy metadata', errorWith('Backend failure', { payload: { error_details: { code: 'policy_data_failed' } } }), 'The field list is temporarily unavailable. Wait a moment, then reload it.'],
  ['blocked origin', errorWith('Request origin is not allowed'), 'This page is not allowed to connect to that server. Open the approved Query site or reset the API address.'],
  ['wrong request method', errorWith('Method not allowed', { status: 405 }), 'The server does not accept this request. Refresh the page and try again.'],
  ['wrong request format', errorWith('Content-Type must be application/json', { status: 415 }), 'The app and server could not understand each other. Refresh the page and try again.'],
  ['query worker startup', errorWith('Failed to start query worker'), 'The server could not start or finish the request. Try again; if it continues, contact support.'],
  ['backend error code', errorWith('Backend module error', { payload: { error_details: { code: 'backend_module_error' } } }), 'The server could not start or finish the request. Try again; if it continues, contact support.'],
  ['line size code', errorWith('Query failed', { payload: { error_details: { code: 'query_line_too_large' } } }), 'This query is too large to finish safely. Add a filter or request fewer fields, then try again.'],
  ['WorldCat outage', errorWith('OCLC Metadata API service unavailable'), 'WorldCat is not available right now. Try again later.'],
  ['generic service outage', errorWith('Service unavailable', { status: 503 }), 'The server ran into a problem. Try again; if it continues, contact support.'],
  ['Sirsi command', errorWith('catalogdump command failed with exit code 1'), 'The library system could not finish this request. Try again; if it continues, contact support.'],
  ['server error property', errorWith('Internal failure', { status: 500 }), 'The server ran into a problem. Try again; if it continues, contact support.'],
  ['server error embedded in CLI text', errorWith('API request failed with HTTP 502: upstream died'), 'The server ran into a problem. Try again; if it continues, contact support.'],
  ['invalid request', errorWith('Unclassified validation problem', { status: 422 }), 'The request is incomplete or invalid. Check your selections and try again.'],
  ['specific safe request validation', errorWith('Template names must be unique', { status: 400 }), 'Template names must be unique.'],
  ['plain explanation', errorWith('The selected Excel workbook is empty'), 'The selected Excel workbook is empty.'],
  ['technical leakage fallback', errorWith('Traceback at /software/usr/query.pl line 824 {"secret":"x"}'), 'The action could not be completed. Try again.'],
  ['missing error fallback', null, 'The action could not be completed. Try again.']
];

test('client error messages cover common browser, backend, CLI, and provider failures', () => {
  scenarios.forEach(([label, error, expected]) => {
    assert.equal(
      getClientErrorMessage(error, { fallback: 'The action could not be completed. Try again.' }),
      expected,
      label
    );
  });
});

test('client error info reports stable categories and retry guidance', () => {
  assert.deepEqual(getClientErrorInfo(errorWith('Unknown field')), {
    category: 'unknown_field',
    message: 'One of the selected fields is no longer available. Remove it or reload the field list, then try again.',
    retryable: true
  });
  assert.equal(getClientErrorInfo(errorWith('Permission denied')).retryable, false);
  assert.equal(getClientErrorInfo(errorWith('Failed to fetch')).category, 'network');
});

test('plain-message safety rejects implementation details and unsafe markup', () => {
  assert.equal(isPlainSafeMessage('The selected file is empty.'), true);
  assert.equal(isPlainSafeMessage('<script>alert(1)</script>'), false);
  assert.equal(isPlainSafeMessage('Traceback at /software/query.pl line 42'), false);
  assert.equal(isPlainSafeMessage('{"error":"raw backend object"}'), false);
  assert.equal(isPlainSafeMessage('admission_lock_failed'), false);
});

test('error toasts normalize technical messages while preserving non-error notices', () => {
  const observed = [];
  registerToastImplementation({
    showToastMessage(message, type) {
      observed.push({ message, type });
    }
  });

  showToastMessage('catalogdump command failed with exit code 9', 'error');
  showToastMessage('Query completed.', 'success');

  assert.deepEqual(observed, [
    {
      message: 'The library system could not finish this request. Try again; if it continues, contact support.',
      type: 'error'
    },
    { message: 'Query completed.', type: 'success' }
  ]);
});
