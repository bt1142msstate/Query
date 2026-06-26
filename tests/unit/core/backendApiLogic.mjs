import assert from 'node:assert/strict';
import test from 'node:test';

function installBrowserConfig({ href = 'https://app.example.test/index.html', search = '', storedApiUrl = '' } = {}) {
  const storage = new Map();
  if (storedApiUrl) {
    storage.set('query-project.api-url', storedApiUrl);
  }

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      href,
      search
    }
  });

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      __queryProjectStorageMock: true,
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      removeItem(key) {
        storage.delete(key);
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    }
  });

  return storage;
}

test('backend api', async () => {
  const searchStorage = installBrowserConfig({
    href: 'https://app.example.test/query/index.html?api_url=/api/query',
    search: '?api_url=/api/query'
  });
  const searchModule = await import(`../../../src/core/backendApi.js?case=search-${Date.now()}`);

  assert.equal(searchModule.API_URL, searchModule.DEFAULT_API_URL);
  assert.equal(searchModule.getApiUrl(), 'https://app.example.test/api/query');
  assert.equal(searchStorage.get(searchModule.API_URL_STORAGE_KEY), 'https://app.example.test/api/query');
  assert.equal(searchModule.normalizeApiUrl('/relative/api'), 'https://app.example.test/relative/api');
  assert.equal(searchModule.normalizeApiUrl('ftp://example.test/query'), '');

  searchModule.configureApiUrl('/api/next', { persist: false });
  assert.equal(searchModule.getApiUrl(), 'https://app.example.test/api/next');
  assert.equal(searchStorage.get(searchModule.API_URL_STORAGE_KEY), 'https://app.example.test/api/query');

  searchModule.configureApiUrl('https://backend.example.test/query');
  assert.equal(searchModule.getApiUrl(), 'https://backend.example.test/query');
  assert.equal(searchStorage.get(searchModule.API_URL_STORAGE_KEY), 'https://backend.example.test/query');
  assert.throws(() => searchModule.configureApiUrl('mailto:query@example.test'), /API URL/u);

  searchModule.resetApiUrl();
  assert.equal(searchModule.getApiUrl(), searchModule.DEFAULT_API_URL);
  assert.equal(searchStorage.has(searchModule.API_URL_STORAGE_KEY), false);

  installBrowserConfig({
    href: 'https://app.example.test/index.html',
    search: '',
    storedApiUrl: 'https://stored.example.test/query'
  });
  const storedModule = await import(`../../../src/core/backendApi.js?case=stored-${Date.now()}`);
  assert.equal(storedModule.getApiUrl(), 'https://stored.example.test/query');
});

test('backend api times out pending requests', async () => {
  installBrowserConfig({
    href: 'https://app.example.test/index.html',
    search: ''
  });
  const timeoutModule = await import(`../../../src/core/backendApi.js?case=timeout-${Date.now()}`);
  const originalFetch = globalThis.fetch;

  timeoutModule.configureApiUrl('https://backend.example.test/query', { persist: false });
  globalThis.fetch = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });

  try {
    await assert.rejects(
      () => timeoutModule.postJson({ action: 'get_fields' }, { timeoutMs: 5 }),
      error => {
        assert.equal(error.name, 'BackendRequestTimeoutError');
        assert.equal(error.isTimeout, true);
        assert.equal(error.timeoutMs, 5);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('backend api uses same-origin credential policy', async () => {
  installBrowserConfig({
    href: 'https://app.example.test/index.html',
    search: ''
  });
  const credentialModule = await import(`../../../src/core/backendApi.js?case=credentials-${Date.now()}`);
  const originalFetch = globalThis.fetch;
  let capturedOptions = null;

  credentialModule.configureApiUrl('/api/query', { persist: false });
  globalThis.fetch = async (_url, options = {}) => {
    capturedOptions = options;
    return new Response('{}', {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 200
    });
  };

  try {
    await credentialModule.postJson({ action: 'get_fields' });
    assert.equal(capturedOptions.credentials, 'same-origin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
