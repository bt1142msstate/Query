const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Try again.';

function normalizeText(value, maxLength = 800) {
  if (value === null || value === undefined || typeof value === 'object') return '';
  const text = String(value).replace(/[\u0000-\u001F\u007F]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function getErrorPayload(error) {
  return error?.payload && typeof error.payload === 'object' ? error.payload : {};
}

function getErrorDetails(error) {
  const payload = getErrorPayload(error);
  const details = payload.error_details || payload.errorDetails || error?.error_details || error?.errorDetails;
  return details && typeof details === 'object' ? details : {};
}

function getRawErrorText(error) {
  const payload = getErrorPayload(error);
  const details = getErrorDetails(error);
  return [
    payload.error,
    payload.message,
    details.message,
    details.hint,
    details.code,
    error?.message,
    typeof error === 'string' ? error : ''
  ].map(value => normalizeText(value)).filter(Boolean).join(' ');
}

function getErrorStatus(error) {
  const status = Number(error?.status || error?.statusCode || getErrorPayload(error).status);
  if (Number.isFinite(status) && status > 0) return status;
  const match = getRawErrorText(error).match(/(?:HTTP|Server error:)\s*(\d{3})/iu);
  return match ? Number(match[1]) : 0;
}

function getRetryDelay(error) {
  const payload = getErrorPayload(error);
  const seconds = Number(error?.retryAfterSeconds || payload.retry_after_seconds || payload.retry_after);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.ceil(seconds)} second${Math.ceil(seconds) === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function isPlainSafeMessage(message) {
  const text = normalizeText(message, 260);
  if (!text || text.length > 240) return false;
  if (/[{}<>]|https?:\/\/|(?:[A-Za-z]:)?[\\/](?:software|usr|var|home|Users|tmp)\b/iu.test(text)) return false;
  if (/\b(?:stack trace|traceback|exception|SQLSTATE|DBI|Perl|CGI|JSONL|HTTP\s*\d|exit code|segmentation fault|undefined|null reference|at \w+\s*\(|line \d+|[a-z]+(?:_[a-z]+)+)\b/iu.test(text)) return false;
  return true;
}

function getCredentialErrorInfo(rawText, delay) {
  if (!/password|username|sign[ -]?in|login|account locked|recovery code/iu.test(rawText)) return null;
  if (/locked|too many|retry/iu.test(rawText)) {
    return { category: 'account_locked', message: delay ? `Sign-in is temporarily locked. Try again in ${delay}.` : 'Sign-in is temporarily locked. Wait a moment and try again.', retryable: true };
  }
  if (/current password.*incorrect/iu.test(rawText)) {
    return { category: 'credentials', message: 'The current password is incorrect. Check it and try again.', retryable: true };
  }
  if (/invalid|incorrect|failed|does not match|not match/iu.test(rawText)) {
    return { category: 'credentials', message: 'The username or password is incorrect. Check it and try again.', retryable: true };
  }
  return null;
}

function getAccessErrorInfo({ error, rawText, status, delay }) {
  if (error?.isRateLimited || status === 429 || /too many requests|rate limit/iu.test(rawText)) {
    return {
      category: 'rate_limit',
      message: delay ? `Too many requests were made. Try again in ${delay}.` : 'Too many requests were made. Wait a moment and try again.',
      retryable: true
    };
  }
  if (status === 401 || /session (?:has )?expired|not authenticated|authentication required|sign[ -]?in required|invalid session|unauthorized/iu.test(rawText)) {
    return { category: 'authentication', message: 'Your session has expired. Sign in and try again.', retryable: true };
  }
  if (status === 403 || /access denied|not authorized|permission denied|forbidden|insufficient scope|requires? administrator access|administrator access is required/iu.test(rawText)) {
    return { category: 'permission', message: 'You do not have permission to do that. Ask an administrator if you need access.', retryable: false };
  }
  const credentialError = getCredentialErrorInfo(rawText, delay);
  if (credentialError) return credentialError;
  if (status === 410 || /\b(?:query|result|template|category|record|run) not found\b|no saved results|result file not found/iu.test(rawText)) {
    return { category: 'not_found', message: 'That item could not be found. It may have been removed or may no longer be available.', retryable: false };
  }
  if (status === 404) {
    return { category: 'api_not_found', message: 'The Query service could not be found at this address. Check the API address and try again.', retryable: false };
  }
  if (status === 409 || status === 412 || /conflict|changed by another|stale (?:version|update)|already (?:exists|running|completed|canceled)/iu.test(rawText)) {
    return { category: 'conflict', message: 'This information changed before your update was saved. Refresh and try again.', retryable: true };
  }
  return null;
}

function getQueryErrorInfo({ rawText, status, errorCode }) {
  if (/no display fields|display_fields.*required|at least one (?:display )?field|columns? (?:is|are) required/iu.test(rawText)) {
    return { category: 'missing_fields', message: 'Choose at least one field to display, then run the query again.', retryable: true };
  }
  if (/unknown (?:display )?field|field .*not (?:found|supported)|invalid field/iu.test(rawText)) {
    return { category: 'unknown_field', message: 'One of the selected fields is no longer available. Remove it or reload the field list, then try again.', retryable: true };
  }
  if (/unknown operator|unsupported operator|invalid operator/iu.test(rawText)) {
    return { category: 'operator', message: 'One of the filters uses an option that is not supported for that field. Edit the filter and try again.', retryable: true };
  }
  if (/filter.*(?:value|required|blank|empty|invalid)|missing.*filter|invalid.*filter/iu.test(rawText)) {
    return { category: 'filter', message: 'One of the filters is incomplete or invalid. Check the highlighted filter and try again.', retryable: true };
  }
  if (status === 413 || status === 431 || /request entity too large|payload too large|body too large|content too large|request header fields too large/iu.test(rawText)) {
    return { category: 'request_size', message: 'This request is too large. Remove some records or fields and try again.', retryable: true };
  }
  if (status === 507 || /row limit|line too large|too many rows|maximum rows|result.*too large|output.*(?:limit|too large)|memory limit|capacity exceeded|too many (?:keys|records|items)|insufficient storage/iu.test(rawText)
      || ['query_line_too_large', 'query_output_byte_limit_exceeded', 'query_row_limit_exceeded'].includes(errorCode)) {
    return { category: 'result_size', message: 'This query is too large to finish safely. Add a filter or request fewer fields, then try again.', retryable: true };
  }
  return null;
}

function getTransportErrorInfo({ error, rawText, status }) {
  if (error?.isTimeout || error?.name === 'TimeoutError' || status === 408 || status === 504 || /timed? out|deadline exceeded|time limit/iu.test(rawText)) {
    return { category: 'timeout', message: 'The request took too long to finish. Try again, or narrow the query if it is large.', retryable: true };
  }
  if (status === 499 || error?.name === 'AbortError' || /(?:request|operation) (?:was )?aborted|user cancel/iu.test(rawText)) {
    return { category: 'canceled', message: 'The action was canceled.', retryable: true };
  }
  if (error?.isNetworkError || /failed to fetch|networkerror|network error|connection (?:failed|refused|reset|closed|ended)|load failed|offline|dns|socket/iu.test(rawText)) {
    return { category: 'network', message: 'The server could not be reached. Check your connection and try again.', retryable: true };
  }
  if (status === 415 || /content-type must be|unsupported media type/iu.test(rawText)) {
    return { category: 'request_format', message: 'The app and server could not understand each other. Refresh the page and try again.', retryable: true };
  }
  if (status === 406 || /invalid json|unexpected token|jsonl|result stream|content-type|non-streaming|meta event|row event|done event|protocol version|not acceptable/iu.test(rawText)) {
    return { category: 'response_format', message: 'The server returned results in a format this version cannot read. Refresh the page and try again.', retryable: true };
  }
  return null;
}

function getServiceErrorInfo({ rawText, status, errorCode }) {
  if (/worldcat|oclc|metadata api|external provider|provider unavailable/iu.test(rawText)) {
    return { category: 'external_service', message: 'WorldCat is not available right now. Try again later.', retryable: true };
  }
  if (/catalogdump|selcatalog|selcallnum|selitem|enrichment|backend command|command failed|exit code|library system/iu.test(rawText)) {
    return { category: 'library_system', message: 'The library system could not finish this request. Try again; if it continues, contact support.', retryable: true };
  }
  if (/failed to load field definitions|policy data is temporarily unavailable/iu.test(rawText)
      || ['field_definitions_failed', 'policy_data_failed'].includes(errorCode)) {
    return { category: 'field_metadata', message: 'The field list is temporarily unavailable. Wait a moment, then reload it.', retryable: true };
  }
  if (/request origin is not allowed|cors/iu.test(rawText)) {
    return { category: 'origin', message: 'This page is not allowed to connect to that server. Open the approved Query site or reset the API address.', retryable: false };
  }
  if (status === 405 || /method not allowed/iu.test(rawText)) {
    return { category: 'method', message: 'The server does not accept this request. Refresh the page and try again.', retryable: true };
  }
  if (/incomplete request body|valid content-length|failed to initialize result streaming|failed to start query worker/iu.test(rawText)
      || ['backend_module_error', 'command_build_failed', 'fork_failed', 'internal_server_error', 'pipe_failed', 'post_processing_failed', 'process_identity_mismatch', 'query_command_start_failed'].includes(errorCode)) {
    return { category: 'server', message: 'The server could not start or finish the request. Try again; if it continues, contact support.', retryable: true };
  }
  if (status >= 500) {
    return { category: 'server', message: 'The server ran into a problem. Try again; if it continues, contact support.', retryable: true };
  }
  return null;
}

function getClientErrorInfo(error, options = {}) {
  const fallback = normalizeText(options.fallback, 240) || DEFAULT_ERROR_MESSAGE;
  const rawText = getRawErrorText(error);
  const status = getErrorStatus(error);
  const delay = getRetryDelay(error);
  const errorCode = normalizeText(getErrorDetails(error).code, 120).toLowerCase();

  const context = { error, rawText, status, delay, errorCode };
  const classified = getAccessErrorInfo(context)
    || getQueryErrorInfo(context)
    || getTransportErrorInfo(context)
    || getServiceErrorInfo(context);
  if (classified) return classified;

  if ((status === 400 || status === 422)
      && /unclassified|validation problem|bad request|invalid query request|unsupported action|action .*required/iu.test(rawText)) {
    return { category: 'request', message: 'The request is incomplete or invalid. Check your selections and try again.', retryable: true };
  }

  if (isPlainSafeMessage(rawText)) {
    const message = normalizeText(rawText, 240);
    return { category: 'explained', message: /[.!?]$/u.test(message) ? message : `${message}.`, retryable: false };
  }

  if (status === 400 || status === 422) {
    return { category: 'request', message: 'The request is incomplete or invalid. Check your selections and try again.', retryable: true };
  }

  return { category: 'unknown', message: fallback, retryable: true };
}

function getClientErrorMessage(error, options = {}) {
  return getClientErrorInfo(error, options).message;
}

export {
  DEFAULT_ERROR_MESSAGE,
  getClientErrorInfo,
  getClientErrorMessage,
  isPlainSafeMessage
};
