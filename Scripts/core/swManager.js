import { t } from '../i18n.js';

let swProgressToast = null;

export function showSwUpdateProgress({ loaded = 0, total = 0, progress = 0, file = '' } = {}) {
    if (!swProgressToast) {
        swProgressToast = document.createElement('div');
        swProgressToast.className = 'sw-update-toast show';
        swProgressToast.innerHTML = `
            <div class="sw-update-header">
                <span class="sw-update-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: sw-spin 1.2s linear infinite;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    <span class="sw-title-text">${t('toast.swUpdating') || '正在下載離線更新...'}</span>
                </span>
                <span class="sw-update-percent">${progress}%</span>
            </div>
            <div class="sw-update-progress-bar-bg">
                <div class="sw-update-progress-bar-fill" style="transform: scaleX(${progress / 100})"></div>
            </div>
            <div class="sw-update-details">
                <span class="sw-update-file">${file ? file.replace('./', '') : ''}</span>
                <span class="sw-update-count">${loaded} / ${total}</span>
            </div>
        `;
        document.body.appendChild(swProgressToast);
    } else {
        const fill = swProgressToast.querySelector('.sw-update-progress-bar-fill');
        const percent = swProgressToast.querySelector('.sw-update-percent');
        const fileEl = swProgressToast.querySelector('.sw-update-file');
        const countEl = swProgressToast.querySelector('.sw-update-count');

        if (fill) fill.style.transform = `scaleX(${progress / 100})`;
        if (percent) percent.textContent = `${progress}%`;
        if (fileEl && file) fileEl.textContent = file.replace('./', '');
        if (countEl) countEl.textContent = `${loaded} / ${total}`;
    }
}

export function showSwUpdateComplete() {
    if (!swProgressToast) {
        swProgressToast = document.createElement('div');
        document.body.appendChild(swProgressToast);
    }

    swProgressToast.className = 'sw-update-toast show completed';
    swProgressToast.innerHTML = `
        <div class="sw-update-header">
            <span class="sw-update-title">
                <svg style="color: var(--sw-complete-color);" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>${t('toast.swUpdated') || '版本更新已就緒！'}</span>
            </span>
            <span class="sw-update-percent">100%</span>
        </div>
        <div class="sw-update-progress-bar-bg">
            <div class="sw-update-progress-bar-fill" style="transform: scaleX(1)"></div>
        </div>
        <div class="sw-update-details">
            <span>${t('toast.swUpdateDetail') || '快取已更新，請重新整理以套用最新版本'}</span>
        </div>
        <div class="sw-update-actions">
            <button class="sw-update-btn sw-update-btn-dismiss">${t('toast.swDismiss') || '稍後'}</button>
            <button class="sw-update-btn sw-update-btn-reload">${t('toast.swReloadNow') || '立即重新整理'}</button>
        </div>
    `;

    const reloadBtn = swProgressToast.querySelector('.sw-update-btn-reload');
    const dismissBtn = swProgressToast.querySelector('.sw-update-btn-dismiss');

    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => {
            window.location.reload();
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            swProgressToast.classList.remove('show');
            setTimeout(() => {
                swProgressToast?.remove();
                swProgressToast = null;
            }, 300);
        });
    }
}

window.showSwUpdateComplete = showSwUpdateComplete;

export function initServiceWorker() {
    const isDev =
        self.location.hostname === 'localhost' ||
        self.location.hostname === '127.0.0.1' ||
        self.location.hostname.endsWith('.ngrok-free.app');

    if ('serviceWorker' in navigator && !isDev) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            const data = event.data;
            if (!data) return;

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
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
