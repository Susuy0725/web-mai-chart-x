import { openDB, idbGet } from '../indexDB.js';
import { popupWindow, formatSize, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 清除特定 IndexedDB 鍵值或清空 store
 */
async function clearStoreKeys(filterFn) {
    const db = await openDB();
    const transaction = db.transaction("editorState", "readwrite");
    const store = transaction.objectStore("editorState");
    let count = 0;

    if (!filterFn) {
        store.clear();
    } else {
        const keys = await new Promise((res, rej) => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });

        for (const key of keys) {
            if (filterFn(key)) {
                store.delete(key);
                count++;
            }
        }
    }

    await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
    });

    return count;
}

/**
 * 開啟資源與儲存空間管理彈窗
 */
export async function openResourceManager() {
    async function getStorageData() {
        const db = await openDB();
        const transaction = db.transaction("editorState", "readonly");
        const store = transaction.objectStore("editorState");

        const keys = await new Promise(res => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
        });

        const items = [];
        let totalSize = 0;

        for (const key of keys) {
            const data = await idbGet(key);
            let size = 0;
            if (data instanceof Blob) size = data.size;
            else if (data instanceof ArrayBuffer) size = data.byteLength;
            else size = JSON.stringify(data).length * 2;

            totalSize += size;
            items.push({ key, size });
        }

        items.sort((a, b) => b.size - a.size);
        return { totalSize, items };
    }

    const renderContent = async (container) => {
        container.innerHTML = '';
        const { totalSize, items } = await getStorageData();

        // 頂部統計摘要卡片
        const summaryCard = document.createElement('div');
        summaryCard.className = 'popup-card';
        summaryCard.style.cssText = 'flex-direction: row; justify-content: space-between; align-items: center; background: rgba(68, 153, 238, 0.08); border-color: var(--popup-accent); padding: 12px 16px;';

        const summaryLeft = document.createElement('div');
        summaryLeft.innerHTML = `
            <span style="font-size: 11px; color: var(--popup-text-muted); display: block; font-weight: 500;">${t('popup.resource.totalUsageLabel')}</span>
            <span style="font-size: 18px; font-weight: 700; color: var(--popup-text-main); font-family: 'ShareTechMono', monospace;">${formatSize(totalSize)}</span>
        `;

        const summaryBadge = document.createElement('span');
        summaryBadge.className = 'popup-badge popup-badge-accent';
        summaryBadge.textContent = t('popup.resource.cachedItemsCount', { count: items.length });

        summaryCard.append(summaryLeft, summaryBadge);
        container.appendChild(summaryCard);

        // 詳細鍵值列表
        const listWrapper = document.createElement('div');
        listWrapper.className = 'popup-list';

        if (items.length === 0) {
            listWrapper.innerHTML = `<div style="color: var(--popup-text-muted); text-align: center; padding: 24px 0; font-size: 13px;">${t('popup.resource.emptyCache')}</div>`;
        } else {
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'popup-list-item';
                row.style.padding = '8px 12px';

                const nameEl = document.createElement('span');
                nameEl.className = 'popup-list-item-title';
                nameEl.style.fontSize = '12px';
                nameEl.textContent = item.key;

                const sizeEl = document.createElement('span');
                sizeEl.className = 'popup-badge popup-badge-muted';
                sizeEl.style.fontFamily = 'monospace';
                sizeEl.textContent = formatSize(item.size);

                row.append(nameEl, sizeEl);
                listWrapper.appendChild(row);
            });
        }

        container.appendChild(listWrapper);
    };

    const container = document.createElement('div');
    container.className = 'popup-list';
    container.style.cssText = 'max-height: 400px; overflow-y: auto; padding-right: 4px;';

    await renderContent(container);

    popupWindow({
        title: t('popup.resource.title'),
        customContent: container,
        width: 480,
        maxWidth: 560,
        buttons: [
            {
                text: t('popup.resource.clearCache'),
                onClick: () => {
                    popupWindow({
                        title: t('popup.resource.clearOptionsTitle'),
                        width: 380,
                        buttons: [
                            {
                                text: t('popup.resource.clearAll'),
                                onClick: async (optCtx) => {
                                    if (!confirm(t('popup.resource.confirmClearAll'))) return;
                                    try {
                                        await clearStoreKeys();
                                        await renderContent(container);
                                        optCtx.close();
                                        simpleToast({ content: t('popup.resource.toastClearAll'), type: "success" });
                                    } catch (e) {
                                        console.error("清除資料失敗:", e);
                                    }
                                }
                            },
                            {
                                text: t('popup.resource.clearChartCache'),
                                onClick: async (optCtx) => {
                                    if (!confirm(t('popup.resource.confirmClearChart'))) return;
                                    try {
                                        const count = await clearStoreKeys(key => typeof key === 'string' && key.startsWith('simai_'));
                                        await renderContent(container);
                                        optCtx.close();
                                        simpleToast({ content: t('popup.resource.toastClearChart', { count }), type: "success" });
                                    } catch (e) {
                                        console.error("清除譜面失敗:", e);
                                    }
                                }
                            },
                            {
                                text: t('popup.resource.clearAssetCache'),
                                onClick: async (optCtx) => {
                                    if (!confirm(t('popup.resource.confirmClearAsset'))) return;
                                    try {
                                        const count = await clearStoreKeys(key => typeof key === 'string' && (key.startsWith('sfx_cache_') || key.startsWith('img_cache_')));
                                        await renderContent(container);
                                        optCtx.close();
                                        simpleToast({ content: t('popup.resource.toastClearAsset', { count }), type: "success" });
                                    } catch (e) {
                                        console.error("清除素材失敗:", e);
                                    }
                                }
                            },
                            {
                                text: t('popup.close'),
                                hideOnClick: true
                            }
                        ]
                    });
                }
            },
            {
                text: t('popup.close'),
                hideOnClick: true
            }
        ]
    });
}
