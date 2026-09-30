// Scripts/services/driveOpenWith.js
// 專門處理來自 Google Drive "Open with" (以此應用程式開啟) 的跳轉狀態
// 包含 URL state 解析、網址列清理、登入引導、進度提示、檔案下載與自動載入

import { isSignedIn, signIn, ensureSignedIn } from './driveAuth.js';
import { getFileMeta, downloadFile } from './driveApi.js';
import { setDriveMeta, findProjectByDriveFileId } from './driveSync.js';
import { createTransferProgress } from './transferProgress.js';
import { saveProjectZipToIDB } from '../features/fileHandler.js';
import { popupWindow, simpleToast } from '../helper.js';
import { t } from '../i18n.js';

/**
 * 解析 Google Drive Open With 狀態參數
 * @returns {{ action: string, fileId: string, userId?: string } | null}
 */
export function parseDriveOpenState() {
    try {
        const rawState = new URLSearchParams(window.location.search).get('state');
        if (!rawState) return null;
        const state = JSON.parse(rawState);
        if (state.action === 'open' && Array.isArray(state.ids) && state.ids.length > 0 && state.ids[0]) {
            return {
                action: 'open',
                fileId: state.ids[0],
                userId: state.userId || null
            };
        }
    } catch (e) {
        console.warn('[DriveOpenWith] 解析 state 參數失敗:', e);
    }
    return null;
}

/**
 * 檢查並執行 Google Drive Open With 處理流程
 * @param {Object} options
 * @param {Function} options.loadProject
 */
export async function checkAndHandleDriveOpenWith({ loadProject }) {
    const openState = parseDriveOpenState();
    if (!openState) return;

    const fileId = openState.fileId;

    // 立即清除網址列的 ?state=...，避免使用者重新整理頁面時重複觸發
    try {
        const cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
    } catch (_) {}

    console.log('[DriveOpenWith] 偵測到 Google Drive 開啟請求，File ID:', fileId);

    // 1. 確認登入狀態（若未登入則彈窗引導使用者登入）
    if (!isSignedIn()) {
        const proceed = await new Promise((resolve) => {
            popupWindow({
                title: t('popup.driveOpen.title'),
                content: t('popup.driveOpen.needAuth'),
                width: 440,
                buttons: [
                    {
                        text: t('popup.driveOpen.signInBtn'),
                        onClick: async (pCtx) => {
                            pCtx.close();
                            try {
                                await signIn();
                                resolve(true);
                            } catch (err) {
                                console.warn('[DriveOpenWith] 使用者取消或登入失敗:', err);
                                simpleToast({ content: t('popup.driveOpen.authCancelled'), type: 'info', timeout: 2000 });
                                resolve(false);
                            }
                        }
                    },
                    {
                        text: t('popup.driveOpen.cancelBtn'),
                        onClick: (pCtx) => {
                            pCtx.close();
                            resolve(false);
                        }
                    }
                ]
            });
        });

        if (!proceed || !isSignedIn()) {
            return;
        }
    }

    // 2. 準備進度彈窗介面
    const { el: progressEl, controller: prog } = createTransferProgress({
        preparingText: t('popup.drive.preparingDownload'),
        processingText: t('popup.drive.unpacking'),
        completedText: t('popup.drive.downloadSuccess'),
    });

    const modalWrapper = document.createElement('div');
    modalWrapper.style.padding = '8px 0';
    modalWrapper.appendChild(progressEl);

    let progressPopup = popupWindow({
        title: t('popup.driveOpen.title'),
        customContent: modalWrapper,
        width: 460,
        unclosable: true,
        buttons: []
    });

    try {
        prog.preparing();
        const token = await ensureSignedIn();

        // 3. 取得雲端檔案資訊
        let fileName = 'cloud_project.wmcx.zip';
        try {
            const meta = await getFileMeta(fileId, token);
            if (meta?.name) fileName = meta.name;
        } catch (e) {
            console.warn('[DriveOpenWith] 取得檔案中繼資料失敗，使用預設檔名:', e);
        }

        // 4. 檢查本機是否已有該檔案關聯
        const existing = await findProjectByDriveFileId(fileId);
        let targetProjectId = null;

        if (existing?.project) {
            // 暫時關閉進度視窗，彈窗詢問使用者是否覆蓋
            if (progressPopup) {
                progressPopup.close();
                progressPopup = null;
            }

            const userChoice = await new Promise((resolve) => {
                popupWindow({
                    title: t('popup.driveOpen.title'),
                    content: t('popup.driveOpen.overwritePrompt', { name: existing.project.name || fileName }),
                    width: 440,
                    buttons: [
                        {
                            text: t('popup.driveOpen.overwriteBtn'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                resolve('overwrite');
                            }
                        },
                        {
                            text: t('popup.driveOpen.newProjectBtn'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                resolve('new');
                            }
                        },
                        {
                            text: t('popup.driveOpen.cancelBtn'),
                            onClick: (pCtx) => {
                                pCtx.close();
                                resolve('cancel');
                            }
                        }
                    ]
                });
            });

            if (userChoice === 'cancel') return;
            if (userChoice === 'overwrite') {
                targetProjectId = existing.project.id;
            }

            // 重新打開進度彈窗
            modalWrapper.innerHTML = '';
            modalWrapper.appendChild(progressEl);
            progressPopup = popupWindow({
                title: t('popup.driveOpen.title'),
                customContent: modalWrapper,
                width: 460,
                unclosable: true,
                buttons: []
            });
        }

        // 5. 下載檔案
        const blob = await downloadFile(fileId, token, ({ loaded, total }) => {
            prog.transferring({ loaded, total, direction: 'download' });
        });

        // 6. 背景解壓並寫入 IndexedDB
        prog.processing(t('popup.drive.unpacking'));
        const defaultName = fileName.replace(/\.wmcx\.zip$/i, '') || t('popup.projectManager.untitled');
        const { projectId: finalProjectId, projectName: savedName } = await saveProjectZipToIDB(blob, defaultName, targetProjectId);

        // 7. 更新本地關聯
        await setDriveMeta(finalProjectId, {
            driveFileId: fileId,
            driveName: fileName
        });

        prog.completed(t('popup.drive.downloadSuccess'));

        // 8. 載入至主畫面
        if (typeof loadProject === 'function') {
            await loadProject(finalProjectId);
        }

        simpleToast({
            content: t('popup.driveOpen.toastOpenSuccess', { name: savedName || defaultName }),
            type: 'success',
            timeout: 2500
        });

        setTimeout(() => {
            if (progressPopup) progressPopup.close();
        }, 800);
    } catch (err) {
        console.error('[DriveOpenWith] 流程失敗:', err);
        prog.error(err.message || t('popup.drive.operationFailed'));
        setTimeout(() => {
            if (progressPopup) progressPopup.close();
        }, 3000);
    }
}
