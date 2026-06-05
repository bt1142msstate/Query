import assert from 'node:assert/strict';
import test from 'node:test';

test('backend api', async () => {
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

  const searchStorage = installBrowserConfig({
    href: 'https://app.example.test/query/index.html?api_url=/api/query',
    search: '?api_url=/api/query'
  });
  const searchModule = await import(`../../core/backendApi.js?case=search-${Date.now()}`);

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
  const storedModule = await import(`../../core/backendApi.js?case=stored-${Date.now()}`);
  assert.equal(storedModule.getApiUrl(), 'https://stored.example.test/query');
});
