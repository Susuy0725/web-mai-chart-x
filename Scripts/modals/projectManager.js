import { projectList, projectCreate, projectDelete, projectRename, idbGetProject } from '../indexDB.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';
import { buildDriveTab } from './driveManager.js';
import { getDriveMeta, setDriveMeta, checkFileStillValid } from '../services/driveSync.js';
import { ensureSignedIn } from '../services/driveAuth.js';
import { uploadFile } from '../services/driveApi.js';
import { createTransferProgress } from '../services/transferProgress.js';
import { buildProjectZipById, triggerImportFolder, triggerImportZip } from '../features/fileHandler.js';

/**
 * 模組層級管理所有進行中的專案上傳工作
 * key: projectId, value: UploadTask
 */
const activeUploads = new Map();

function triggerAllListRefresh() {
    window.dispatchEvent(new CustomEvent('wmc:project-changed'));
    window.dispatchEvent(new CustomEvent('wmc:drive-changed'));
}

class UploadTask {
    constructor(projectId, projectName) {
        this.projectId = projectId;
        this.projectName = projectName;
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
                console.error('[UploadTask] listener error:', e);
            }
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        try {
            listener(this.status, this.statusOpts);
        } catch (e) {
            console.error('[UploadTask] initial listener error:', e);
        }
        return () => {
            this.listeners.delete(listener);
        };
    }
}

/**
 * 將上傳進度元件附加至卡片底部，並訂閱任務狀態
 */
