const CACHE_VERSION = 'v25';
const BASE_URL = new URL('./', self.location.href);
const CACHE_PREFIX = `wallet-plus:${BASE_URL.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_FILES = [
  'index.html',
  'manifest.webmanifest',
  'assets/wallet.svg',
  'assets/channels/primo-pobre.jpg',
  'assets/channels/nath-financas.jpg',
  'assets/channels/me-poupe.jpg',
  'assets/channels/economirna.jpg',
  'assets/channels/gustavo-cerbasi.jpg',
  'assets/channels/dinheiro-com-voce.jpg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/apple-touch-icon.png',
  'assets/vendor/chart.umd.js',
  'css/global.css',
  'css/pages/dashboard.css',
  'css/pages/finance.css',
  'css/pages/transactions.css',
  'css/pages/goals.css',
  'css/pages/reports.css',
  'css/pages/onboarding.css',
  'css/pages/education.css',
  'js/app.js',
  'js/navigation.js',
  'js/components/ui.js',
  'js/components/charts.js',
  'js/components/money-input.js',
  'js/components/recurring-card.js',
  'js/domain/finance.js',
  'js/domain/validation.js',
  'js/services/auth.js',
  'js/services/repository.js',
  'js/services/backup.js',
  'js/services/pwa.js',
  'js/data/demo.js',
  'js/data/education.js',
  'js/pages/dashboard.js',
  'js/pages/transactions.js',
  'js/pages/bills.js',
  'js/pages/goals.js',
  'js/pages/education.js',
  'js/pages/reports.js',
  'js/pages/settings.js',
  'js/pages/onboarding.js',
].map(path => new URL(path, BASE_URL).href);
const cachedURLs = new Set(APP_FILES);
const entryURL = new URL('index.html', BASE_URL).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES.map(url => new Request(url, {cache: 'reload'})))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE_URL.origin) return;
  url.search = '';
  url.hash = '';
  const key = url.href === BASE_URL.href ? entryURL : url.href;
  if (!cachedURLs.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(key) || fetch(request);
  })());
});
