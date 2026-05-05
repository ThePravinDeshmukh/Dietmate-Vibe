/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// Injected at build time by vite-plugin-pwa: hashed list of all app shell assets
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// API data: try network first (5 s), fall back to cache when backend is waking up
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/entries') ||
    url.pathname.startsWith('/api/history'),
  new NetworkFirst({
    networkTimeoutSeconds: 5,
    cacheName: 'api-data-v1',
  })
);
