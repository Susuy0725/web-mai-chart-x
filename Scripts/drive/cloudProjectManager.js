/**
 * Cloud Project Manager - Web mai Chart X
 * 負責 Google Drive 雲端專案的狀態管理、全量同步、傳輸進度條與專案面板介面
 */
import * as googleDriveService from './googleDriveService.js';
import { t } from '../i18n.js';

let currentCloudFolderId = null;
let currentCloudProjectName = null;
let transferModalEl = null;

/**
 * 取得當前雲端專案資料夾 ID
 */
export function getCloudFolderId() {
    return currentCloudFolderId;
}

/**
 * 取得當前雲端專案名稱
 */
export function getCloudProjectName() {
    return currentCloudProjectName;
}

/**
 * 設定當前雲端專案
 */
export function setCloudProject(folderId, projectName) {
    currentCloudFolderId = folderId || null;
    currentCloudProjectName = projectName || null;
}

/**
 * 清除當前雲端專案狀態（例如切換為本地新專案時）
 */
export function clearCloudProject() {
    currentCloudFolderId = null;
    currentCloudProjectName = null;
}

/**
 * 是否處於雲端專案編輯狀態
 */
export function isCurrentCloudProject() {
    return !!currentCloudFolderId;
}

/**
 * 顯示 Material Design 原生浮動傳輸進度卡片
 */
