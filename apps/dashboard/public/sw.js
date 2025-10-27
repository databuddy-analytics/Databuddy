// Minimal service worker for PWA installation only
// No caching, no push notifications - just enables PWA installation

// Install event - minimal setup
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    self.skipWaiting()
  );
});

// Activate event - clean up
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    self.clients.claim()
  );
});

// Fetch event - no caching, just pass through
self.addEventListener('fetch', (event) => {
  // Let all requests pass through to network
  // No caching since app requires online connection
  return;
});