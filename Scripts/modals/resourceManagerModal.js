import { openDB, idbGet } from '../indexDB.js';
import { popupWindow, formatSize } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 開啟資源與儲存空間管理彈窗
 */
export async function openResourceManager() {
    async function getSize() {
        const db = await openDB();
        const transaction = db.transaction("editorState", "readonly");
        const store = transaction.objectStore("editorState");

        let details = "IndexedDB 儲存狀態：\n\n";
        let totalSize = 0;

        const keys = await new Promise(res => {
            const req = store.getAllKeys();
            req.onsuccess = () => res(req.result);
        });

        for (const key of keys) {
            const data = await idbGet(key);
            let size = 0;
            if (data instanceof Blob) size = data.size;
            else if (data instanceof ArrayBuffer) size = data.byteLength;
            else size = JSON.stringify(data).length * 2;

            totalSize += size;
            details += `• ${key}: ${formatSize(size)}\n`;
        }
        details += `\n總計使用量: ${formatSize(totalSize)}`;

        return details;
    }

    popupWindow({
        title: t('popup.resource.title'),
        content: await getSize(),
        buttons: [
            {
                text: "清除緩存",
                onClick: (manageCtx) => {
                    const refreshManage = async () => {
                        manageCtx.setContent(await getSize());
                    };

                    popupWindow({
                        title: "清除緩存",
                        width: "max-content",
                        buttons: [
                            {
                                text: "清除所有資料",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除 IndexedDB 中的所有資料嗎？此操作無法復原！");
                                    if (!confirmed) return;
                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");
                                    store.clear();
                                    await refreshManage();
                                    try {
                                        await transaction.complete;
                                        console.log("已清除 IndexedDB 中的所有資料");
                                    } catch (e) {
                                        console.error("清除 IndexedDB 資料失敗:", e);
                                    }
                                }
                            },
                            {
                                text: "清除譜面暫存",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除所有譜面資料嗎？音效與圖片快取將會保留。");
                                    if (!confirmed) return;

                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");

                                    const getKeysRequest = store.getAllKeys();

                                    getKeysRequest.onsuccess = async () => {
                                        const allKeys = getKeysRequest.result;
                                        let deleteCount = 0;

                                        allKeys.forEach(key => {
                                            if (typeof key === 'string' && key.startsWith('simai_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                        });
                                        await refreshManage();

                                        transaction.oncomplete = () => {
                                            console.log(`[IDB] 已成功清理 ${deleteCount} 項譜面資料`);
                                        };
                                    };

                                    transaction.onerror = async (e) => {
                                        console.error("清除特定資料失敗:", e);
                                        await refreshManage();
                                    };
                                }
                            },
                            {
                                text: "清除素材暫存",
                                onClick: async () => {
                                    const confirmed = confirm("確定要清除所有音效與圖片快取資料嗎？譜面資料將會保留。");
                                    if (!confirmed) return;

                                    const db = await openDB();
                                    const transaction = db.transaction("editorState", "readwrite");
                                    const store = transaction.objectStore("editorState");

                                    const getKeysRequest = store.getAllKeys();

                                    getKeysRequest.onsuccess = async () => {
                                        const allKeys = getKeysRequest.result;
                                        let deleteCount = 0;

                                        allKeys.forEach(key => {
                                            if (typeof key === 'string' && key.startsWith('sfx_cache_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                            if (typeof key === 'string' && key.startsWith('img_cache_')) {
                                                store.delete(key);
                                                deleteCount++;
                                            }
                                        });
                                        await refreshManage();

                                        transaction.oncomplete = () => {
                                            console.log(`[IDB] 已成功清理 ${deleteCount} 項素材快取資料`);
                                        };
                                    };

                                    transaction.onerror = async (e) => {
                                        console.error("清除特定資料失敗:", e);
                                        await refreshManage();
                                    };
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
