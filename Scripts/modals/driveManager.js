// Scripts/modals/driveManager.js
// Google Drive 雲端專案管理分頁
// 採用 Material Design 風格（原生 HTML + CSS），嚴格不使用表情符號。

import { simpleToast } from '../helper.js';
import { projectCreate, projectList, projectUpdateName } from '../indexDB.js';
import { handleFolderInput, buildProjectZipById, saveProjectZipToIDB } from '../features/fileHandler.js';
import { ensureJSZip } from '../helper.js';
import { t } from '../i18n.js';
import {
    isSignedIn, signIn, signOut, getUserInfo, onAuthChanged, ensureSignedIn, getAccessToken
} from '../services/driveAuth.js';
import { listWmcxFiles, downloadFile, uploadFile, trashFile } from '../services/driveApi.js';
import { getDriveMeta, setDriveMeta, checkFileStillValid, clearDriveMeta } from '../services/driveSync.js';
import { createTransferProgress } from '../services/transferProgress.js';

/**
 * 模組層級管理所有進行中的雲端下載與同步任務
 * key: fileId, value: DriveTransferTask
 */
const activeDriveTransfers = new Map();

class DriveTransferTask {
    constructor(fileId, type, file, meta = {}) {
        this.fileId = fileId;
        this.type = type; // 'download' | 'upload'
        this.file = file;
        this.meta = meta;
        this.status = 'preparing';
        this.statusOpts = {};
        this.listeners = new Set();
    }

    notify(status, opts = {}) {
        this.status = status;
        this.statusOpts = opts;
        for (const listener of this.listeners) {
            try {
                listener(status, opts);
            } catch (e) {
                console.error('[DriveTransferTask] listener error:', e);
            }
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        try {
            listener(this.status, this.statusOpts);
        } catch (e) {
            console.error('[DriveTransferTask] initial listener error:', e);
        }
        return () => {
            this.listeners.delete(listener);
        };
    }
}

function broadcastDriveChanged() {
    window.dispatchEvent(new CustomEvent('wmc:drive-changed'));
}

function broadcastProjectChanged() {
    window.dispatchEvent(new CustomEvent('wmc:project-changed'));
}

/**
 * 將進度遮罩附加到卡片上，並即時訂閱真實進度
 */
function attachTransferProgressToDriveCard(card, task) {
    card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = true);

    const isDownload = task.type === 'download';
    const { el: progressEl, controller: prog } = createTransferProgress({
        preparingText: isDownload ? t('popup.drive.preparingDownload') : t('popup.drive.preparingUpload'),
        processingText: isDownload ? t('popup.drive.importing') : t('popup.drive.packaging'),
        completedText: isDownload ? t('popup.drive.downloadSuccess') : t('popup.drive.uploadSuccess'),
    });

    card.appendChild(progressEl);

    let hasConnected = false;
    let unsubscribe = null;

    unsubscribe = task.subscribe((status, opts) => {
        if (card.isConnected) {
            hasConnected = true;
        } else if (hasConnected) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
            return;
        }

        switch (status) {
            case 'idle':
                prog.reset();
                break;
            case 'preparing':
                prog.preparing(opts.message);
                break;
            case 'processing':
                prog.processing(opts.message);
                break;
            case 'transferring':
                prog.transferring(opts);
                break;
            case 'completed':
                prog.completed(opts.message);
                break;
            case 'error':
                prog.error(opts.message);
                break;
        }
    });

    return { progressEl, unsubscribe };
}

/**
 * 背景下載與解壓匯入任務執行流程（不依賴彈窗生命週期）
 */
