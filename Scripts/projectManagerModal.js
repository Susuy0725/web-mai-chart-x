/**
 * 專案總管通用彈窗模組 (Project Manager Modal)
 * 供編輯器 (Scripts/main.js) 與播放器 (_play/main.js) 共同使用
 * 採用 Material Design 原生風格與原生 HTML+CSS
 */

import {
    projectList,
    projectCreate,
    projectDelete,
    projectRename,
    projectUpdateName,
    idbGetProject,
    idbSetProject,
    idbSet,
    migrateFromLegacy
} from './indexDB.js';
import * as googleDriveService from './drive/googleDriveService.js';
import { createGoogleSignInButton } from './drive/googleButton.js';
import { showTransferProgressModal } from './drive/cloudProjectManager.js';
import { t } from './i18n.js';
import { getSimaiDataString } from './helper.js';

/**
 * 更新本地專案清單中的雲端關聯資訊
 */
async function projectUpdateCloudMeta(projectId, { cloudFileId, cloudFileName, cloudSyncedAt = Date.now() }) {
    const list = await projectList();
    const project = list.find(p => p.id === projectId);
    if (project) {
        if (cloudFileId !== undefined) project.cloudFileId = cloudFileId;
        if (cloudFileName !== undefined) project.cloudFileName = cloudFileName;
        if (cloudSyncedAt !== undefined) project.cloudSyncedAt = cloudSyncedAt;
        await idbSet('__project_list__', list);
    }
}

/**
 * 安全呼叫：列出專案壓縮包 (具備自動備援)
 */
async function safeListProjectZips() {
    if (typeof googleDriveService.listProjectZips === 'function') {
        return await googleDriveService.listProjectZips();
    }
    const token = sessionStorage.getItem('gdrive_token');
    if (!token) throw new Error('尚未登入 Google Drive');
    const rootId = await googleDriveService.getAppRootFolder();
    const q = `'${rootId}' in parents and (name contains '.zip' or mimeType = 'application/zip' or mimeType = 'application/x-zip-compressed') and trashed = false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime,createdTime,size)&orderBy=modifiedTime desc`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const d = await res.json();
    return d.files || [];
}

/**
 * 安全呼叫：上傳專案壓縮包 (具備自動備援)
 */
async function safeUploadProjectZip(zipBlob, fileName, existingFileId = null, onProgress = null) {
    if (typeof googleDriveService.uploadProjectZip === 'function') {
        return await googleDriveService.uploadProjectZip(zipBlob, fileName, existingFileId, onProgress);
    }
    const token = sessionStorage.getItem('gdrive_token');
    if (!token) throw new Error('尚未登入 Google Drive');
    const safeName = fileName.endsWith('.zip') ? fileName : `${fileName}.zip`;
    let fileId = existingFileId;
    if (!fileId) {
        const rootId = await googleDriveService.getAppRootFolder();
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: safeName, parents: [rootId], mimeType: 'application/zip' })
        });
        const created = await createRes.json();
        fileId = created.id;
    }
    const upRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/zip', Authorization: `Bearer ${token}` },
        body: zipBlob
    });
    return await upRes.json();
}

/**
 * 安全呼叫：下載專案壓縮包 (具備自動備援)
 */
async function safeDownloadProjectZip(fileId, onProgress = null) {
    if (typeof googleDriveService.downloadProjectZip === 'function') {
        return await googleDriveService.downloadProjectZip(fileId, onProgress);
    }
    const token = sessionStorage.getItem('gdrive_token');
    if (!token) throw new Error('尚未登入 Google Drive');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return await res.blob();
}

/**
 * 安全呼叫：重新命名專案壓縮包 (具備自動備援)
 */
async function safeRenameProjectZip(fileId, newName) {
    if (typeof googleDriveService.renameProjectZip === 'function') {
        return await googleDriveService.renameProjectZip(fileId, newName);
    }
    const token = sessionStorage.getItem('gdrive_token');
    if (!token) throw new Error('尚未登入 Google Drive');
    const safeName = newName.endsWith('.zip') ? newName : `${newName}.zip`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: safeName })
    });
    return await res.json();
}

/**
 * 安全呼叫：刪除專案壓縮包 (具備自動備援)
 */
async function safeDeleteProjectZip(fileId) {
    if (typeof googleDriveService.deleteProjectZip === 'function') {
        return await googleDriveService.deleteProjectZip(fileId);
    }
    const token = sessionStorage.getItem('gdrive_token');
    if (!token) throw new Error('尚未登入 Google Drive');
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ trashed: true })
    });
    return await res.json();
}

