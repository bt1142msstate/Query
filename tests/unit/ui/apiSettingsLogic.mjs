import assert from 'node:assert/strict';
import test from 'node:test';

function installBrowserConfig(href = 'https://app.example.test/index.html') {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      href,
      search: new URL(href).search
    }
  });

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      __queryProjectStorageMock: true,
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {}
    }
  });
}

test('api settings URL helpers normalize and preserve non-api URL state', async () => {
  installBrowserConfig('https://app.example.test/index.html?spec=abc&query_api_url=https%3A%2F%2Fold.example%2Fquery');
  const module = await import(`../../../src/ui/apiSettings.js?case=url-${Date.now()}`);

  assert.equal(
    module.normalizeApiUrlForHref('/api/query', 'https://app.example.test/reports/index.html'),
    'https://app.example.test/api/query'
  );
  assert.equal(
    module.normalizeApiUrlForHref('ftp://example.test/query', 'https://app.example.test/index.html'),
    ''
  );

  const withoutApi = module.buildPageUrlWithoutApiParams(
    'https://app.example.test/index.html?spec=abc&api_url=https%3A%2F%2Fold.example%2Fquery&query_api_url=/legacy'
  );
  const withoutApiUrl = new URL(withoutApi);
  assert.equal(withoutApiUrl.searchParams.get('spec'), 'abc');
  assert.equal(withoutApiUrl.searchParams.has('api_url'), false);
  assert.equal(withoutApiUrl.searchParams.has('query_api_url'), false);

  const launch = module.buildApiLaunchUrl(
    'https://app.example.test/index.html?spec=abc&query_api_url=https%3A%2F%2Fold.example%2Fquery',
    'https://new.example.test/query'
  );
  const launchUrl = new URL(launch);
  assert.equal(launchUrl.searchParams.get('spec'), 'abc');
  assert.equal(launchUrl.searchParams.get('api_url'), 'https://new.example.test/query');
  assert.equal(launchUrl.searchParams.has('query_api_url'), false);
});

test('api settings helpers expose connection mode and field extraction', async () => {
  installBrowserConfig('https://app.example.test/index.html');
  const module = await import(`../../../src/ui/apiSettings.js?case=mode-${Date.now()}`);

  assert.deepEqual(
    module.getApiConnectionMode('https://mlp.sirsi.net/uhtbin/query_api.pl'),
    {
      isDefault: true,
      label: 'Default endpoint'
    }
  );
  assert.deepEqual(
    module.getApiConnectionMode(
      'https://bt1142msstate.github.io/Query/demo-api',
      'https://bt1142msstate.github.io/Query/demo-api'
    ),
    {
      isDefault: true,
      label: 'Sample data demo'
    }
  );
  assert.deepEqual(
    module.getApiConnectionMode('https://backend.example.test/query'),
    {
      isDefault: false,
      label: 'Custom endpoint'
    }
  );

  assert.deepEqual(module.extractFields([{ name: 'Example' }]), [{ name: 'Example' }]);
  assert.deepEqual(module.extractFields({ fields: [{ name: 'Example' }] }), [{ name: 'Example' }]);
  assert.deepEqual(module.extractFields({ rows: [] }), []);
});

test('api settings async guard ignores stale checks after endpoint edits', async () => {
  installBrowserConfig('https://app.example.test/index.html');
  const module = await import(`../../../src/ui/apiSettings.js?case=guard-${Date.now()}`);
  const guard = module.createApiSettingsAsyncGuard();

  const firstCheck = guard.next();
  assert.equal(guard.isCurrent(firstCheck), true);

  guard.invalidate();
  assert.equal(guard.isCurrent(firstCheck), false);

  const secondCheck = guard.next();
  assert.equal(guard.isCurrent(firstCheck), false);
  assert.equal(guard.isCurrent(secondCheck), true);
});
