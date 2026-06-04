self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (!isAppAssetRequest(requestUrl)) return;

  event.respondWith(fetch(event.request, { cache: 'reload' }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const targetUrl = event.notification?.data?.url || './index.html';
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });
    const existingClient = clients.find(client => client.url === targetUrl) || clients[0];
    if (existingClient?.focus) {
      return existingClient.focus();
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
    return null;
  })());
});

function isAppAssetRequest(url) {
  if (url.pathname === '/' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/cache-bust.json')) {
    return true;
  }

  return /\.(?:css|html|js|json|png|svg|webp|woff2?)$/u.test(url.pathname);
}