/**
 * 格式化最後修改時間為 YY/MM/DD HH:MM
 */
function formatLastEdit(timestamp) {
    if (!timestamp) return 'Last edit: --/--/-- --:--';
    const d = new Date(timestamp);
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `Last edit:${yy}/${mm}/${dd} ${hh}:${min}`;
}

/**
 * 格式化檔案大小
 */
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    const num = parseInt(bytes, 10);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 將指定本地專案打包為 ZIP Blob
 */
async function packProjectToZipBlob(projectId, projectName) {
    if (typeof JSZip === 'undefined') {
        throw new Error('找不到 JSZip 程式庫');
    }
    const zip = new JSZip();

    const [savedMaiData, savedBgm, savedBg, savedBgVideo] = await Promise.all([
        idbGetProject(projectId, 'maidata'),
        idbGetProject(projectId, 'resource_bgm'),
        idbGetProject(projectId, 'background_image'),
        idbGetProject(projectId, 'background_video')
    ]);

    let maidataContent = '';
    if (typeof savedMaiData === 'string') {
        maidataContent = savedMaiData;
    } else if (savedMaiData && typeof savedMaiData === 'object') {
        maidataContent = typeof getSimaiDataString === 'function' ? getSimaiDataString(savedMaiData) : '';
    }

    if (maidataContent) {
        zip.file('maidata.txt', maidataContent);
    }

    if (savedBgm instanceof Blob) {
        const ext = (savedBgm.name?.split('.').pop() || 'mp3').toLowerCase();
        zip.file(`track.${ext}`, savedBgm);
    }

    if (savedBg instanceof Blob) {
        const ext = (savedBg.name?.split('.').pop() || 'png').toLowerCase();
        zip.file(`bg.${ext}`, savedBg);
    }

    if (savedBgVideo instanceof Blob) {
        const ext = (savedBgVideo.name?.split('.').pop() || 'mp4').toLowerCase();
        zip.file(`pv.${ext}`, savedBgVideo);
    }

    return await zip.generateAsync({ type: 'blob' });
}

/**
 * 解壓縮 ZIP 並寫入 IndexedDB 專案
 */
async function extractZipToProject(zipFileOrBlob, targetProjectId = null, projectName = null) {
    if (typeof JSZip === 'undefined') {
        throw new Error('找不到 JSZip 程式庫');
    }

    const zip = await JSZip.loadAsync(zipFileOrBlob);
    let projectId = targetProjectId;
    if (!projectId) {
        projectId = await projectCreate(projectName || '未命名專案');
    }

    for (const relativePath in zip.files) {
        if (!Object.prototype.hasOwnProperty.call(zip.files, relativePath)) continue;
        const entry = zip.files[relativePath];
        if (entry.dir) continue;

        // Zip Slip 安全防護：過濾路徑遍歷
        if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
            console.warn(`[Security] 忽略不安全的壓縮檔路徑: ${relativePath}`);
            continue;
        }

        const baseName = relativePath.replace(/\\/g, '/').split('/').pop();
        const lowerName = baseName.toLowerCase();
        const ext = (baseName.split('.').pop() || '').toLowerCase();

        if (lowerName === 'maidata.txt') {
            const text = await entry.async('string');
            await idbSetProject(projectId, 'maidata', text);
            // 嘗試解析標題自動命名
            const match = text.match(/&title=([^\r\n&]+)/);
            if (match && match[1] && match[1].trim()) {
                await projectUpdateName(projectId, match[1].trim());
            }
        } else if (lowerName.startsWith('track.') || ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext)) {
            const blob = await entry.async('blob');
            await idbSetProject(projectId, 'resource_bgm', new File([blob], baseName, { type: blob.type || 'audio/mp3' }));
        } else if (lowerName.startsWith('bg.') || ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
            const blob = await entry.async('blob');
            await idbSetProject(projectId, 'background_image', new File([blob], baseName, { type: blob.type || 'image/png' }));
        } else if (lowerName.startsWith('pv.') || ['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
            const blob = await entry.async('blob');
            await idbSetProject(projectId, 'background_video', new File([blob], baseName, { type: blob.type || 'video/mp4' }));
        }
    }

    return projectId;
}

/**
 * 開啟專案總管統一彈窗
 */
