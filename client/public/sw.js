self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass through fetch to allow offline prompt if needed
  e.respondWith(
    fetch(e.request).catch(() => new Response('Offline'))
  );
});
