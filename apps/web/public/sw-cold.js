self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => self.clients.claim());
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Allow the app shell, static assets, and navigations to load
  if (sameOrigin) {
    // Block internal API calls in cold mode (including /api/ping for self-check)
    if (url.pathname.startsWith('/api/') || url.pathname === '/cold/sw-probe') {
      event.respondWith(new Response('Cold Mode: network blocked', { status: 451, statusText: 'Unavailable For Legal Reasons' }));
      return;
    }
    // Otherwise let the request proceed normally
    return;
  }
  // Block all cross-origin traffic
  event.respondWith(new Response('Cold Mode: network blocked', { status: 451, statusText: 'Unavailable For Legal Reasons' }));
});