export async function openProjectManagerModal({
    currentProjectId = null,
    onLoadProject = null,
    onDeleteCurrentProject = null,
    onImportFolder = null,
    onImportZip = null,
    openSettings = null,
    simpleToast = null,
    popupWindow = null,
    assetPrefix = null
} = {}) {
    const toast = (msg, type = 'info', timeout = 1500) => {
        if (typeof simpleToast === 'function') {
            simpleToast({ content: msg, type, timeout });
        } else {
            console.log(`[Toast ${type}]`, msg);
        }
    };

    const isPlayMode = window.location.pathname.includes('_play');
    const actualAssetPrefix = assetPrefix ?? (isPlayMode ? '../' : '');
    const defaultCoverUrl = `${actualAssetPrefix}Skin/no_image.png`;

    let activeTab = 'local';
    let popupCtx = null;

    // 建立頂層容器
    const root = document.createElement('div');
    root.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        box-sizing: border-box;
        color: #eee;
        font-family: inherit;
    `;

    // 標籤列 (Tab Bar)
    const tabBar = document.createElement('div');
    tabBar.style.cssText = `
        display: flex;
        gap: 8px;
        border-bottom: 1px solid #333333;
        padding-bottom: 0;
    `;

    const createTabBtn = (label, iconName, tabKey) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: transparent;
            border: none;
            font-size: 13px;
            padding: 8px 18px;
            cursor: pointer;
            transition: color 0.15s ease, border-color 0.15s ease;
            user-select: none;
            outline: none;
            margin-bottom: -1px;
            color: #888888;
            border-bottom: 2px solid transparent;
        `;
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.setAttribute('translate', 'no');
        icon.textContent = iconName;
        icon.style.cssText = 'font-size: 18px; vertical-align: middle;';
        btn.appendChild(icon);

        const textSpan = document.createElement('span');
        textSpan.textContent = label;
        btn.appendChild(textSpan);

        btn.onclick = () => switchTab(tabKey);
        return btn;
    };

    const localTabBtn = createTabBtn(t('popup.projectManager.tabLocal') || '本地專案', 'folder', 'local');
    const cloudTabBtn = createTabBtn(t('popup.projectManager.tabCloud') || '雲端專案', 'cloud', 'cloud');

    tabBar.appendChild(localTabBtn);
    tabBar.appendChild(cloudTabBtn);
    root.appendChild(tabBar);

    // 滑鼠按住拖動滾動支援（平滑上下滑動，徹底取代誤觸原生圖片拖影的果凍感）
    const enableDragToScroll = (container) => {
        let isDown = false;
        let startY = 0;
        let initialScrollTop = 0;
        let hasMoved = false;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            isDown = true;
            hasMoved = false;
            startY = e.clientY;
            initialScrollTop = container.scrollTop;
        };

        const onMouseMove = (e) => {
            if (!isDown) return;
            const dy = e.clientY - startY;
            if (!hasMoved && Math.abs(dy) > 5) {
                hasMoved = true;
            }
            if (hasMoved) {
                container.scrollTop = initialScrollTop - dy;
            }
        };

        const onMouseUp = () => {
            if (!isDown) return;
            isDown = false;
            if (hasMoved) {
                setTimeout(() => {
                    hasMoved = false;
                }, 50);
            }
        };

        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        const onClickCapture = (e) => {
            if (hasMoved) {
                e.stopPropagation();
                e.preventDefault();
            }
        };
        container.addEventListener('click', onClickCapture, true);

        return () => {
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            container.removeEventListener('click', onClickCapture, true);
        };
    };

    // 本地面板：卡片式網格 (響應式自動適應每排數量，空間不足自動減少，防止卡片縱向被拉長)
    const localPane = document.createElement('div');
    localPane.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
        align-items: start;
        grid-auto-rows: max-content;
        gap: 10px;
        height: 310px;
        min-height: 310px;
        max-height: 310px;
        overflow-y: auto;
        overscroll-behavior: none;
        padding: 4px;
        scrollbar-width: thin;
        scrollbar-color: #555 transparent;
        box-sizing: border-box;
        user-select: none;
        -webkit-user-select: none;
    `;

    // 雲端面板：列表式 (固定高度 310px 與本地面板一致)
    const cloudPane = document.createElement('div');
    cloudPane.style.cssText = `
        display: none;
        flex-direction: column;
        height: 310px;
        min-height: 310px;
        max-height: 310px;
        overflow-y: auto;
        overscroll-behavior: none;
        scrollbar-width: thin;
        scrollbar-color: #555 transparent;
        box-sizing: border-box;
        gap: 8px;
        padding: 4px;
        user-select: none;
        -webkit-user-select: none;
    `;

    const cleanupLocalDrag = enableDragToScroll(localPane);
    const cleanupCloudDrag = enableDragToScroll(cloudPane);

    root.appendChild(localPane);
    root.appendChild(cloudPane);

    // -------------------------------------------------------------
    // 本地專案卡片渲染
    // -------------------------------------------------------------
    const renderLocalCards = async () => {
        localPane.innerHTML = '';
        let list = await projectList();

        if (list.length === 0) {
            const migratedId = await migrateFromLegacy();
            if (migratedId) {
                list = await projectList();
            }
        }

        if (list.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = `
                grid-column: 1 / -1;
                text-align: center;
                color: #888;
                padding: 48px 16px;
                font-size: 13px;
            `;
            emptyEl.textContent = '尚無本地專案，可透過下方按鈕新建或匯入專案。';
            localPane.appendChild(emptyEl);
            return;
        }

        // 按更新時間降冪排列
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        for (const proj of list) {
            const isCurrent = proj.id === currentProjectId;
            const card = document.createElement('div');
            card.style.cssText = `
                background: #1e1e1e;
                border: 1px solid ${isCurrent ? '#4a90e2' : '#333333'};
                border-radius: 8px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 2px 8px rgba(0,0,0,0.35);
                transition: border-color 0.15s ease;
                box-sizing: border-box;
                height: fit-content;
                min-width: 0;
                user-select: none;
                -webkit-user-select: none;
            `;

            // 頂部封面圖容器
            const coverContainer = document.createElement('div');
            coverContainer.style.cssText = `
                position: relative;
                width: 100%;
                aspect-ratio: 1 / 1;
                background: #141414;
                overflow: hidden;
                user-select: none;
                -webkit-user-select: none;
            `;

            const imgEl = document.createElement('img');
            imgEl.alt = proj.name || 'Cover';
            imgEl.draggable = false;
            imgEl.setAttribute('draggable', 'false');
            imgEl.style.cssText = `
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
                user-select: none;
                -webkit-user-select: none;
                -webkit-user-drag: none;
                pointer-events: none;
            `;
            imgEl.src = defaultCoverUrl;

            // 異步讀取封面
            idbGetProject(proj.id, 'background_image').then(bgFile => {
                if (bgFile instanceof Blob) {
                    try {
                        const url = URL.createObjectURL(bgFile);
                        imgEl.src = url;
                    } catch (_) {
                        imgEl.src = defaultCoverUrl;
                    }
                }
            }).catch(() => {
                imgEl.src = defaultCoverUrl;
            });

            coverContainer.appendChild(imgEl);

            if (isCurrent) {
                const badge = document.createElement('div');
                badge.style.cssText = `
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    background: #1e88e5;
                    color: #fff;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 4px;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                `;
                badge.textContent = '使用中';
                coverContainer.appendChild(badge);
            }

            card.appendChild(coverContainer);

            // 下方資訊區塊 (維持原本比例，緊湊排列不拉伸)
            const body = document.createElement('div');
            body.style.cssText = `
                padding: 8px 8px 6px 8px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                box-sizing: border-box;
            `;

            const titleRow = document.createElement('div');
            const titleSpan = document.createElement('div');
            titleSpan.textContent = proj.name || '未命名專案';
            titleSpan.title = proj.name || '未命名專案';
            titleSpan.style.cssText = `
                font-size: 13px;
                font-weight: 700;
                color: ${isCurrent ? '#6ba4f8' : '#ffffff'};
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                letter-spacing: 0.2px;
            `;
            titleRow.appendChild(titleSpan);

            const lastEditSpan = document.createElement('div');
            lastEditSpan.textContent = formatLastEdit(proj.updatedAt || proj.createdAt);
            lastEditSpan.style.cssText = `
                font-size: 10px;
                color: #888888;
                margin-top: 2px;
                font-family: inherit;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            `;
            titleRow.appendChild(lastEditSpan);
            body.appendChild(titleRow);

            // 右下角按鈕列（從右至左為刪除、上傳、重命名、開啟專案 => 由左至右依序排入開啟專案、重命名、上傳、刪除）
            const btnRow = document.createElement('div');
            btnRow.style.cssText = `
                display: flex;
                justify-content: flex-end;
                align-items: center;
                gap: 4px;
                margin-top: 6px;
            `;

            const makeIconButton = (iconName, tooltip, onClick, hoverColor = '#4a90e2') => {
                const b = document.createElement('button');
                b.type = 'button';
                b.title = tooltip;
                b.style.cssText = `
                    background: transparent;
                    border: none;
                    color: #b0b0b0;
                    padding: 3px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: color 0.15s ease, background 0.15s ease;
                `;
                const ic = document.createElement('span');
                ic.className = 'material-symbols-outlined';
                ic.setAttribute('translate', 'no');
                ic.textContent = iconName;
                ic.style.cssText = 'font-size: 18px;';
                b.appendChild(ic);

                b.onmouseenter = () => {
                    b.style.color = hoverColor;
                    b.style.background = 'rgba(255,255,255,0.06)';
                };
                b.onmouseleave = () => {
                    b.style.color = '#b0b0b0';
                    b.style.background = 'transparent';
                };
                b.onclick = (e) => {
                    e.stopPropagation();
                    onClick();
                };
                return b;
            };

            // 1. 開啟專案按鈕
            const openBtn = makeIconButton('file_open', '開啟專案', async () => {
                if (typeof onLoadProject === 'function') {
                    await onLoadProject(proj.id);
                    toast(`已載入專案：${proj.name || '未命名'}`, 'success', 1500);
                    if (popupCtx) popupCtx.close();
                }
            }, '#4caf50');
            btnRow.appendChild(openBtn);

            // 2. 重命名按鈕
            const renameBtn = makeIconButton('edit', '重新命名', async () => {
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    toast('專案名稱已更新', 'info', 1200);
                    renderLocalCards();
                }
            }, '#4a90e2');
            btnRow.appendChild(renameBtn);

            // 3. 上傳至雲端按鈕
            const uploadBtn = makeIconButton('cloud_upload', '上傳至雲端 (.zip)', async () => {
                if (!googleDriveService.isLoggedIn()) {
                    toast('請先在雲端標籤頁或設定中登入 Google 帳號', 'warning', 2500);
                    switchTab('cloud');
                    return;
                }

                let targetFileId = proj.cloudFileId || null;
                if (targetFileId) {
                    const confirmOverwrite = confirm(`此專案已關聯雲端壓縮檔案。\n\n按「確定」：覆蓋既有雲端檔案\n按「取消」：另存為新的雲端檔案`);
                    if (!confirmOverwrite) {
                        targetFileId = null;
                    }
                }

                const progressModal = showTransferProgressModal({
                    title: '正在打包並上傳專案...',
                    icon: 'cloud_upload'
                });

                try {
                    progressModal.update({ title: '正在打包專案為 ZIP...', percent: 20 });
                    const zipBlob = await packProjectToZipBlob(proj.id, proj.name || 'project');

                    progressModal.update({ title: '正在上傳雲端壓縮包...', percent: 50 });
                    const safeName = (proj.name || 'project').trim();
                    const uploaded = await safeUploadProjectZip(
                        zipBlob,
                        safeName,
                        targetFileId,
                        ({ file, percent }) => {
                            progressModal.update({ title: '正在傳輸雲端檔案...', file, percent });
                        }
                    );

                    await projectUpdateCloudMeta(proj.id, {
                        cloudFileId: uploaded.id,
                        cloudFileName: uploaded.name,
                        cloudSyncedAt: Date.now()
                    });

                    progressModal.update({
                        title: '雲端上傳完成',
                        percent: 100,
                        isDone: true
                    });
                    toast(`專案已成功儲存至雲端壓縮包：${uploaded.name}`, 'success', 2000);
                    renderLocalCards();
                } catch (err) {
                    console.error('[ProjectManager] 上傳雲端失敗:', err);
                    progressModal.close();
                    toast(`上傳失敗：${err.message || err}`, 'error', 3000);
                }
            }, '#29b6f6');
            btnRow.appendChild(uploadBtn);

            // 4. 刪除按鈕
            const deleteBtn = makeIconButton('delete', '刪除專案', async () => {
                const isCurrentlyActive = proj.id === currentProjectId;
                const confirmMsg = isCurrentlyActive
                    ? `確定要刪除專案「${proj.name || '未命名'}」嗎？\n此專案正在編輯中，刪除後將會清空編輯器內容且無法復原！`
                    : `確定要刪除專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`;

                if (!confirm(confirmMsg)) {
                    return;
                }

                await projectDelete(proj.id);
                toast('已刪除專案', 'success', 1200);

                if (isCurrentlyActive) {
                    currentProjectId = null;
                    if (typeof onDeleteCurrentProject === 'function') {
                        try {
                            await onDeleteCurrentProject(proj.id);
                        } catch (e) {
                            console.error('[ProjectManager] 清除當前專案狀態失敗:', e);
                        }
                    }
                }

                renderLocalCards();
            }, '#ef5350');
            btnRow.appendChild(deleteBtn);

            body.appendChild(btnRow);
            card.appendChild(body);
            localPane.appendChild(card);
        }
    };

    // -------------------------------------------------------------
    // 雲端專案清單渲染
    // -------------------------------------------------------------
    const renderCloudList = async () => {
        cloudPane.innerHTML = '';
        const loggedIn = googleDriveService.isLoggedIn();

        if (!loggedIn) {
            cloudPane.style.display = 'flex';
            cloudPane.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 24px; background:#1a1a1a; border:1px dashed #383838; border-radius:8px; text-align:center; gap:12px;">
                    <span class="material-symbols-outlined" style="font-size:48px; color:#4a90e2; opacity:0.85;" translate="no">cloud_queue</span>
                    <div style="font-size:15px; font-weight:600; color:#ffffff;">${t('popup.projectManager.cloudNotLoggedIn') || '尚未登入 Google Drive'}</div>
                    <div style="font-size:12px; color:#888888; max-width:320px; line-height:1.5;">${t('popup.projectManager.cloudNotLoggedInDesc') || '請登入 Google 帳號以檢視與編輯雲端專案。'}</div>
                    <div id="cloudBtnRow" style="display:flex; align-items:center; gap:12px; margin-top:8px;"></div>
                </div>
            `;

            const btnRow = cloudPane.querySelector('#cloudBtnRow');

            const googleBtn = createGoogleSignInButton({
                theme: 'dark',
                size: 'medium',
                text: t('settings.gdrive.loginBtn') || '使用 Google 帳戶登入',
                onClick: async () => {
                    try {
                        googleBtn.setLoading(true, t('settings.gdrive.loggingIn') || '正在登入...');
                        await googleDriveService.login();
                        toast(t('settings.gdrive.loginSuccess') || 'Google Drive 登入成功', 'success', 1500);
                        renderCloudList();
                    } catch (err) {
                        toast(t('settings.gdrive.loginError', { error: err.message || err }), 'error', 3000);
                        renderCloudList();
                    }
                }
            });
            if (btnRow) {
                btnRow.appendChild(googleBtn);
            }
            return;
        }

        // 已登入狀態
        const user = googleDriveService.getCurrentUser();
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #222222;
            border: 1px solid #383838;
            border-radius: 6px;
            font-size: 12px;
        `;

        const userInfo = document.createElement('span');
        userInfo.style.color = '#888';
        userInfo.textContent = `Google 帳號: ${user?.email || user?.name || '已連線'}`;

        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'popup-button';
        refreshBtn.textContent = '重新整理';
        refreshBtn.style.cssText = 'padding: 4px 10px; font-size: 11px; cursor: pointer;';
        refreshBtn.onclick = () => renderCloudList();

        headerRow.appendChild(userInfo);
        headerRow.appendChild(refreshBtn);
        cloudPane.appendChild(headerRow);

        const loadingDiv = document.createElement('div');
        loadingDiv.textContent = '正在讀取雲端專案壓縮包...';
        loadingDiv.style.cssText = 'color: #888; text-align: center; padding: 32px 0; font-size: 13px;';
        cloudPane.appendChild(loadingDiv);

        try {
            const list = await safeListProjectZips();
            loadingDiv.remove();

            if (list.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.textContent = 'Google Drive 上尚無專案壓縮包 (.zip)';
                emptyDiv.style.cssText = 'color: #888; text-align: center; padding: 36px 0; font-size: 13px;';
                cloudPane.appendChild(emptyDiv);
                return;
            }

            for (const file of list) {
                const row = document.createElement('div');
                row.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 14px;
                    background: #242424;
                    border: 1px solid #383838;
                    border-radius: 8px;
                    gap: 12px;
                    box-sizing: border-box;
                    transition: border-color 0.15s ease;
                    user-select: none;
                    -webkit-user-select: none;
                `;

                // 左側名稱與修改時間
                const infoDiv = document.createElement('div');
                infoDiv.style.cssText = 'flex: 1; min-width: 0; overflow: hidden;';

                const nameDiv = document.createElement('div');
                const displayName = file.name.replace(/\.zip$/i, '');
                nameDiv.textContent = displayName;
                nameDiv.title = file.name;
                nameDiv.style.cssText = `
                    font-size: 13px;
                    font-weight: 600;
                    color: #eee;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `;

                const zipBadge = document.createElement('span');
                zipBadge.textContent = 'ZIP';
                zipBadge.style.cssText = `
                    font-size: 9px;
                    background: #2b5078;
                    color: #fff;
                    padding: 1px 4px;
                    border-radius: 3px;
                    font-weight: 700;
                `;
                nameDiv.appendChild(zipBadge);

                const timeDiv = document.createElement('div');
                const d = new Date(file.modifiedTime || file.createdTime);
                const sizeStr = file.size ? ` • ${formatFileSize(file.size)}` : '';
                timeDiv.textContent = `最後修改：${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${sizeStr}`;
                timeDiv.style.cssText = 'font-size: 11px; color: #888; margin-top: 3px;';

                infoDiv.appendChild(nameDiv);
                infoDiv.appendChild(timeDiv);

                // 右側 Material Symbol 按鈕列（下載、重命名、刪除）
                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

                const makeIconActionBtn = (iconName, tooltip, onClick, hoverColor = '#4a90e2') => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.title = tooltip;
                    btn.style.cssText = `
                        background: transparent;
                        border: none;
                        color: #b0b0b0;
                        padding: 5px;
                        border-radius: 4px;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        transition: color 0.15s ease, background 0.15s ease;
                    `;
                    const ic = document.createElement('span');
                    ic.className = 'material-symbols-outlined';
                    ic.setAttribute('translate', 'no');
                    ic.textContent = iconName;
                    ic.style.cssText = 'font-size: 20px;';
                    btn.appendChild(ic);

                    btn.onmouseenter = () => {
                        btn.style.color = hoverColor;
                        btn.style.background = 'rgba(255,255,255,0.06)';
                    };
                    btn.onmouseleave = () => {
                        btn.style.color = '#b0b0b0';
                        btn.style.background = 'transparent';
                    };
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        onClick();
                    };
                    return btn;
                };

                // 1. 下載按鈕 (直接下載 ZIP 並建立為新專案)
                const dlBtn = makeIconActionBtn('download', '下載並建立本地專案', async () => {
                    const progressModal = showTransferProgressModal({
                        title: '正在下載雲端專案壓縮包...',
                        icon: 'cloud_download'
                    });

                    try {
                        const zipBlob = await safeDownloadProjectZip(file.id, ({ percent }) => {
                            progressModal.update({ title: '正在下載 ZIP 壓縮檔...', percent });
                        });

                        progressModal.update({ title: '正在解壓縮並寫入本地專案...', percent: 80 });
                        const newProjectId = await extractZipToProject(zipBlob, null, displayName);

                        // 建立雲端關聯
                        await projectUpdateCloudMeta(newProjectId, {
                            cloudFileId: file.id,
                            cloudFileName: file.name,
                            cloudSyncedAt: Date.now()
                        });

                        progressModal.update({ title: '載入專案完成', percent: 100, isDone: true });
                        toast(`已成功下載並建立專案：${displayName}`, 'success', 1500);

                        if (typeof onLoadProject === 'function') {
                            await onLoadProject(newProjectId);
                        }
                        if (popupCtx) popupCtx.close();
                    } catch (err) {
                        console.error('[ProjectManager] 下載失敗:', err);
                        progressModal.close();
                        toast(`下載失敗：${err.message || err}`, 'error', 3000);
                    }
                }, '#4caf50');
                btnGroup.appendChild(dlBtn);

                // 2. 重命名按鈕
                const rnBtn = makeIconActionBtn('edit', '重新命名雲端檔案', async () => {
                    const newName = prompt('請輸入新的雲端壓縮包名稱：', displayName);
                    if (newName !== null && newName.trim() !== '') {
                        try {
                            await safeRenameProjectZip(file.id, newName.trim());
                            toast('雲端檔案名稱已更新', 'info', 1200);
                            renderCloudList();
                        } catch (err) {
                            toast(`重新命名失敗：${err.message || err}`, 'error', 3000);
                        }
                    }
                }, '#4a90e2');
                btnGroup.appendChild(rnBtn);

                // 3. 刪除按鈕
                const delBtn = makeIconActionBtn('delete', '刪除雲端檔案', async () => {
                    if (!confirm(`確定要刪除雲端壓縮檔「${file.name}」嗎？\n此檔案將移至 Google Drive 垃圾桶。`)) {
                        return;
                    }
                    try {
                        await safeDeleteProjectZip(file.id);
                        toast('已刪除雲端檔案', 'success', 1200);
                        renderCloudList();
                    } catch (err) {
                        toast(`刪除失敗：${err.message || err}`, 'error', 3000);
                    }
                }, '#ef5350');
                btnGroup.appendChild(delBtn);

                row.appendChild(infoDiv);
                row.appendChild(btnGroup);
                cloudPane.appendChild(row);
            }
        } catch (err) {
            loadingDiv.textContent = `讀取失敗：${err.message || err}`;
            loadingDiv.style.color = '#ef5350';
        }
    };

    // -------------------------------------------------------------
    // 分頁切換 (Tab Switch)
    // -------------------------------------------------------------
    const switchTab = (tab) => {
        activeTab = tab;
        const isLocal = activeTab === 'local';

        localTabBtn.style.color = isLocal ? '#ffffff' : '#888888';
        localTabBtn.style.fontWeight = isLocal ? '600' : '500';
        localTabBtn.style.borderBottom = isLocal ? '2px solid #4a90e2' : '2px solid transparent';

        cloudTabBtn.style.color = !isLocal ? '#ffffff' : '#888888';
        cloudTabBtn.style.fontWeight = !isLocal ? '600' : '500';
        cloudTabBtn.style.borderBottom = !isLocal ? '2px solid #4a90e2' : '2px solid transparent';

        localPane.style.display = isLocal ? 'grid' : 'none';
        cloudPane.style.display = !isLocal ? 'flex' : 'none';

        if (isLocal) {
            renderLocalCards();
        } else {
            renderCloudList();
        }
    };

    // -------------------------------------------------------------
    // 選取區外的動作按鈕（新建專案、匯入資料夾、匯入壓縮包）
    // -------------------------------------------------------------
    const modalButtons = [
        {
            text: '新建專案',
            onClick: async () => {
                const name = prompt('請輸入新專案名稱：', '未命名專案');
                if (name === null) return;
                const newId = await projectCreate(name.trim() || '未命名專案');
                toast(`已建立專案：${name.trim() || '未命名專案'}`, 'success', 1500);
                if (typeof onLoadProject === 'function') {
                    await onLoadProject(newId);
                }
                if (popupCtx) popupCtx.close();
            }
        },
        {
            text: '匯入資料夾',
            onClick: () => {
                if (typeof onImportFolder === 'function') {
                    onImportFolder(() => {
                        if (popupCtx) popupCtx.close();
                    });
                } else {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.webkitdirectory = true;
                    input.onchange = async (e) => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                            const newId = await projectCreate('匯入專案');
                            // 解析資料夾檔案寫入專案
                            for (let i = 0; i < files.length; i++) {
                                const f = files[i];
                                const base = f.name.toLowerCase();
                                if (base === 'maidata.txt') {
                                    const txt = await f.text();
                                    await idbSetProject(newId, 'maidata', txt);
                                    const match = txt.match(/&title=([^\r\n&]+)/);
                                    if (match && match[1]) await projectUpdateName(newId, match[1].trim());
                                } else if (base.startsWith('track.')) {
                                    await idbSetProject(newId, 'resource_bgm', f);
                                } else if (base.startsWith('bg.')) {
                                    await idbSetProject(newId, 'background_image', f);
                                } else if (base.startsWith('pv.')) {
                                    await idbSetProject(newId, 'background_video', f);
                                }
                            }
                            toast('資料夾匯入完成', 'success', 1500);
                            if (typeof onLoadProject === 'function') await onLoadProject(newId);
                            if (popupCtx) popupCtx.close();
                        }
                    };
                    input.click();
                }
            }
        },
        {
            text: '匯入壓縮包',
            onClick: () => {
                if (typeof onImportZip === 'function') {
                    onImportZip(() => {
                        if (popupCtx) popupCtx.close();
                    });
                } else {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.zip';
                    input.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (file) {
                            try {
                                const displayName = file.name.replace(/\.zip$/i, '');
                                const newId = await extractZipToProject(file, null, displayName);
                                toast(`已匯入壓縮檔：${file.name}`, 'success', 1500);
                                if (typeof onLoadProject === 'function') await onLoadProject(newId);
                                if (popupCtx) popupCtx.close();
                            } catch (err) {
                                toast(`匯入失敗：${err.message || err}`, 'error', 3000);
                            }
                        }
                    };
                    input.click();
                }
            }
        }
    ];

    // 初始化渲染
    switchTab('local');

    if (typeof popupWindow === 'function') {
        popupCtx = popupWindow({
            title: t('popup.projectManager.title') || '專案總管',
            customContent: root,
            width: 760,
            maxWidth: 840,
            buttons: modalButtons,
            onClose: () => {
                if (typeof cleanupLocalDrag === 'function') cleanupLocalDrag();
                if (typeof cleanupCloudDrag === 'function') cleanupCloudDrag();
            }
        });
        if (popupCtx?.elements?.body) {
            popupCtx.elements.body.style.overflowY = 'hidden';
        }
        if (popupCtx?.elements?.customContent) {
            popupCtx.elements.customContent.style.padding = '0';
        }
    }

    return {
        root,
        switchTab,
        refresh: () => {
            if (activeTab === 'local') renderLocalCards();
            else renderCloudList();
        }
    };
}
