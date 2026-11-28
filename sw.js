// Basic service worker for offline caching
// Cache name should be bumped when assets change
const isRelease = self.location.hostname === 'susuy0725.github.io';

const CACHE_NAME = (() => {
    if (!isRelease) {
        return 'web-mai-chart-dev-' + Date.now();
    } else {
        return 'web-mai-chart-cache-__CACHE_VERSION__';
    }
})();

const ASSETS = [
    './',
    './index.html',
    './privacy.html',
    './terms.html',
    './Styles/main.css',
    './Styles/playControls.css',
    './Styles/popup.css',
    './Styles/drive.css',
    './Styles/settings.css',
    './Styles/chartInfo.css',
    './Styles/welcome.css',
    './Scripts/main.js',
    './Scripts/audioManager.js',
    './Scripts/majdataWs.js',
    './Scripts/modals/banana.js',
    './Scripts/modals/bgmEditor.js',
    './Scripts/modals/chartInfoModal.js',
    './Scripts/modals/driveManager.js',
    './Scripts/modals/extensionManagerModal.js',
    './Scripts/modals/helpModal.js',
    './Scripts/modals/mainoteFetcher.js',
    './Scripts/modals/projectManager.js',
    './Scripts/modals/recordVideoModal.js',
    './Scripts/modals/resourceManagerModal.js',
    './Scripts/modals/maintenanceModal.js',
    './Scripts/modals/aboutModal.js',
    './Scripts/modals/changelogModal.js',
    './Scripts/modals/settingControls.js',
    './Scripts/modals/settingsModal.js',
    './Scripts/modals/welcomeModal.js',
    './Scripts/modals/legalUpdateModal.js',
    './Scripts/modals/noteDurationModal.js',
    './Scripts/modals/slideEditorModal.js',
    './Scripts/modals/smoothBpmModal.js',
    './Scripts/modals/subdivisionModal.js',
    './Scripts/modals/touchGroupModal.js',
    './Scripts/features/editorHighlightOverlay.js',
    './Scripts/features/formatter.js',
    './Scripts/features/subdivision.js',
    './Scripts/features/visualEditor.js',
    './Scripts/features/visualFloatingMenu.js',
    './Scripts/features/visualSubMenu.js',
    './Scripts/features/fileHandler.js',
    './Scripts/features/extensionMenu.js',
    './Scripts/features/extensionPopover.js',
    './Scripts/features/findReplace.js',
    './Scripts/features/editorAutocomplete.js',
    './Scripts/features/noteModifier.js',
    './Scripts/features/quickPanel.js',
    './Scripts/features/secondaryWindow.js',
    './Scripts/features/smoothBpm.js',
    './Scripts/features/videoRender.js',
    './Scripts/features/wmcxPackage.js',
    './Scripts/features/wmcxRestore.js',
    './Scripts/services/driveApi.js',
    './Scripts/services/driveAuth.js',
    './Scripts/services/driveOpenWith.js',
    './Scripts/services/driveSync.js',
    './Scripts/services/transferProgress.js',
    './Scripts/core/appContext.js',
    './Scripts/core/chartGeometry.js',
    './Scripts/core/commandRegistry.js',
    './Scripts/core/decodeWorkerManager.js',
    './Scripts/core/eventBus.js',
    './Scripts/core/extensionLoader.js',
    './Scripts/core/extensionManager.js',
    './Scripts/core/extensionOverrideRegistry.js',
    './Scripts/core/extensionRepo.js',
    './Scripts/core/extensionStorage.js',
    './Scripts/core/frameProfiler.js',
    './Scripts/core/init.js',
    './Scripts/core/keybindings.js',
    './Scripts/core/legalVersionManager.js',
    './Scripts/core/noteScore.js',
    './Scripts/core/panelLayout.js',
    './Scripts/core/playbackEngine.js',
    './Scripts/core/renderOverlayRegistry.js',
    './Scripts/core/settingsConfig.js',
    './Scripts/core/simaiLogicControler.js',
    './Scripts/core/skinConfig.js',
    './Scripts/core/swManager.js',
    './Scripts/core/videoFrameDecoder.js',
    './Scripts/core/wmcxExtract.js',
    './Scripts/workers/decodeWorker.js',
    './Scripts/renderer.js',
    './Scripts/helper.js',
    './Scripts/decode.js',
    './Scripts/indexDB.js',
    './Scripts/jszip.min.js',
    './Scripts/mediabunny.cjs',
    './favicon.ico',
    './favicon.png',
    './Fonts/ShareTechMono-Regular.ttf',
    './Fonts/Inter.ttf',
    './Fonts/FOT-NewRodin Pro B.otf',
    './Fonts/Geologica_Auto-Regular.ttf',
    './Scripts/i18n.js',
    './config/manifest.json',
    './locales/en.json',
    './locales/ja.json',
    './locales/zh-TW.json',
    './locales/zh-CN.json',
    './locales/ko.json',
    './rpc.js',
    './_play/index.html',
    './_play/main.css',
    './_play/Styles/playControls.css',
    './_play/Styles/settings.css',
    './_play/Styles/popup.css',
    './_play/Styles/drive.css',
    './_play/Styles/chartInfo.css',
    './_play/main.js',
    './_play/simplay.js',
    './_play/renderer.js',
    './_play/slideDebug.js',
    './_play/slidetables.js',
];

const ASSET_HASHES_KEY = './__sw_asset_hashes__.json';
// 正式建置部署時會透過 .github/scripts/inject-sw-hashes.mjs 注入各檔案內容雜湊
const ASSET_HASHES = null; // __ASSET_HASHES__
const SCOPE_PATH = new URL('./', self.location.href).pathname;

