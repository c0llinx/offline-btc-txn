self.addEventListener('install', (event) => self.skipWaiting());
self.addEventListener('activate', (event) => self.clients.claim());
self.addEventListener('fetch', (event) => {
  event.respondWith(new Response('Cold Mode: network blocked', { status: 451, statusText: 'Unavailable For Legal Reasons' }));
});
