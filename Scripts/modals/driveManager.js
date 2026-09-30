// Scripts/modals/driveManager.js
// Google Drive 雲端專案管理分頁
// 採用 Material Design 風格（原生 HTML + CSS），嚴格不使用表情符號。

import { simpleToast } from '../helper.js';
import { projectCreate, projectList, projectUpdateName } from '../indexDB.js';
import { handleFolderInput, buildProjectZip } from '../features/fileHandler.js';
import { ensureJSZip } from '../helper.js';
import {
    isSignedIn, signIn, signOut, getUserInfo, onAuthChanged, ensureSignedIn
} from '../services/driveAuth.js';
import { listWmcxFiles, downloadFile, uploadFile } from '../services/driveApi.js';
import { getDriveMeta, setDriveMeta, checkFileStillValid } from '../services/driveSync.js';
import { createTransferProgress } from '../services/transferProgress.js';

/**
 * 建立雲端分頁的主容器 DOM 與業務邏輯
 *
 * @param {Object} ctx
 * @param {Function} ctx.loadProject
 * @param {Function} ctx.getCurrentProjectId
 * @param {Function} ctx.getFileHandlerCtx
 * @returns {HTMLElement}
 */
export function buildDriveTab(ctx) {
    const { loadProject, getCurrentProjectId, getFileHandlerCtx } = ctx;

    const root = document.createElement('div');
    root.className = 'drive-tab-root';

    // ── 1. 未登入視圖 ──────────────────────────────────────────
    const notSignedInPanel = document.createElement('div');
    notSignedInPanel.className = 'drive-not-signed-in';

    const cloudIcon = document.createElement('span');
    cloudIcon.className = 'material-symbols-outlined drive-cloud-icon';
    cloudIcon.setAttribute('translate', 'no');
    cloudIcon.textContent = 'cloud_off';

    const notSignedInTitle = document.createElement('div');
    notSignedInTitle.className = 'drive-not-signed-in-title';
    notSignedInTitle.textContent = '連接 Google 雲端硬碟';

    const notSignedInSub = document.createElement('div');
    notSignedInSub.className = 'drive-not-signed-in-sub';
    notSignedInSub.textContent = '登入後可瀏覽與同步 .wmcx.zip 雲端專案。未登入時不會影響任何本地功能。';

    const signInBtn = document.createElement('button');
    signInBtn.type = 'button';
    signInBtn.className = 'drive-signin-btn';
    signInBtn.textContent = '登入 Google 帳號';
    signInBtn.onclick = async () => {
        try {
            signInBtn.disabled = true;
            signInBtn.textContent = '登入中...';
            await signIn();
            renderState();
        } catch (e) {
            signInBtn.disabled = false;
            signInBtn.textContent = '登入 Google 帳號';
            simpleToast({ content: `登入失敗: ${e.message}`, type: 'error', timeout: 3000 });
        }
    };

    notSignedInPanel.append(cloudIcon, notSignedInTitle, notSignedInSub, signInBtn);

    // ── 2. 已登入視圖 ──────────────────────────────────────────
    const signedInPanel = document.createElement('div');
    signedInPanel.className = 'drive-signed-in';
    signedInPanel.style.display = 'none';

    // 帳號列
    const accountBar = document.createElement('div');
    accountBar.className = 'drive-account-bar';

    const accountAvatar = document.createElement('img');
    accountAvatar.className = 'drive-account-avatar';
    accountAvatar.alt = 'Avatar';
    accountAvatar.style.display = 'none';

    const accountName = document.createElement('span');
    accountName.className = 'drive-account-name';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'drive-refresh-btn';
    refreshBtn.title = '重新整理雲端專案清單';
    const refreshIcon = document.createElement('span');
    refreshIcon.className = 'material-symbols-outlined';
    refreshIcon.setAttribute('translate', 'no');
    refreshIcon.textContent = 'sync';
    refreshBtn.appendChild(refreshIcon);
    refreshBtn.onclick = () => loadDriveFiles();

    const signOutBtn = document.createElement('button');
    signOutBtn.type = 'button';
    signOutBtn.className = 'drive-signout-btn';
    signOutBtn.textContent = '登出';
    signOutBtn.onclick = () => {
        signOut();
        renderState();
    };

    accountBar.append(accountAvatar, accountName, refreshBtn, signOutBtn);

    // 雲端專案格狀容器
    const fileGrid = document.createElement('div');
    fileGrid.className = 'project-manager-grid drive-file-grid';

    signedInPanel.append(accountBar, fileGrid);

    root.append(notSignedInPanel, signedInPanel);

    // ── 狀態切換 ──────────────────────────────────────────────
    function renderState() {
        if (isSignedIn()) {
            notSignedInPanel.style.display = 'none';
            signedInPanel.style.display = 'flex';
            const user = getUserInfo();
            if (user?.picture) {
                accountAvatar.src = user.picture;
                accountAvatar.style.display = 'block';
            } else {
                accountAvatar.style.display = 'none';
            }
            accountName.textContent = user?.name || user?.email || '已登入 Google';
            loadDriveFiles();
        } else {
            notSignedInPanel.style.display = 'flex';
            signedInPanel.style.display = 'none';
            signInBtn.disabled = false;
            signInBtn.textContent = '登入 Google 帳號';
        }
    }

    // ── 讀取雲端專案清單 ───────────────────────────────────────
    async function loadDriveFiles() {
        fileGrid.innerHTML = '';
        const loadingEl = document.createElement('div');
        loadingEl.className = 'drive-loading';
        loadingEl.textContent = '正在讀取雲端專案...';
        fileGrid.appendChild(loadingEl);

        try {
            const token = await ensureSignedIn();
            const files = await listWmcxFiles(token);
            const localProjects = await projectList();

            // 建立本地已關聯之 Map (driveFileId -> projectId)
            const driveIdToLocalId = new Map();
            for (const proj of localProjects) {
                const meta = await getDriveMeta(proj.id);
                if (meta?.driveFileId) {
                    driveIdToLocalId.set(meta.driveFileId, proj.id);
                }
            }

            fileGrid.innerHTML = '';
            if (files.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'drive-empty-msg';
                empty.textContent = '雲端硬碟中尚無 .wmcx.zip 專案檔案';
                fileGrid.appendChild(empty);
                return;
            }

            for (const file of files) {
                const linkedLocalId = driveIdToLocalId.get(file.id) || null;
                const card = buildFileCard(file, linkedLocalId, token);
                fileGrid.appendChild(card);
            }
        } catch (e) {
            fileGrid.innerHTML = '';
            const errEl = document.createElement('div');
            errEl.className = 'drive-error-msg';
            errEl.textContent = `載入雲端清單失敗: ${e.message}`;
            fileGrid.appendChild(errEl);
        }
    }

    // ── 建立單一雲端專案卡片 ───────────────────────────────────
    function buildFileCard(file, linkedLocalId, token) {
        const isLinked = Boolean(linkedLocalId);

        const card = document.createElement('div');
        card.className = 'drive-file-card';
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
        badge.textContent = isLinked ? '已同步本地' : '尚未建立本地關聯';
        iconArea.appendChild(badge);

        // 資訊區塊
        const body = document.createElement('div');
        body.className = 'drive-file-card-body';

        const nameEl = document.createElement('div');
        nameEl.className = 'drive-file-card-name';
        nameEl.textContent = file.name || '未命名專案.wmcx.zip';
        nameEl.title = file.name || '';

        const metaRow = document.createElement('div');
        metaRow.className = 'drive-file-card-meta';

        const dateEl = document.createElement('span');
        if (file.modifiedTime) {
            const d = new Date(file.modifiedTime);
            const pad = n => String(n).padStart(2, '0');
            dateEl.textContent = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            dateEl.textContent = '未知時間';
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
        downloadBtn.title = '從雲端下載並建立本地專案';
        const dlIcon = document.createElement('span');
        dlIcon.className = 'material-symbols-outlined';
        dlIcon.setAttribute('translate', 'no');
        dlIcon.textContent = 'cloud_download';
        downloadBtn.appendChild(dlIcon);
        downloadBtn.onclick = () => handleDownloadImport(file, token, card);
        btnRow.appendChild(downloadBtn);

        // 若已關聯本地專案，顯示上傳回雲端按鈕
        if (isLinked) {
            const uploadBtn = document.createElement('button');
            uploadBtn.type = 'button';
            uploadBtn.className = 'drive-file-btn drive-file-btn--upload';
            uploadBtn.title = '將本地專案上傳並複寫雲端檔案';
            const ulIcon = document.createElement('span');
            ulIcon.className = 'material-symbols-outlined';
            ulIcon.setAttribute('translate', 'no');
            ulIcon.textContent = 'cloud_upload';
            uploadBtn.appendChild(ulIcon);
            uploadBtn.onclick = () => handleUploadSync(linkedLocalId, file, token, card);
            btnRow.appendChild(uploadBtn);
        }

        card.append(iconArea, body, btnRow);
        return card;
    }

    // ── 下載並匯入業務流程 ────────────────────────────────────
    async function handleDownloadImport(file, token, card) {
        const { el: progressEl, controller: prog } = createTransferProgress({
            preparingText: '準備下載雲端檔案...',
            processingText: '正在匯入專案與解析資料...',
            completedText: '匯入完成',
        });

        card.appendChild(progressEl);
        card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = true);

        try {
            prog.preparing();

            // 下載（真實傳輸進度）
            const blob = await downloadFile(file.id, token, ({ loaded, total }) => {
                prog.transferring({ loaded, total, direction: 'download' });
            });

            // 進入既有解壓匯入（轉為 processing 狀態）
            prog.processing();

            const fhCtx = getFileHandlerCtx();
            const projectName = file.name.replace(/\.wmcx\.zip$/i, '').trim() || '未命名專案';

            // 建立新專案以確保安全，不任意破壞現有專案
            const newId = await projectCreate(projectName);
            fhCtx.setCurrentProjectId(newId);
            localStorage.setItem('simai_lastProjectId', newId);

            fhCtx.setDataEmpty();

            // 呼叫既有解壓與匯入邏輯
            await ensureJSZip();
            const zip = await window.JSZip.loadAsync(blob);
            await handleFolderInput(zip.files, fhCtx);
            fhCtx.setEndtime(fhCtx.getEndTime());
            fhCtx.draw();

            // 同步專案名稱
            const md = fhCtx.getMaidata();
            if (md?.title && newId) {
                await projectUpdateName(newId, md.title).catch(() => {});
            }

            // 儲存本地專案與雲端檔案的關聯
            await setDriveMeta(newId, {
                driveFileId: file.id,
                driveName: file.name,
            });

            // 切換並載入新專案
            if (typeof loadProject === 'function') {
                await loadProject(newId);
            }

            prog.completed('專案下載並匯入成功');
            simpleToast({ content: `已成功匯入雲端專案：${file.name}`, type: 'success', timeout: 2000 });

            setTimeout(() => {
                progressEl.remove();
                loadDriveFiles();
                card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = false);
            }, 1200);

        } catch (e) {
            prog.error(e.message || '下載匯入失敗');
            card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = false);
            console.error('[DriveManager] 下載匯入失敗:', e);
        }
    }

    // ── 上傳同步業務流程 ──────────────────────────────────────
    async function handleUploadSync(localProjectId, file, token, card) {
        const { el: progressEl, controller: prog } = createTransferProgress({
            preparingText: '正在檢查雲端檔案狀態...',
            processingText: '正在打包本地專案檔案...',
            completedText: '雲端同步完成',
        });

        card.appendChild(progressEl);
        card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = true);

        try {
            prog.preparing();

            // 檢查雲端檔案是否仍有效
            const isFileValid = await checkFileStillValid(file.id, token);
            if (!isFileValid) {
                throw new Error('雲端檔案不存在或權限不足，無法複寫更新');
            }

            // 打包本地專案
            prog.processing('正在打包專案為 .wmcx.zip...');
            const fhCtx = getFileHandlerCtx();

            const curId = getCurrentProjectId();
            if (curId !== localProjectId && typeof loadProject === 'function') {
                await loadProject(localProjectId);
            }

            const zipBlob = await buildProjectZip(fhCtx);

            // 上傳（真實 XHR 傳輸進度）
            await uploadFile({
                blob: zipBlob,
                name: file.name,
                token,
                fileId: file.id,
                onProgress: ({ loaded, total }) => {
                    prog.transferring({ loaded, total, direction: 'upload' });
                },
            });

            // 上傳成功才更新本地雲端同步狀態
            await setDriveMeta(localProjectId, {
                driveFileId: file.id,
                driveName: file.name,
            });

            prog.completed('專案已成功同步至雲端硬碟');
            simpleToast({ content: `已成功同步更新：${file.name}`, type: 'success', timeout: 2000 });

            setTimeout(() => {
                progressEl.remove();
                loadDriveFiles();
                card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = false);
            }, 1200);

        } catch (e) {
            prog.error(e.message || '上傳同步失敗');
            card.querySelectorAll('.drive-file-btn').forEach(btn => btn.disabled = false);
            console.error('[DriveManager] 上傳失敗:', e);
        }
    }

    // 訂閱授權狀態監聽
    const unbindAuth = onAuthChanged(() => renderState());
    const observer = new MutationObserver(() => {
        if (!document.contains(root)) {
            unbindAuth();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    renderState();
    return root;
}
