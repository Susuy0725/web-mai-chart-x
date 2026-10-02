import { popupWindow, simpleToast } from '../helper.js';
import { projectList, idbSet, openDB } from '../indexDB.js';

const LEGACY_MIGRATE_URL = 'https://susuy0725.github.io/web-mai-chart-migrate/';
const DISMISSED_KEY = 'wmc_migration_dismissed';

let activeMigrationPopup = null;

// 監聽跨分頁廣播（當 migrate-receiver 完成遷移時自動通知本頁面）
try {
    const channel = new BroadcastChannel('wmc_channel');
    channel.onmessage = (event) => {
        if (event.data?.type === 'wmc:project-changed' && event.data?.reason === 'migration_complete') {
            if (activeMigrationPopup) {
                activeMigrationPopup.close();
                activeMigrationPopup = null;
            }
            simpleToast({
                content: '🎉 舊站譜面已成功遷移至此新網域！',
                type: 'success',
                timeout: 3500
            });
            window.dispatchEvent(new CustomEvent('wmc:project-changed'));
        }
    };
} catch (e) {
    // 瀏覽器不支援 BroadcastChannel 則靜默忽略
}

/**
 * 開啟舊版網域遷移引導彈窗
 * @param {Object} [options]
 * @param {boolean} [options.manual=false] 是否由使用者手動點擊觸發（手動開啟時不顯示「不再提醒」核取方塊）
 * @param {Function} [options.onMigrated] 遷移完成後回呼
 */