async function executeDownloadImport(file, token, linkedLocalId, ctx) {
    if (activeDriveTransfers.has(file.id)) {
        simpleToast({ content: t('popup.drive.transferringDownloadWait'), type: 'info' });
        return;
    }

    const task = new DriveTransferTask(file.id, 'download', file, { linkedLocalId });
    activeDriveTransfers.set(file.id, task);

    // 若當前卡片在畫面上，立刻掛載
    const currentCard = document.querySelector(`.drive-file-card[data-file-id="${file.id}"]`);
    if (currentCard && currentCard.isConnected) {
        attachTransferProgressToDriveCard(currentCard, task);
    }

    try {
        task.notify('preparing', { message: t('popup.drive.preparingDownload') });

        // 下載（真實傳輸進度）
        const blob = await downloadFile(file.id, token, ({ loaded, total }) => {
            task.notify('transferring', { loaded, total, direction: 'download' });
        });

        // 進入背景解壓與 IndexedDB 寫入（轉為 processing 狀態）
        task.notify('processing', { message: t('popup.drive.importing') });

        // 若有已關聯之本地專案 ID，則直接覆寫該專案；否則建立新專案
        const { projectId: finalId, projectName: finalName } = await saveProjectZipToIDB(blob, file.name, linkedLocalId);

        // 儲存本地專案與雲端檔案的關聯
        await setDriveMeta(finalId, {
            driveFileId: file.id,
            driveName: file.name,
            canEdit: file.capabilities ? file.capabilities.canEdit !== false : true,
        });

        // 若覆寫的恰好是當前主畫面開啟的專案，重新載入主畫面資料保持一致
        if (linkedLocalId && typeof ctx?.getCurrentProjectId === 'function' && typeof ctx?.loadProject === 'function') {
            if (linkedLocalId === ctx.getCurrentProjectId()) {
                await ctx.loadProject(linkedLocalId).catch(() => {});
            }
        }

        task.notify('completed', { message: t('popup.drive.downloadSuccess') });
        const toastMsg = linkedLocalId
            ? t('popup.drive.toastDownloadOverwriteSuccess', { name: finalName || file.name })
            : t('popup.drive.toastImportSuccess', { name: finalName || file.name });
        simpleToast({ content: toastMsg, type: 'success', timeout: 2000 });

        // 廣播通知本地專案清單與雲端專案清單更新
        broadcastProjectChanged();
        broadcastDriveChanged();

        setTimeout(() => {
            activeDriveTransfers.delete(file.id);
            broadcastDriveChanged();
        }, 1200);

    } catch (e) {
        task.notify('error', { message: e.message || t('popup.drive.operationFailed') });
        console.error('[DriveManager] 下載匯入失敗:', e);
        setTimeout(() => {
            activeDriveTransfers.delete(file.id);
            broadcastDriveChanged();
        }, 3000);
    }
}

/**
 * 雲端分頁背景同步上傳任務執行流程
 */
async function executeUploadSync(localProjectId, file, token) {
    if (activeDriveTransfers.has(file.id)) {
        simpleToast({ content: t('popup.drive.transferringWait'), type: 'info' });
        return;
    }

    const task = new DriveTransferTask(file.id, 'upload', file, { localProjectId });
    activeDriveTransfers.set(file.id, task);

    const currentCard = document.querySelector(`.drive-file-card[data-file-id="${file.id}"]`);
    if (currentCard && currentCard.isConnected) {
        attachTransferProgressToDriveCard(currentCard, task);
    }

    try {
        task.notify('preparing', { message: t('popup.drive.preparingUpload') });

        // 檢查雲端檔案是否仍有效
        const isFileValid = await checkFileStillValid(file.id, token);
        if (!isFileValid) {
            throw new Error(t('popup.drive.loadFailed', { msg: 'File invalid or not found' }));
        }

        // 打包本地專案（直接由 IndexedDB 打包，無需切換或開啟專案）
        task.notify('processing', { message: t('popup.drive.packaging') });
        const zipBlob = await buildProjectZipById(localProjectId);

        // 上傳（真實 XHR 傳輸進度）
        task.notify('transferring', { loaded: 0, total: zipBlob.size, direction: 'upload' });
        await uploadFile({
            blob: zipBlob,
            name: file.name,
            token,
            fileId: file.id,
            onProgress: ({ loaded, total }) => {
                task.notify('transferring', { loaded, total, direction: 'upload' });
            },
        });

        // 上傳成功才更新本地雲端同步狀態
        await setDriveMeta(localProjectId, {
            driveFileId: file.id,
            driveName: file.name,
        });

        task.notify('completed', { message: t('popup.drive.uploadSuccess') });
        simpleToast({ content: t('popup.drive.toastUploadSuccess', { name: file.name }), type: 'success', timeout: 2000 });

        broadcastProjectChanged();
        broadcastDriveChanged();

        setTimeout(() => {
            activeDriveTransfers.delete(file.id);
            broadcastDriveChanged();
        }, 1200);

    } catch (e) {
        task.notify('error', { message: e.message || t('popup.drive.operationFailed') });
        console.error('[DriveManager] 上傳失敗:', e);
        setTimeout(() => {
            activeDriveTransfers.delete(file.id);
            broadcastDriveChanged();
        }, 3000);
    }
}

