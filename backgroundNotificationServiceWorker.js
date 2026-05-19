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