export function openMigrationModal(options = {}) {
    const { manual = false, onMigrated } = options;

    if (activeMigrationPopup) {
        return activeMigrationPopup;
    }

    const container = document.createElement('div');
    container.className = 'wmc-migration-modal';
    container.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 4px 2px;
        color: #e0e0e0;
        font-size: 13px;
        line-height: 1.6;
    `;

    // 說明資訊區塊
    const infoBox = document.createElement('div');
    infoBox.style.cssText = `
        background: rgba(0, 210, 255, 0.06);
        border: 1px solid rgba(0, 210, 255, 0.25);
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    `;

    infoBox.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: #00d2ff; font-size: 14px;">
            <span class="material-symbols-outlined" style="font-size: 20px;" translate="no">domain</span>
            <span>網域變更與瀏覽器資料說明</span>
        </div>
        <div style="color: #cbd5e1; font-size: 13px;">
            Web mai Chart X 現已全面升級並遷移至獨立網域 <strong style="color: #fff;">chart.tri-dent.cc</strong>。<br>
            受瀏覽器安全（同源政策）機制限制，您過去在舊網域（<strong>susuy0725.github.io</strong>）所創作儲存的譜面與音訊，依然妥善保存在舊網域的儲存區中。
        </div>
    `;

    // 搬家步驟指引
    const stepsBox = document.createElement('div');
    stepsBox.style.cssText = `
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    stepsBox.innerHTML = `
        <div style="font-weight: 600; color: #f1f5f9; font-size: 13px; display: flex; align-items: center; gap: 6px;">
            <span class="material-symbols-outlined" style="font-size: 18px; color: #38bdf8;" translate="no">checklist</span>
            <span>一鍵搬家流程 (約需 10 秒)：</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 4px;">
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="background: #0284c7; color: #fff; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; margin-top: 2px;">1</span>
                <span>點擊下方按鈕開啟舊站搬家專用工具（在新分頁載入舊網域資料庫）。</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="background: #0284c7; color: #fff; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; margin-top: 2px;">2</span>
                <span>在開啟的舊站頁面中，點擊<strong>「🚀 開始一鍵直連遷移」</strong>。</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <span style="background: #0284c7; color: #fff; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; margin-top: 2px;">3</span>
                <span>系統將透過安全通道將所有專案、音訊與設定直接寫入新網域！</span>
            </div>
        </div>
    `;

    // 備用檔案上傳 input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    fileInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        simpleToast({ content: '正在還原備份資料...', type: 'info' });
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed.items || !Array.isArray(parsed.items)) {
                throw new Error('無效的備份檔案格式');
            }

            const db = await openDB();
            const tx = db.transaction('editorState', 'readwrite');
            const store = tx.objectStore('editorState');

            for (const it of parsed.items) {
                let val = it.data;
                if (it.isBlob) {
                    val = base64ToBlob(it.data, it.mimeType);
                } else if (it.isArrayBuffer) {
                    val = base64ToArrayBuffer(it.data);
                }
                store.put(val, it.key);
            }

            await new Promise((res, rej) => {
                tx.oncomplete = res;
                tx.onerror = () => rej(tx.error);
            });

            localStorage.setItem(DISMISSED_KEY, 'true');
            simpleToast({ content: '🎉 備份檔已成功還原至本站！', type: 'success', timeout: 2500 });
            window.dispatchEvent(new CustomEvent('wmc:project-changed'));
            if (typeof onMigrated === 'function') onMigrated();
            if (activeMigrationPopup) activeMigrationPopup.close();
        } catch (err) {
            console.error('還原失敗:', err);
            simpleToast({ content: `還原失敗: ${err.message}`, type: 'error' });
        } finally {
            fileInput.value = '';
        }
    };

    container.appendChild(infoBox);
    container.appendChild(stepsBox);
    container.appendChild(fileInput);

    activeMigrationPopup = popupWindow({
        title: "舊版網域譜面遷移精靈",
        customContent: container,
        width: 580,
        maxWidth: 640,
        onClose: () => {
            activeMigrationPopup = null;
        },
        buttons: [
            {
                text: "🚀 開啟舊站搬家工具",
                onClick: () => {
                    window.open(LEGACY_MIGRATE_URL, '_blank');
                    simpleToast({
                        content: '已在新分頁開啟舊站搬家工具，請在該頁面點擊「開始一鍵直連遷移」！',
                        type: 'info',
                        timeout: 5000
                    });
                }
            },
            {
                text: "📦 匯入備份檔 (.json)",
                onClick: () => {
                    fileInput.click();
                }
            },
            {
                text: manual ? "關閉" : "我是新用戶 / 不再提醒",
                onClick: () => {
                    localStorage.setItem(DISMISSED_KEY, 'true');
                    activeMigrationPopup?.close();
                }
            }
        ]
    });

    return activeMigrationPopup;
}

/**
 * 啟動時自動檢測是否需要提醒舊用戶遷移
 * @param {Object} [options]
 */
export async function checkAndPromptMigration(options = {}) {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const forcePrompt = urlParams.get('from') === 'legacy' || urlParams.get('migrate') === 'prompt' || urlParams.get('migrate') === '1';

        // 如果網址強制帶有參數，直接開啟
        if (forcePrompt) {
            setTimeout(() => openMigrationModal(options), 400);
            return;
        }

        // 若已標記為不再提醒，則跳過主動彈窗
        const isDismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
        if (isDismissed) {
            return;
        }

        // 偵測是否由舊網域導向過來
        const isReferredFromLegacy = typeof document.referrer === 'string' && document.referrer.includes('susuy0725.github.io');

        // 檢測當前專案是否為乾淨狀態 (只有 0 或 1 個未命名專案)
        const projects = await projectList();
        const isFreshInstall = projects.length <= 1;

        if (isReferredFromLegacy || isFreshInstall) {
            // 延遲一點點時間，讓編輯器主畫面渲染完畢後再優雅彈出
            setTimeout(() => {
                // 再次檢查是否有被其他操作關閉
                if (localStorage.getItem(DISMISSED_KEY) !== 'true') {
                    openMigrationModal(options);
                }
            }, 600);
        }
    } catch (e) {
        console.warn('[Migration] 自動檢查遷移失敗:', e);
    }
}

// 輔助工具：Base64 轉 Blob
function base64ToBlob(dataUrl, mime = 'application/octet-stream') {
    const byteString = atob(dataUrl.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
}

// 輔助工具：Base64 轉 ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