function toRelativeAssetUrl(requestUrl) {
    if (!requestUrl.pathname.startsWith(SCOPE_PATH)) return null;
    const sub = requestUrl.pathname.slice(SCOPE_PATH.length);
    return sub ? `./${sub}` : './';
}

async function broadcast(message) {
    try {
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        for (const client of clients) {
            client.postMessage(message);
        }
    } catch (err) {
        console.warn('SW broadcast error:', err);
    }
}

async function loadPreviousCacheHashes() {
    const prevEntries = new Map(); // url -> { hash, cache }
    if (!ASSET_HASHES) return prevEntries;

    try {
        const keys = await caches.keys();
        const oldKeys = keys.filter((k) => k !== CACHE_NAME && k.startsWith('web-mai-chart-cache-'));
        for (const key of oldKeys) {
            try {
                const oldCache = await caches.open(key);
                const metaResp = await oldCache.match(ASSET_HASHES_KEY);
                if (!metaResp || !metaResp.ok) continue;
                const hashMap = await metaResp.json();
                if (!hashMap || typeof hashMap !== 'object') continue;
                for (const [url, hash] of Object.entries(hashMap)) {
                    if (typeof hash === 'string' && !prevEntries.has(url)) {
                        prevEntries.set(url, { hash, cache: oldCache });
                    }
                }
            } catch (err) {
                console.warn(`Failed to read hash manifest from ${key}:`, err);
            }
        }
    } catch (err) {
        console.warn('Failed to enumerate previous caches:', err);
    }
    return prevEntries;
}

self.addEventListener('install', (event) => {
    console.log('Service worker installing', CACHE_NAME);
    const isUpdate = Boolean(self.registration.active);
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const prevEntries = await loadPreviousCacheHashes();
            const nextHashes = {};
            const urlsToFetch = [];

            // 先從舊快取零流量複製未變更的檔案
            await Promise.all(
                ASSETS.map(async (url) => {
                    const expectedHash = ASSET_HASHES ? ASSET_HASHES[url] : null;
                    const prev = expectedHash ? prevEntries.get(url) : null;
                    if (expectedHash && prev && prev.hash === expectedHash) {
                        try {
                            const cachedResp = await prev.cache.match(url);
                            if (cachedResp && cachedResp.ok && cachedResp.status === 200) {
                                await cache.put(url, cachedResp);
                                nextHashes[url] = expectedHash;
                                return;
                            }
                        } catch (_) { }
                    }
                    urlsToFetch.push(url);
                })
            );

            const total = urlsToFetch.length;
            let loaded = 0;

            if (isUpdate && total > 0) {
                await broadcast({
                    type: 'SW_UPDATE_START',
                    total,
                    loaded: 0,
                    progress: 0,
                    isUpdate: true
                });
            }

            if (total > 0) {
                await Promise.all(
                    urlsToFetch.map(async (url) => {
                        try {
                            const response = await fetch(url, { cache: 'no-cache' });
                            if (response && response.ok && response.status === 200) {
                                await cache.put(url, response);
                                if (ASSET_HASHES && ASSET_HASHES[url]) {
                                    nextHashes[url] = ASSET_HASHES[url];
                                }
                            }
                        } catch (err) {
                            console.warn(`Failed to cache asset ${url}:`, err);
                        } finally {
                            loaded++;
                            const progress = Math.round((loaded / total) * 100);
                            if (isUpdate) {
                                await broadcast({
                                    type: 'SW_UPDATE_PROGRESS',
                                    total,
                                    loaded,
                                    progress,
                                    file: url,
                                    isUpdate: true
                                });
                            }
                        }
                    })
                );
            }

            if (ASSET_HASHES) {
                try {
                    await cache.put(
                        ASSET_HASHES_KEY,
                        new Response(JSON.stringify(nextHashes), {
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                } catch (err) {
                    console.warn('Failed to persist asset hashes:', err);
                }
            }

            if (isUpdate) {
                await broadcast({
                    type: 'SW_UPDATE_COMPLETE',
                    total,
                    loaded: total,
                    progress: 100,
                    isUpdate: true
                });
            }
        })()
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
    if (!isRelease) return;
    if (event.request.method !== 'GET') return;

    // 唯有同源請求才處理快取
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== self.location.origin) return;

    const relUrl = toRelativeAssetUrl(requestUrl);
    const isManagedPrecache = Boolean(
        ASSET_HASHES &&
        relUrl &&
        Object.prototype.hasOwnProperty.call(ASSET_HASHES, relUrl)
    );

    event.respondWith(
        caches.open(CACHE_NAME).then((cache) =>
            // 加上 ignoreSearch: true，防止 main.css?v=1.2 這種版本號導致快取失效
            cache.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                // 已列管於版本雜湊預快取中的檔案，直接使用當前版本快取 (Cache-First)，
                // 避免每次載入時在背景重複下載大型靜態庫 (如 mediabunny.cjs / jszip.min.js)
                if (cachedResponse && isManagedPrecache) {
                    return cachedResponse;
                }

                // 未列入預快取的動態資源 (如 Skin / 音效) 維持 Stale-While-Revalidate
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        // 🔴 關鍵修正：必須同時滿足 ok 且 status 為 200 才能放進快取，防止 404 HTML 污染快取
                        if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
                            const cloned = networkResponse.clone();
                            cache.put(event.request, cloned);
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // 網路斷線且無快取時的 Fallback
                        if (event.request.destination === 'document' || event.request.mode === 'navigate') {
                            return cache.match('./index.html');
                        }
                    });

                return cachedResponse || fetchPromise;
            })
        )
    );
});

