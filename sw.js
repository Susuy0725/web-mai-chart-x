// Basic service worker for offline caching
// Cache name should be bumped when assets change
const CACHE_NAME = 'web-mai-chart-cache-v3';
const ASSETS = [
    './',
    './index.html',
    './main.css',
    './main.js',
    './renderer.js',
    './helper.js',
    './decode.js',
    './indexDB.js',
    './jszip.min.js',
    './mediabunny.cjs',
    './favicon.ico',
    './Skin/outline.png',
];

self.addEventListener('install', (event) => {
    console.log('Service worker installing', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            )
        ).then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // 唯有同源請求才處理快取
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    event.respondWith(
        // 加上 ignoreSearch: true，防止 main.css?v=1.2 這種版本號導致快取失效
        caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {

            // 定義發送網路請求的邏輯
            const fetchPromise = fetch(event.request)
                .then((networkResponse) => {
                    // 🔴 關鍵修正：必須同時滿足 ok 且 status 為 200 才能放進快取，防止 404 HTML 污染快取
                    if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                        const cloned = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    // 網路斷線且無快取時的 Fallback
                    if (event.request.destination === 'document' || event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });

            // ✨ 優化策略：Stale-While-Revalidate
            // 如果有快取就「先拿去用」（讓畫面秒開），但同時在背景偷偷發送 fetchPromise 去下載最新版更新快取
            // 如果沒快取，就直接走網路請求 fetchPromise
            return cachedResponse || fetchPromise;
        })
    );
});