function attachUploadProgressToCard(card, task) {
    // 禁用卡片內所有按鈕，避免上傳期間誤操作
    card.querySelectorAll('button').forEach(btn => btn.disabled = true);

    const { el: progressEl, controller: prog } = createTransferProgress({
        preparingText: t('popup.drive.preparingUpload'),
        processingText: t('popup.drive.packaging'),
        completedText: t('popup.drive.uploadSuccess'),
    });

    // 專用 class：精緻底部浮層，絕不遮蔽封面
    progressEl.classList.add('tp-wrapper--card-bottom');
    if (task.projectName) {
        progressEl.title = task.projectName;
    }
    card.appendChild(progressEl);

    let hasConnected = false;
    let unsubscribe = null;

    unsubscribe = task.subscribe((status, opts) => {
        // 卡片已脫離 DOM 樹時自動取消訂閱
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
 * 執行專案上傳邏輯
 */
async function startProjectUpload(proj, card, getFileHandlerCtx) {
    if (typeof getFileHandlerCtx !== 'function') {
        simpleToast({ content: t('popup.projectManager.fileHandlerNotReady'), type: 'error' });
        return;
    }

    if (activeUploads.has(proj.id)) {
        simpleToast({ content: t('popup.projectManager.uploadingWait'), type: 'info' });
        return;
    }

    const task = new UploadTask(proj.id, proj.name);
    activeUploads.set(proj.id, task);

    // 若當前卡片在畫面上，立刻附加進度
    if (card && card.isConnected) {
        attachUploadProgressToCard(card, task);
    }

    try {
        task.notify('preparing', { message: t('popup.drive.preparingUpload') });
        const token = await ensureSignedIn();

        const driveMeta = await getDriveMeta(proj.id);
        let targetFileId = driveMeta?.driveFileId || null;
        if (targetFileId) {
            const isValid = await checkFileStillValid(targetFileId, token);
            if (!isValid) {
                targetFileId = null;
            }
        }

        task.notify('processing', { message: t('popup.drive.packaging') });
        const zipBlob = await buildProjectZipById(proj.id);

        const baseName = proj.name || t('popup.projectManager.untitled');
        const uploadFileName = baseName.endsWith('.wmcx.zip') ? baseName : `${baseName}.wmcx.zip`;

        task.notify('transferring', { loaded: 0, total: zipBlob.size, direction: 'upload' });

        const uploadRes = await uploadFile({
            blob: zipBlob,
            name: uploadFileName,
            token,
            fileId: targetFileId,
            onProgress: ({ loaded, total }) => {
                task.notify('transferring', { loaded, total, direction: 'upload' });
            },
        });

        await setDriveMeta(proj.id, {
            driveFileId: uploadRes.id,
            driveName: uploadRes.name || uploadFileName,
        });

        task.notify('completed', { message: t('popup.drive.uploadSuccess') });
        simpleToast({
            content: t('popup.drive.toastUploadSuccess', { name: proj.name || t('popup.projectManager.untitled') }),
            type: 'success',
            timeout: 2000
        });

        setTimeout(() => {
            activeUploads.delete(proj.id);
            triggerAllListRefresh();
        }, 1200);

    } catch (err) {
        task.notify('error', { message: err.message || t('popup.drive.operationFailed') });
        console.error('[ProjectManager] 上傳失敗:', err);
        setTimeout(() => {
            activeUploads.delete(proj.id);
            triggerAllListRefresh();
        }, 3000);
    }
}

/**
 * 開啟專案總管 UI
 * @param {Object} options
 * @param {Function} options.getCurrentProjectId
 * @param {Function} options.loadProject
 * @param {Function} [options.getFileHandlerCtx]
 */
export function openProjectManager({ getCurrentProjectId, loadProject, getFileHandlerCtx }) {
    const defaultCoverUrl = 'Skin/no_image.png';
    let projectManagerPopup;

    const formatLastEdit = (timestamp) => {
        if (!timestamp) return '未知時間';
        const d = new Date(timestamp);
        if (isNaN(d.getTime())) return '未知時間';
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const makeIconButton = (iconName, tooltip, onClick, hoverColor = '#4a90e2') => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = tooltip;
        btn.style.cssText = `
            background: transparent;
            border: none;
            color: #b0b0b0;
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: color 0.15s ease, background 0.15s ease;
        `;
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.setAttribute('translate', 'no');
        icon.textContent = iconName;
        icon.style.cssText = 'font-size: 18px; line-height: 1;';
        btn.appendChild(icon);

        btn.onmouseenter = () => {
            btn.style.color = hoverColor;
            btn.style.background = 'rgba(255,255,255,0.08)';
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

    let activeRenderVersion = 0;

    const buildList = async (container) => {
        const thisRenderVersion = ++activeRenderVersion;
        const list = await projectList();

        if (thisRenderVersion !== activeRenderVersion) return;

        if (list.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.style.cssText = `
                grid-column: 1 / -1;
                text-align: center;
                color: #888;
                padding: 40px 16px;
                font-size: 13px;
            `;
            emptyEl.textContent = '尚無任何專案';
            container.innerHTML = '';
            container.appendChild(emptyEl);
            return;
        }

        // 按更新時間排序（最近的在上）
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        const currentProjectId = typeof getCurrentProjectId === 'function' ? getCurrentProjectId() : null;
        const fragment = document.createDocumentFragment();

        for (const proj of list) {
            if (thisRenderVersion !== activeRenderVersion) return;
            const isCurrent = proj.id === currentProjectId;

            const card = document.createElement('div');
            card.style.cssText = `
                position: relative;
                background: #1e1e1e;
                border: 1px solid ${isCurrent ? '#4a90e2' : '#333333'};
                border-radius: 8px;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                box-shadow: 0 2px 8px rgba(0,0,0,0.35);
                transition: border-color 0.15s ease, transform 0.15s ease;
                box-sizing: border-box;
                height: fit-content;
                min-width: 0;
                user-select: none;
                -webkit-user-select: none;
                cursor: ${isCurrent ? 'default' : 'pointer'};
            `;

            card.dataset.projectId = proj.id;

            if (!isCurrent) {
                card.onclick = async (e) => {
                    if (e.target.closest('button')) return;
                    if (activeUploads.has(proj.id)) return;
                    if (typeof loadProject === 'function') {
                        const loaded = await loadProject(proj.id);
                        simpleToast({ content: t('popup.projectManager.toastSwitched', { name: loaded?.name || proj?.name || t('popup.projectManager.untitled') }), type: 'success', timeout: 1500 });
                    }
                    //buildList(container);
                    projectManagerPopup.close();
                };
            }

            // 1:1 正方形封面圖區
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

            // 非同步載入背景圖
            idbGetProject(proj.id, 'background_image').then((bgFile) => {
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

            // 使用中徽章標籤
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

            // 雲端同步徽章標籤
            const driveMeta = await getDriveMeta(proj.id);
            if (thisRenderVersion !== activeRenderVersion) return;

            if (driveMeta?.driveFileId) {
                const isReadOnly = driveMeta.canEdit === false;
                const cloudBadge = document.createElement('div');
                cloudBadge.title = isReadOnly
                    ? `已關聯雲端檔案（唯讀）：${driveMeta.driveName || '專案.wmcx.zip'}`
                    : `已關聯雲端檔案：${driveMeta.driveName || '專案.wmcx.zip'}`;
                cloudBadge.style.cssText = `
                    position: absolute;
                    top: 6px;
                    left: 6px;
                    background: ${isReadOnly ? 'rgba(230, 81, 0, 0.9)' : 'rgba(27, 94, 32, 0.88)'};
                    color: ${isReadOnly ? '#ffe0b2' : '#a5d6a7'};
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 4px;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                `;
                const iconName = isReadOnly ? 'visibility' : 'cloud_done';
                const badgeLabel = isReadOnly
                    ? (t('popup.drive.badgeReadOnly') || '唯讀')
                    : t('popup.drive.badgeLocalSynced');
                cloudBadge.innerHTML = `<span class="material-symbols-outlined" style="font-size:12px;line-height:1;" translate="no">${iconName}</span><span>${badgeLabel}</span>`;
                coverContainer.appendChild(cloudBadge);
            }

            card.appendChild(coverContainer);

            // 下方資訊區
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
            lastEditSpan.textContent = `編輯：${formatLastEdit(proj.updatedAt || proj.createdAt)}`;
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

            // 按鈕組
            const btnRow = document.createElement('div');
            btnRow.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 4px;
                margin-top: 4px;
            `;

            // 上傳／同步至雲端按鈕（唯讀專案不開放上傳複寫）
            const isReadOnly = driveMeta?.canEdit === false;
            if (!isReadOnly) {
                const uploadTooltip = driveMeta?.driveFileId
                    ? t('popup.drive.uploadBtn')
                    : t('popup.drive.uploadInitialBtn');
                const uploadColor = driveMeta?.driveFileId ? '#66bb6a' : '#4a90e2';

                const uploadBtn = makeIconButton('cloud_upload', uploadTooltip, async () => {
                    if (activeUploads.has(proj.id)) return;
                    startProjectUpload(proj, card, getFileHandlerCtx);
                }, uploadColor);
                btnRow.appendChild(uploadBtn);
            }

            // 重新命名按鈕
            const renameBtn = makeIconButton('edit', '重新命名', async () => {
                if (activeUploads.has(proj.id)) return;
                const newName = prompt('請輸入新的專案名稱：', proj.name || '');
                if (newName !== null && newName.trim() !== '') {
                    await projectRename(proj.id, newName.trim());
                    triggerAllListRefresh();
                }
            }, '#4a90e2');
            btnRow.appendChild(renameBtn);

            // 刪除按鈕
            const deleteBtn = makeIconButton('delete', '刪除專案', async () => {
                if (activeUploads.has(proj.id)) return;
                const projTitle = proj.name || t('popup.projectManager.untitled');
                if (!confirm(t('popup.projectManager.confirmDelete', { name: projTitle }))) return;

                if (isCurrent) {
                    const allProjects = await projectList();
                    const remaining = allProjects
                        .filter(p => p.id !== proj.id)
                        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

                    if (remaining.length > 0) {
                        const targetProj = remaining[0];
                        if (typeof loadProject === 'function') {
                            await loadProject(targetProj.id);
                        }
                        await projectDelete(proj.id);
                        triggerAllListRefresh();
                        simpleToast({
                            content: t('popup.projectManager.toastDeleteAndSwitch', { name: targetProj.name || t('popup.projectManager.untitled') }),
                            type: 'success',
                            timeout: 1500
                        });
                    } else {
                        const newId = await projectCreate(t('popup.projectManager.untitled'));
                        if (typeof loadProject === 'function') {
                            await loadProject(newId);
                        }
                        await projectDelete(proj.id);
                        triggerAllListRefresh();
                        simpleToast({
                            content: t('popup.projectManager.toastDeleteAndNew'),
                            type: 'success',
                            timeout: 1500
                        });
                    }
                    return;
                }

                await projectDelete(proj.id);
                triggerAllListRefresh();
                simpleToast({ content: t('popup.projectManager.toastDeleted'), type: 'success', timeout: 1200 });
            }, '#ef5350');
            btnRow.appendChild(deleteBtn);

            body.appendChild(btnRow);
            card.appendChild(body);

            // 若該專案正在上傳中，立即掛載進度浮層並自動同步真實進度
            if (activeUploads.has(proj.id)) {
                const task = activeUploads.get(proj.id);
                attachUploadProgressToCard(card, task);
            }

            fragment.appendChild(card);
        }

        if (thisRenderVersion !== activeRenderVersion) return;
        container.innerHTML = '';
        container.appendChild(fragment);
    };

    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'pm-main-container';

    // 頂部分頁切換列
    const tabBar = document.createElement('div');
    tabBar.className = 'pm-tab-bar';

    const localTabBtn = document.createElement('button');
    localTabBtn.type = 'button';
    localTabBtn.className = 'pm-tab-btn pm-tab-btn--active';
    localTabBtn.textContent = t('popup.drive.localTab');

    const driveTabBtn = document.createElement('button');
    driveTabBtn.type = 'button';
    driveTabBtn.className = 'pm-tab-btn';
    driveTabBtn.textContent = t('popup.drive.driveTab');

    tabBar.append(localTabBtn, driveTabBtn);

    // 本地專案容器（完全保留原有邏輯）
    const localContainer = document.createElement('div');
    localContainer.className = 'project-manager-grid popup-list';
    buildList(localContainer);

    let refreshPending = false;
    const scheduleRefresh = () => {
        if (!localContainer.isConnected) {
            window.removeEventListener('wmc:project-changed', onProjectChanged);
            return;
        }
        if (refreshPending) return;
        refreshPending = true;
        queueMicrotask(() => {
            refreshPending = false;
            if (localContainer.isConnected) {
                buildList(localContainer);
            }
        });
    };

    const onProjectChanged = () => {
        scheduleRefresh();
    };
    window.addEventListener('wmc:project-changed', onProjectChanged);

    // 雲端專案容器
    const driveContainer = document.createElement('div');
    driveContainer.className = 'pm-tab-content pm-tab-content--drive popup-list';
    driveContainer.style.display = 'none';

    if (typeof getFileHandlerCtx === 'function') {
        const driveTab = buildDriveTab({
            loadProject,
            getCurrentProjectId,
            getFileHandlerCtx,
            refreshLocalList: scheduleRefresh,
        });
        driveContainer.appendChild(driveTab);
    } else {
        const notice = document.createElement('div');
        notice.style.cssText = 'color:#888;padding:24px;text-align:center;font-size:13px;';
        notice.textContent = '尚未提供檔案處理器 Context';
        driveContainer.appendChild(notice);
    }

    // 分頁切換監聽
    localTabBtn.onclick = () => {
        localTabBtn.classList.add('pm-tab-btn--active');
        driveTabBtn.classList.remove('pm-tab-btn--active');
        localContainer.style.display = '';
        driveContainer.style.display = 'none';
    };

    driveTabBtn.onclick = () => {
        driveTabBtn.classList.add('pm-tab-btn--active');
        localTabBtn.classList.remove('pm-tab-btn--active');
        localContainer.style.display = 'none';
        driveContainer.style.display = 'flex';
    };

    mainWrapper.append(tabBar, localContainer, driveContainer);

    projectManagerPopup = popupWindow({
        title: "專案總管",
        customContent: mainWrapper,
        width: 760,
        maxWidth: 840,
        onClose: () => {
            window.removeEventListener('wmc:project-changed', onProjectChanged);
        },
        buttons: [
            {
                text: t('popup.projectManager.importFolder') || '匯入資料夾',
                onClick: () => {
                    if (typeof getFileHandlerCtx !== 'function') {
                        simpleToast({ content: t('popup.projectManager.fileHandlerNotReady'), type: 'error' });
                        return;
                    }
                    triggerImportFolder(getFileHandlerCtx(), {
                        onComplete: () => triggerAllListRefresh()
                    });
                }
            },
            {
                text: t('popup.projectManager.importZip') || '匯入壓縮檔',
                onClick: () => {
                    if (typeof getFileHandlerCtx !== 'function') {
                        simpleToast({ content: t('popup.projectManager.fileHandlerNotReady'), type: 'error' });
                        return;
                    }
                    triggerImportZip(getFileHandlerCtx(), {
                        onComplete: () => triggerAllListRefresh()
                    });
                }
            },
            {
                text: t('popup.projectManager.newBlankProject') || "新建空白專案",
                onClick: async () => {
                    const name = prompt(t('popup.projectManager.newProjectPrompt'), t('popup.projectManager.untitled'));
                    if (name === null) return;
                    const newId = await projectCreate(name.trim() || t('popup.projectManager.untitled'));
                    if (typeof loadProject === 'function') {
                        const proj = await loadProject(newId);
                        simpleToast({ content: t('popup.projectManager.toastSwitched', { name: proj?.name || t('popup.projectManager.untitled') }), type: 'success', timeout: 1500 });
                    }
                    triggerAllListRefresh();
                }
            }
        ]
    });
    return projectManagerPopup;
}

