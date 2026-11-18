import { openDB, idbGet } from '../indexDB.js';
import { popupWindow, formatSize, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { clearAcceptLog } from '../core/legalVersionManager.js';

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

        // 頂部統計摘要卡片（對齊設定頁視覺風格）
        const summaryCard = document.createElement('div');
        summaryCard.className = 'resource-summary-card';

        const summaryLeft = document.createElement('div');
        summaryLeft.className = 'resource-summary-meta';

        const summaryLabel = document.createElement('span');
        summaryLabel.className = 'resource-summary-label';
        summaryLabel.textContent = t('popup.resource.totalUsageLabel');

        const summaryValue = document.createElement('span');
        summaryValue.className = 'resource-summary-value';
        summaryValue.textContent = formatSize(totalSize);

        summaryLeft.append(summaryLabel, summaryValue);

        const summaryBadge = document.createElement('span');
        summaryBadge.className = 'popup-setting-kb-badge is-scope resource-summary-badge';
        summaryBadge.textContent = t('popup.resource.cachedItemsCount', { count: items.length });

        summaryCard.append(summaryLeft, summaryBadge);
        container.appendChild(summaryCard);

        // 詳細鍵值列表
        const listWrapper = document.createElement('div');
        listWrapper.className = 'popup-setting-kb-list resource-item-list';

        if (items.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'popup-setting-kb-no-results';
            emptyEl.textContent = t('popup.resource.emptyCache');
            listWrapper.appendChild(emptyEl);
        } else {
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = 'popup-setting-kb-row resource-item-row';

                const nameEl = document.createElement('span');
                nameEl.className = 'resource-item-key';
                nameEl.title = item.key;
                nameEl.textContent = item.key;

                const sizeEl = document.createElement('span');
                sizeEl.className = 'popup-setting-kb-kbd resource-item-size';
                sizeEl.textContent = formatSize(item.size);

                row.append(nameEl, sizeEl);
                listWrapper.appendChild(row);
            });
        }

        container.appendChild(listWrapper);
    };

    const container = document.createElement('div');
    container.className = 'resource-manager-modal';

    await renderContent(container);

    function promptReloadAfterClear() {
        popupWindow({
            title: t('popup.resource.cleanCompleteTitle') || '清理完成',
            content: t('popup.resource.cleanCompleteReloadNotice') || '清理完成，請重新整理以完成清理。',
            width: 380,
            unclosable: true,
            mode: 'dialog',
            buttons: [
                {
                    text: t('popup.resource.reloadButton') || '重新整理',
                    onClick: () => {
                        window.location.reload();
                    }
                }
            ]
        });
    }

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
                                        clearAcceptLog();
                                        try {
                                            localStorage.removeItem('simai_lastProjectId');
                                        } catch {}
                                        await renderContent(container);
                                        optCtx.close();
                                        promptReloadAfterClear();
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
                                        await clearStoreKeys(key => typeof key === 'string' && key.startsWith('simai_'));
                                        await renderContent(container);
                                        optCtx.close();
                                        promptReloadAfterClear();
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
                                        await clearStoreKeys(key => typeof key === 'string' && (key.startsWith('sfx_cache_') || key.startsWith('img_cache_')));
                                        await renderContent(container);
                                        optCtx.close();
                                        promptReloadAfterClear();
                                    } catch (e) {
                                        console.error("清除素材失敗:", e);
                                    }
                                }
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