export function showTransferProgressModal({ title = '正在傳輸...', icon = 'cloud_sync' } = {}) {
    if (!transferModalEl) {
        transferModalEl = document.createElement('div');
        transferModalEl.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 10000;
            background: #1e1e1e;
            color: #fff;
            padding: 14px 18px;
            border-radius: 8px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.65);
            border: 1px solid #383838;
            min-width: 300px;
            max-width: 400px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 10px;
            font-family: inherit;
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;
        document.body.appendChild(transferModalEl);
    }

    transferModalEl.style.display = 'flex';
    transferModalEl.style.opacity = '1';
    transferModalEl.style.transform = 'translateY(0)';

    const update = ({ title: newTitle, file = '', percent = 0, current = 0, total = 0, isDone = false }) => {
        if (!transferModalEl) return;
        const currentTitle = newTitle || title;
        const pct = Math.max(0, Math.min(100, Math.round(percent)));

        transferModalEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; font-weight:600; font-size:13px; color:#fff;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:${isDone ? '#4caf50' : '#4a90e2'};">${isDone ? 'check_circle' : icon}</span>
                    <span>${currentTitle}</span>
                </div>
                <span style="font-size:11px; color:#888;">${pct}%</span>
            </div>
            <div style="font-size:12px; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${file ? `正在傳輸：${file}` : '準備中...'}
            </div>
            <div style="width:100%; height:6px; background:#2a2a2a; border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:${isDone ? '#4caf50' : '#4a90e2'}; transition:width 0.25s ease;"></div>
            </div>
            ${total > 0 ? `<div style="font-size:10px; color:#666; text-align:right;">進度：${current} / ${total} 個檔案</div>` : ''}
        `;

        if (isDone) {
            setTimeout(() => {
                if (transferModalEl) {
                    transferModalEl.style.opacity = '0';
                    transferModalEl.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        if (transferModalEl) transferModalEl.style.display = 'none';
                    }, 350);
                }
            }, 1200);
        }
    };

    update({ title, file: '連線中...', percent: 0 });

    return {
        update,
        close: () => {
            if (transferModalEl) {
                transferModalEl.style.opacity = '0';
                transferModalEl.style.transform = 'translateY(10px)';
                setTimeout(() => {
                    if (transferModalEl) transferModalEl.style.display = 'none';
                }, 350);
            }
        }
    };
}

/**
 * 全量同步推送當前專案至 Google Drive
 */
export async function syncProjectToCloud({
    folderId = currentCloudFolderId,
    projectName = currentCloudProjectName,
    maidataText = '',
    audioFile = null,
    bgImageFile = null,
    bgVideoFile = null,
    metadata = {},
    clearExisting = false,
    onToast = null,
} = {}) {
    if (!folderId || !googleDriveService.isLoggedIn()) return;

    const progressModal = showTransferProgressModal({
        title: `同步至雲端：${projectName || '專案'}`,
        icon: 'cloud_upload'
    });

    try {
        await googleDriveService.uploadFullProject(
            folderId,
            {
                maidataText,
                audioFile: (audioFile instanceof Blob || audioFile instanceof File) ? audioFile : null,
                bgImageFile: (bgImageFile instanceof Blob || bgImageFile instanceof File) ? bgImageFile : null,
                bgVideoFile: (bgVideoFile instanceof Blob || bgVideoFile instanceof File) ? bgVideoFile : null,
                metadata: {
                    id: folderId,
                    name: projectName || '未命名專案',
                    ...metadata
                }
            },
            ({ current, total, file, percent }) => {
                progressModal.update({
                    file,
                    percent,
                    current,
                    total,
                    isDone: percent >= 100
                });
            },
            { clearExisting }
        );

        console.log(`[GoogleDrive] 專案 ${folderId} 已同步推送完成`);
        if (typeof onToast === 'function') {
            onToast({ content: `已同步至雲端：${projectName || '專案'}`, type: 'success', timeout: 1500 });
        }
    } catch (err) {
        console.error('[GoogleDrive] 全量同步失敗:', err);
        progressModal.update({ file: `傳輸失敗：${err.message || err}`, percent: 100, isDone: true });
        if (typeof onToast === 'function') {
            onToast({ content: `雲端同步失敗：${err.message || err}`, type: 'error', timeout: 3000 });
        }
        throw err;
    }
}

/**
 * 渲染專案總管中的雲端專案面板
 */
export async function renderCloudProjectPane(container, {
    createProjectRow,
    onOpenProject,
    openSettings,
    onToast = () => { },
    onClosePopup = null,
}) {
    const setStyle = (el, styles) => Object.assign(el.style, styles);
    container.innerHTML = '';

    const loggedIn = googleDriveService.isLoggedIn();

    if (!loggedIn) {
        setStyle(container, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            background: '#161616',
            border: '1px dashed #333333',
            borderRadius: '6px',
            textAlign: 'center',
            gap: '10px',
            boxSizing: 'border-box',
            minHeight: '220px',
        });

        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.setAttribute('translate', 'no');
        icon.textContent = 'cloud_queue';
        setStyle(icon, { fontSize: '48px', color: '#4a90e2', opacity: '0.85' });

        const title = document.createElement('div');
        title.textContent = t('popup.projectManager.cloudNotLoggedIn') || '尚未登入 Google Drive';
        setStyle(title, { fontSize: '15px', fontWeight: '600', color: '#ffffff' });

        const desc = document.createElement('div');
        desc.textContent = t('popup.projectManager.cloudNotLoggedInDesc') || '請前往「設定 > 同步」登入 Google 帳號以檢視與編輯雲端專案。';
        setStyle(desc, { fontSize: '12px', color: '#888888', maxWidth: '340px', lineHeight: '1.5' });

        const btnRow = document.createElement('div');
        setStyle(btnRow, { display: 'flex', gap: '8px', marginTop: '6px' });

        if (typeof openSettings === 'function') {
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'popup-button';
            settingsBtn.textContent = t('popup.projectManager.cloudGoToSettings') || '前往設定登入';
            settingsBtn.style.padding = '6px 14px';
            settingsBtn.onclick = () => {
                if (onClosePopup) onClosePopup();
                openSettings(4);
            };
            btnRow.appendChild(settingsBtn);
        }

        const directLoginBtn = document.createElement('button');
        directLoginBtn.className = 'popup-button';
        directLoginBtn.textContent = t('popup.projectManager.cloudLoginNow') || '立即登入';
        directLoginBtn.style.cssText = 'padding:6px 14px; background:#1f3a58; border-color:#2a5078; color:#fff;';
        directLoginBtn.onclick = async () => {
            try {
                directLoginBtn.disabled = true;
                directLoginBtn.textContent = t('settings.gdrive.loggingIn') || '正在登入...';
                await googleDriveService.login();
                onToast({ content: t('settings.gdrive.loginSuccess') || 'Google Drive 登入成功！', type: 'success', timeout: 1500 });
                renderCloudProjectPane(container, { createProjectRow, onOpenProject, openSettings, onToast, onClosePopup });
            } catch (err) {
                console.error('[GoogleDrive] 登入失敗:', err);
                onToast({ content: t('settings.gdrive.loginError', { error: err.message || err }), type: 'error', timeout: 3000 });
                renderCloudProjectPane(container, { createProjectRow, onOpenProject, openSettings, onToast, onClosePopup });
            }
        };

        btnRow.appendChild(directLoginBtn);
        container.appendChild(icon);
        container.appendChild(title);
        container.appendChild(desc);
        container.appendChild(btnRow);
        return;
    }

    // 已登入狀態
    setStyle(container, {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: '350px',
        overflowY: 'auto',
        background: 'transparent',
        border: 'none',
        padding: '0',
        textAlign: 'left',
        minHeight: 'auto',
    });

    // 頂部狀態列
    const user = googleDriveService.getCurrentUser();
    const headerRow = document.createElement('div');
    setStyle(headerRow, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        background: '#181818',
        border: '1px solid #333',
        borderRadius: '6px',
        fontSize: '12px',
    });

    const userInfo = document.createElement('span');
    userInfo.style.color = '#888';
    userInfo.textContent = `Google 帳號: ${user?.email || user?.name || '已連線'}`;

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'popup-button';
    refreshBtn.textContent = '重新整理';
    refreshBtn.style.cssText = 'padding:3px 10px; font-size:11px; cursor:pointer;';
    refreshBtn.onclick = () => renderCloudProjectPane(container, { createProjectRow, onOpenProject, openSettings, onToast, onClosePopup });

    headerRow.appendChild(userInfo);
    headerRow.appendChild(refreshBtn);
    container.appendChild(headerRow);

    // 載入清單
    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = t('popup.projectManager.cloudLoading') || '正在讀取雲端專案...';
    setStyle(loadingDiv, { color: '#888', textAlign: 'center', padding: '24px 0', fontSize: '13px' });
    container.appendChild(loadingDiv);

    try {
        const list = await googleDriveService.listProjects();
        loadingDiv.remove();

        if (list.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.textContent = t('popup.projectManager.cloudEmpty') || 'Google Drive 尚無專案資料夾';
            setStyle(emptyDiv, { color: '#888', textAlign: 'center', padding: '24px 0', fontSize: '13px' });
            container.appendChild(emptyDiv);
            return;
        }

        for (const proj of list) {
            const isCurrentCloud = proj.id === currentCloudFolderId;
            const d = new Date(proj.modifiedTime || proj.createdTime);
            const timeText = `最後修改：${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

            const row = createProjectRow({
                name: proj.name || '未命名雲端專案',
                timeText,
                isCurrent: isCurrentCloud,
                badgeText: '雲端使用中',
                onOpen: async () => {
                    const progressModal = showTransferProgressModal({
                        title: '正在下載雲端專案...',
                        icon: 'cloud_download',
                    });

                    try {
                        const projectData = await googleDriveService.loadProject(proj.id, (prog) => {
                            progressModal.update({
                                file: prog.file,
                                percent: prog.percent,
                                current: prog.current,
                                total: prog.total,
                            });
                        });

                        setCloudProject(proj.id, proj.name);

                        if (typeof onOpenProject === 'function') {
                            await onOpenProject(projectData, proj);
                        }

                        progressModal.update({
                            title: '雲端專案下載完成',
                            percent: 100,
                            isDone: true,
                        });

                        onToast({ content: `已載入雲端專案：${proj.name}`, type: 'success', timeout: 1500 });
                        if (onClosePopup) onClosePopup();
                    } catch (err) {
                        console.error('[GoogleDrive] 載入雲端專案失敗:', err);
                        progressModal.close();
                        onToast({ content: `載入失敗：${err.message || err}`, type: 'error', timeout: 3000 });
                    }
                },
                openBtnText: isCurrentCloud ? '重新載入' : '載入編輯',
                openBtnColor: isCurrentCloud ? '#204060' : '#1f4870',
                onRename: async () => {
                    const newName = prompt('請輸入新的雲端專案名稱：', proj.name || '');
                    if (newName !== null && newName.trim() !== '') {
                        try {
                            onToast({ content: '正在重新命名...', type: 'info', timeout: 1500 });
                            await googleDriveService.renameProjectFolder(proj.id, newName.trim());
                            if (proj.id === currentCloudFolderId) {
                                currentCloudProjectName = newName.trim();
                            }
                            onToast({ content: '已重新命名雲端專案', type: 'success', timeout: 1500 });
                            renderCloudProjectPane(container, { createProjectRow, onOpenProject, openSettings, onToast, onClosePopup });
                        } catch (err) {
                            console.error('[GoogleDrive] 重新命名失敗:', err);
                            onToast({ content: `重新命名失敗：${err.message || err}`, type: 'error', timeout: 3000 });
                        }
                    }
                },
                onDelete: async () => {
                    if (!confirm(`確定要刪除雲端專案「${proj.name || '未命名'}」嗎？\n此操作無法復原！`)) return;
                    try {
                        onToast({ content: '正在刪除雲端專案...', type: 'info', timeout: 1500 });
                        await googleDriveService.deleteProjectFolder(proj.id);
                        if (proj.id === currentCloudFolderId) {
                            clearCloudProject();
                        }
                        onToast({ content: '已刪除雲端專案', type: 'success', timeout: 1500 });
                        renderCloudProjectPane(container, { createProjectRow, onOpenProject, openSettings, onToast, onClosePopup });
                    } catch (err) {
                        console.error('[GoogleDrive] 刪除失敗:', err);
                        onToast({ content: `刪除失敗：${err.message || err}`, type: 'error', timeout: 3000 });
                    }
                },
            });

            container.appendChild(row);
        }
    } catch (err) {
        loadingDiv.textContent = `讀取失敗：${err.message || err}`;
        loadingDiv.style.color = '#e57373';
    }
}
