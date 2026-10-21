import { t } from '../i18n.js';
import { simpleToast } from '../helper.js';

let isUpdating = false;
let latestProgressData = null;

export function promptSwUpdate({ onConfirm, onDelay } = {}) {
    if (sessionStorage.getItem('sw_update_deferred') === 'true') {
        return null;
    }

    return simpleToast({
        id: 'sw-update-toast',
        type: 'info',
        title: t('toast.swUpdateAvailableTitle') || '發現新版本',
        content: t('toast.swUpdateAvailableDesc') || '偵測到應用程式有新版本，是否立即更新？',
        timeout: 0,
        closable: true,
        buttons: [
            {
                text: t('toast.swDelay') || '延遲',
                primary: false,
                onClick: (toast) => {
                    sessionStorage.setItem('sw_update_deferred', 'true');
                    isUpdating = false;
                    if (typeof onDelay === 'function') onDelay();
                }
            },
            {
                text: t('toast.swUpdate') || '更新',
                primary: true,
                onClick: (toast) => {
                    isUpdating = true;
                    if (typeof onConfirm === 'function') {
                        onConfirm();
                    } else if (latestProgressData?.completed) {
                        showSwUpdateComplete();
                    } else {
                        const progress = latestProgressData?.progress || 0;
                        const loaded = latestProgressData?.loaded || 0;
                        const total = latestProgressData?.total || 0;
                        const file = latestProgressData?.file || '';
                        showSwUpdateProgress({ loaded, total, progress, file });
                    }
                    return false; // 保持 Toast 開啟以展示下載進度
                }
            }
        ]
    });
}

export function showSwUpdateProgress({ loaded = 0, total = 0, progress = 0, file = '' } = {}) {
    if (sessionStorage.getItem('sw_update_deferred') === 'true') return;

    latestProgressData = { loaded, total, progress, file, completed: false };

    // 若使用者尚未點擊「更新」，先提示使用者決定更新
    if (!isUpdating) {
        promptSwUpdate();
        return;
    }

    simpleToast({
        id: 'sw-update-toast',
        type: 'info',
        title: t('toast.swUpdating') || '正在下載離線更新...',
        content: `${progress}%`,
        detail: `${file ? file.replace('./', '') : ''} (${loaded} / ${total})`,
        progress,
        timeout: 0,
        closable: true,
        buttons: []
    });
}

export function showSwUpdateComplete() {
    if (sessionStorage.getItem('sw_update_deferred') === 'true') return;

    latestProgressData = { ...(latestProgressData || {}), progress: 100, completed: true };

    if (!isUpdating) {
        promptSwUpdate();
        return;
    }

    simpleToast({
        id: 'sw-update-toast',
        type: 'success',
        title: t('toast.swUpdated') || '版本更新已就緒！',
        content: t('toast.swUpdateDetail') || '快取已更新，請重新整理以套用最新版本',
        detail: '',
        progress: 100,
        timeout: 0,
        closable: true,
        buttons: [
            {
                text: t('toast.swDismiss') || '稍後',
                primary: false,
                onClick: () => {
                    isUpdating = false;
                }
            },
            {
                text: t('toast.swReloadNow') || '立即重新整理',
                primary: true,
                onClick: () => {
                    window.location.reload();
                }
            }
        ]
    });
}

window.showSwUpdateProgress = showSwUpdateProgress;
window.showSwUpdateComplete = showSwUpdateComplete;
window.promptSwUpdate = promptSwUpdate;

export function mockSwUpdateFlow() {
    sessionStorage.removeItem('sw_update_deferred');
    isUpdating = false;
    latestProgressData = null;

    let progress = 0;
    const total = 50;

    promptSwUpdate({
        onDelay: () => {
            console.log('[MockSW] 使用者選擇延遲更新，下次重新整理時生效。');
        },
        onConfirm: () => {
            console.log('[MockSW] 使用者決定更新，開始模擬下載流程...');
            showSwUpdateProgress({ loaded: 0, total, progress: 0, file: './Scripts/main.js' });

            const timer = setInterval(() => {
                progress += 10;
                const loaded = Math.round((progress / 100) * total);
                showSwUpdateProgress({
                    loaded,
                    total,
                    progress: Math.min(100, progress),
                    file: `./Scripts/chunk-${progress}.js`
                });

                if (progress >= 100) {
                    clearInterval(timer);
                    setTimeout(() => {
                        showSwUpdateComplete();
                    }, 400);
                }
            }, 250);
        }
    });
}
window.mockSwUpdateFlow = mockSwUpdateFlow;

export function initServiceWorker() {
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

            // 首次載入時由 SW 背景靜默快取，不彈出更新進度與就緒提示
            if (!hasExistingController || data.isUpdate === false) return;

            if (data.type === 'SW_UPDATE_START' || data.type === 'SW_UPDATE_PROGRESS') {
                showSwUpdateProgress(data);
            } else if (data.type === 'SW_UPDATE_COMPLETE') {
                showSwUpdateComplete();
            }
        });

        navigator.serviceWorker.register('./sw.js')
            .then((reg) => {
                console.log('Service worker registered:', reg);

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && hasExistingController) {
                            showSwUpdateComplete();
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