/**
 * 建立雲端分頁的主容器 DOM 與業務邏輯
 *
 * @param {Object} ctx
 * @param {Function} ctx.loadProject
 * @param {Function} ctx.getCurrentProjectId
 * @param {Function} ctx.getFileHandlerCtx
 * @param {Function} [ctx.refreshLocalList]
 * @returns {HTMLElement}
 */
export function buildDriveTab(ctx) {
    const { loadProject, getCurrentProjectId, getFileHandlerCtx, refreshLocalList } = ctx;

    const root = document.createElement('div');
    root.className = 'drive-tab-root';

    // ── 1. 頂部常駐帳號橫條 ──────────────────────────────────────
    const accountBar = document.createElement('div');
    accountBar.className = 'drive-account-bar';

    // 左側頭像（已登入彩色頭像）
    const accountAvatar = document.createElement('img');
    accountAvatar.className = 'drive-account-avatar';
    accountAvatar.alt = 'Avatar';
    accountAvatar.style.display = 'none';

    // 左側頭像（未登入灰色頭像佔位）
    const accountPlaceholder = document.createElement('div');
    accountPlaceholder.className = 'drive-account-avatar-placeholder';
    const placeholderIcon = document.createElement('span');
    placeholderIcon.className = 'material-symbols-outlined';
    placeholderIcon.setAttribute('translate', 'no');
    placeholderIcon.style.fontSize = '20px';
    placeholderIcon.textContent = 'account_circle';
    accountPlaceholder.appendChild(placeholderIcon);

    // 帳號名稱 / 未登入文字
    const accountName = document.createElement('span');
    accountName.className = 'drive-account-name';

    // 右側動作按鈕容器
    const accountActions = document.createElement('div');
    accountActions.className = 'drive-account-actions';

    // (A) 未登入時的 Google 圓角矩形登入按鈕
    const googleSignInBtn = document.createElement('button');
    googleSignInBtn.type = 'button';
    googleSignInBtn.className = 'g-signin-btn';
    googleSignInBtn.innerHTML = `
        <div class="g-signin-icon">
            <svg viewBox="0 0 18 18" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
        </div>
        <span class="g-signin-text">${t('popup.drive.signInWithGoogle')}</span>
    `;
    googleSignInBtn.onclick = async () => {
        try {
            googleSignInBtn.disabled = true;
            googleSignInBtn.querySelector('.g-signin-text').textContent = t('popup.drive.signingIn');
            const res = await signIn();
            if (res?.token) {
                renderState();
            }
        } catch (e) {
            googleSignInBtn.disabled = false;
            googleSignInBtn.querySelector('.g-signin-text').textContent = t('popup.drive.signInWithGoogle');
            simpleToast({ content: t('popup.drive.toastSignInFailed', { msg: e.message }), type: 'error', timeout: 3000 });
        }
    };

    // (B-1) 專案範圍篩選下拉選單 (全部/我的/與我共享)
    const filterSelect = document.createElement('select');
    filterSelect.className = 'drive-filter-select';
    filterSelect.title = '篩選專案範圍';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = t('popup.drive.filterAll') || '全部專案';

    const optMine = document.createElement('option');
    optMine.value = 'mine';
    optMine.textContent = t('popup.drive.filterMine') || '我的專案';

    const optShared = document.createElement('option');
    optShared.value = 'shared';
    optShared.textContent = t('popup.drive.filterShared') || '與我共享';

    filterSelect.append(optAll, optMine, optShared);
    filterSelect.value = 'all';

    let currentFilter = 'all';
    let cachedFiles = [];
    let cachedDriveIdToLocalId = new Map();
    let cachedToken = null;

    filterSelect.onchange = () => {
        currentFilter = filterSelect.value;
        renderFilteredFiles();
    };

    function renderFilteredFiles() {
        fileGrid.innerHTML = '';
        let displayFiles = cachedFiles;
        if (currentFilter === 'mine') {
            displayFiles = cachedFiles.filter(f => f.ownedByMe === true);
        } else if (currentFilter === 'shared') {
            displayFiles = cachedFiles.filter(f => f.ownedByMe === false);
        }

        if (displayFiles.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'drive-empty-msg';
            empty.textContent = t('popup.drive.empty');
            fileGrid.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const file of displayFiles) {
            const linkedLocalId = cachedDriveIdToLocalId.get(file.id) || null;
            const card = buildFileCard(file, linkedLocalId, cachedToken);
            fragment.appendChild(card);
        }
        fileGrid.appendChild(fragment);
    }

    // (B-2) 已登入時的重新整理按鈕
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'drive-refresh-btn';
    refreshBtn.title = t('popup.drive.refreshBtn');
    const refreshIcon = document.createElement('span');
    refreshIcon.className = 'material-symbols-outlined';
    refreshIcon.setAttribute('translate', 'no');
    refreshIcon.textContent = 'sync';
    refreshBtn.appendChild(refreshIcon);
    refreshBtn.onclick = () => loadDriveFiles();

    // (C) 已登入時的登出按鈕
    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'drive-signout-btn';
    signOutBtn.textContent = t('popup.drive.signOutBtn');
    signOutBtn.onclick = () => {
        signOut();
        renderState();
    };

    accountBar.append(accountAvatar, accountPlaceholder, accountName, accountActions);

    // ── 2. 下方內容區域 ──────────────────────────────────────────
    // 未登入時下方引導視圖
    const notSignedInPanel = document.createElement('div');
    notSignedInPanel.className = 'drive-not-signed-in';

    const cloudIcon = document.createElement('span');
    cloudIcon.className = 'material-symbols-outlined drive-cloud-icon';
    cloudIcon.setAttribute('translate', 'no');
    cloudIcon.textContent = 'cloud_off';

    const notSignedInTitle = document.createElement('div');
    notSignedInTitle.className = 'drive-not-signed-in-title';
    notSignedInTitle.textContent = t('popup.drive.signInTitle');

    const notSignedInSub = document.createElement('div');
    notSignedInSub.className = 'drive-not-signed-in-sub';
    notSignedInSub.textContent = t('popup.drive.signInGuide');

    notSignedInPanel.append(cloudIcon, notSignedInTitle, notSignedInSub);

    // 已登入時專案網格容器
    const fileGrid = document.createElement('div');
    fileGrid.className = 'project-manager-grid drive-file-grid';

    root.append(accountBar, notSignedInPanel, fileGrid);

    // ── 狀態切換（同步執行） ───────────────────────────────────
    function renderState() {
        accountActions.innerHTML = '';

        if (isSignedIn()) {
            // 已登入呈現
            accountPlaceholder.style.display = 'none';
            const user = getUserInfo();
            if (user?.picture) {
                accountAvatar.src = user.picture;
                accountAvatar.style.display = 'block';
            } else {
                accountAvatar.style.display = 'none';
                accountPlaceholder.style.display = 'flex';
            }
            accountName.textContent = user?.name || user?.email || 'Google User';

            accountActions.append(filterSelect, refreshBtn, signOutBtn);

            notSignedInPanel.style.display = 'none';
            fileGrid.style.display = '';
            loadDriveFiles();
        } else {
            // 未登入呈現
            accountAvatar.style.display = 'none';
            accountPlaceholder.style.display = 'flex';
            accountName.textContent = t('popup.drive.notSignedIn');

            googleSignInBtn.disabled = false;
            const textSpan = googleSignInBtn.querySelector('.g-signin-text');
            if (textSpan) textSpan.textContent = t('popup.drive.signInWithGoogle');
            accountActions.appendChild(googleSignInBtn);

            notSignedInPanel.style.display = 'flex';
            fileGrid.style.display = 'none';
        }
    }

    renderState();

    // ── 讀取雲端專案清單 ───────────────────────────────────────
    let driveLoadVersion = 0;
    async function loadDriveFiles() {
        if (!isSignedIn()) return;
        const token = getAccessToken();
        if (!token) return;

        const thisVersion = ++driveLoadVersion;
        fileGrid.innerHTML = '';
        const loadingEl = document.createElement('div');
        loadingEl.className = 'drive-loading';
        loadingEl.textContent = t('popup.drive.loading');
        fileGrid.appendChild(loadingEl);

        try {
            const files = await listWmcxFiles(token);
            const localProjects = await projectList();

            if (thisVersion !== driveLoadVersion) return;

            // 建立本地已關聯之 Map (driveFileId -> projectId)
            const driveIdToLocalId = new Map();
            for (const proj of localProjects) {
                const meta = await getDriveMeta(proj.id);
                if (meta?.driveFileId) {
                    driveIdToLocalId.set(meta.driveFileId, proj.id);
                }
            }

            if (thisVersion !== driveLoadVersion) return;

            cachedFiles = files;
            cachedDriveIdToLocalId = driveIdToLocalId;
            cachedToken = token;
            renderFilteredFiles();
        } catch (e) {
            if (thisVersion !== driveLoadVersion) return;
            fileGrid.innerHTML = '';
            const errEl = document.createElement('div');
            errEl.className = 'drive-error-msg';
            errEl.textContent = t('popup.drive.loadFailed', { msg: e.message });
            fileGrid.appendChild(errEl);
        }
    }

    // ── 建立單一雲端專案卡片 ───────────────────────────────────
    function buildFileCard(file, linkedLocalId, token) {
        const isLinked = Boolean(linkedLocalId);

        const card = document.createElement('div');
        card.className = 'drive-file-card';
        card.dataset.fileId = file.id;
        if (isLinked) card.classList.add('drive-file-card--linked');

        // 圖示區塊
        const iconArea = document.createElement('div');
        iconArea.className = 'drive-file-icon-area';
        const fileIcon = document.createElement('span');
        fileIcon.className = 'material-symbols-outlined drive-file-icon';
        fileIcon.setAttribute('translate', 'no');
        fileIcon.textContent = 'folder_zip';
        iconArea.appendChild(fileIcon);

        // 徽章標籤
        const badge = document.createElement('div');
        badge.className = isLinked ? 'drive-badge drive-badge--synced' : 'drive-badge drive-badge--cloud';
        badge.textContent = isLinked ? t('popup.drive.badgeSynced') : t('popup.drive.badgeCloudOnly');
        iconArea.appendChild(badge);

        const canEdit = file.capabilities ? file.capabilities.canEdit !== false : true;
        const canTrash = file.capabilities ? file.capabilities.canTrash !== false : true;

        if (!canEdit) {
            const roBadge = document.createElement('div');
            roBadge.className = 'drive-badge drive-badge--readonly';
            roBadge.textContent = t('popup.drive.badgeReadOnly') || '唯讀';
            roBadge.title = t('popup.drive.tooltipReadOnly') || '此專案為唯讀權限，不開放上傳複寫';
            iconArea.appendChild(roBadge);
        }

        // 資訊區塊
        const body = document.createElement('div');
        body.className = 'drive-file-card-body';

        const nameEl = document.createElement('div');
        nameEl.className = 'drive-file-card-name';
        nameEl.textContent = file.name || `${t('popup.projectManager.untitled')}.wmcx.zip`;
        nameEl.title = file.name || '';

        const metaRow = document.createElement('div');
        metaRow.className = 'drive-file-card-meta';

        const dateEl = document.createElement('span');
        if (file.modifiedTime) {
            const d = new Date(file.modifiedTime);
            const pad = n => String(n).padStart(2, '0');
            dateEl.textContent = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            dateEl.textContent = '--';
        }

        const sizeEl = document.createElement('span');
        if (file.size) {
            const b = parseInt(file.size, 10);
            sizeEl.textContent = b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;
        }

        metaRow.append(dateEl, sizeEl);
        body.append(nameEl, metaRow);

        // 操作按鈕列
        const btnRow = document.createElement('div');
        btnRow.className = 'drive-file-card-btns';

        // 下載並匯入按鈕
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'drive-file-btn drive-file-btn--download';
        downloadBtn.title = isLinked ? t('popup.drive.downloadOverwriteBtn') : t('popup.drive.downloadBtn');
        const dlIcon = document.createElement('span');
        dlIcon.className = 'material-symbols-outlined';
        dlIcon.setAttribute('translate', 'no');
        dlIcon.textContent = 'cloud_download';
        downloadBtn.appendChild(dlIcon);
        downloadBtn.onclick = () => {
            if (activeDriveTransfers.has(file.id)) return;
            if (isLinked) {
                const fileName = file.name || t('popup.projectManager.untitled');
                if (!confirm(t('popup.drive.confirmDownloadOverwrite', { name: fileName }))) {
                    return;
                }
            }
            executeDownloadImport(file, token, linkedLocalId, ctx);
        };
        btnRow.appendChild(downloadBtn);

        // 若已關聯本地專案且擁有編輯權限，才顯示上傳回雲端按鈕
        if (isLinked && canEdit) {
            const uploadBtn = document.createElement('button');
            uploadBtn.type = 'button';
            uploadBtn.className = 'drive-file-btn drive-file-btn--upload';
            uploadBtn.title = t('popup.drive.uploadBtn');
            const ulIcon = document.createElement('span');
            ulIcon.className = 'material-symbols-outlined';
            ulIcon.setAttribute('translate', 'no');
            ulIcon.textContent = 'cloud_upload';
            uploadBtn.appendChild(ulIcon);
            uploadBtn.onclick = () => {
                if (activeDriveTransfers.has(file.id)) return;
                executeUploadSync(linkedLocalId, file, token);
            };
            btnRow.appendChild(uploadBtn);
        }

        // 移至雲端垃圾桶按鈕（僅在具備刪除權限時顯示）
        if (canTrash) {
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'drive-file-btn drive-file-btn--delete';
            deleteBtn.title = t('popup.drive.deleteBtn');
            const delIcon = document.createElement('span');
            delIcon.className = 'material-symbols-outlined';
            delIcon.setAttribute('translate', 'no');
            delIcon.textContent = 'delete';
            deleteBtn.appendChild(delIcon);

            deleteBtn.onclick = async () => {
                if (activeDriveTransfers.has(file.id)) {
                    simpleToast({ content: t('popup.drive.transferringCannotDelete'), type: 'error' });
                    return;
                }

                const fileName = file.name || t('popup.projectManager.untitled');
                if (!confirm(t('popup.drive.confirmDelete', { name: fileName }))) {
                    return;
                }

                deleteBtn.disabled = true;
                try {
                    await trashFile(file.id, token);

                    // 若有本地專案已關聯該雲端檔案，自動清除該關聯
                    if (linkedLocalId) {
                        await clearDriveMeta(linkedLocalId);
                    }

                    simpleToast({ content: t('popup.drive.toastTrashSuccess', { name: fileName }), type: 'success', timeout: 2000 });
                    broadcastDriveChanged();
                    broadcastProjectChanged();
                } catch (err) {
                    deleteBtn.disabled = false;
                    simpleToast({ content: t('popup.drive.toastDeleteFailed', { msg: err.message }), type: 'error', timeout: 3000 });
                    console.error('[DriveManager] 移至垃圾桶失敗:', err);
                }
            };
            btnRow.appendChild(deleteBtn);
        }

        card.append(iconArea, body, btnRow);

        // 若該檔案正在下載或同步中，立即掛載進度遮罩並接管真實進度！
        if (activeDriveTransfers.has(file.id)) {
            const task = activeDriveTransfers.get(file.id);
            attachTransferProgressToDriveCard(card, task);
        }

        return card;
    }

    // 訂閱全域雲端專案清單變更事件
    const handleDriveChanged = () => {
        if (!root.isConnected) {
            window.removeEventListener('wmc:drive-changed', handleDriveChanged);
            return;
        }
        if (isSignedIn()) {
            loadDriveFiles();
        }
    };
    window.addEventListener('wmc:drive-changed', handleDriveChanged);

    // 訂閱授權狀態監聽
    const unbindAuth = onAuthChanged(() => renderState());
    const observer = new MutationObserver(() => {
        if (!document.contains(root)) {
            unbindAuth();
            window.removeEventListener('wmc:drive-changed', handleDriveChanged);
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    renderState();
    return root;
}
