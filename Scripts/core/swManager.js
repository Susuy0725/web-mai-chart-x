let hasCompletedPrompt = false;
let isCapsuleBound = false;

function getSwUpdateCapsule() {
    return document.getElementById('swUpdateCapsule');
}

function bindSwUpdateCapsule() {
    if (isCapsuleBound) return;
    const capsule = getSwUpdateCapsule();
    if (!capsule) return;

    const applyUpdate = () => {
        window.location.reload();
    };

    capsule.addEventListener('click', applyUpdate);
    capsule.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            applyUpdate();
        }
    });

    isCapsuleBound = true;
}

export function showSwUpdateProgress() {
    // 背景靜默下載更新，不顯示進度條彈窗
}

export function showSwUpdateComplete({ fromEvent = false } = {}) {
    if (fromEvent && hasCompletedPrompt) return;
    hasCompletedPrompt = true;

    bindSwUpdateCapsule();
    const capsule = getSwUpdateCapsule();
    if (capsule) {
        capsule.hidden = false;
    }
}

window.showSwUpdateProgress = showSwUpdateProgress;
window.showSwUpdateComplete = showSwUpdateComplete;

export function mockSwUpdateFlow() {
    hasCompletedPrompt = false;
    showSwUpdateComplete();
    console.log('[MockSW] 已顯示套用更新膠囊，點擊即可重新整理。');
}
window.mockSwUpdateFlow = mockSwUpdateFlow;

export function initServiceWorker() {
    bindSwUpdateCapsule();

    const isRelease = self.location.hostname === 'susuy0725.github.io';

    if (!isRelease) {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                for (const reg of registrations) {
                    reg.unregister();
                }
            }).catch(() => { });
        }
        if ('caches' in window) {
            caches.keys().then((keys) => {
                for (const key of keys) caches.delete(key);
            }).catch(() => { });
        }
        return;
    }

    if ('serviceWorker' in navigator && isRelease) {
        // 核心檢查：僅當頁面啟動時已由既有的 Service Worker 控制，才屬於「版本更新」，否則為「首次載入安裝」
        const hasExistingController = Boolean(navigator.serviceWorker.controller);

        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data;
            if (!data) return;

            // 首次載入時由 SW 背景靜默快取，不顯示更新膠囊
            if (!hasExistingController || data.isUpdate === false) return;

            if (data.type === 'SW_UPDATE_COMPLETE') {
                showSwUpdateComplete({ fromEvent: true });
            }
        });

        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then((reg) => {
                console.log('Service worker registered:', reg);

                if (reg.waiting && hasExistingController) {
                    showSwUpdateComplete({ fromEvent: true });
                }

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && hasExistingController) {
                            showSwUpdateComplete({ fromEvent: true });
                        }
                    });
                });

                reg.update().catch((err) => {
                    console.warn('Service worker update failed:', err);
                });
            })
            .catch((err) => {
                console.warn('Service worker registration failed:', err);
            });
    }
}
