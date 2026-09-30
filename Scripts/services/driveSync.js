// Scripts/services/driveSync.js
// 負責管理本地專案與 Google Drive 雲端檔案之關聯 (drive_meta)
// 使用現有 IndexedDB 專案命名空間 (idbGetProject / idbSetProject)，不另立新資料庫。

import { idbGetProject, idbSetProject } from '../indexDB.js';
import { getFileMeta } from './driveApi.js';

const DRIVE_META_KEY = 'drive_meta';

/**
 * 取得指定專案的雲端關聯資訊
 * @param {string} projectId
 * @returns {Promise<{driveFileId: string, driveName: string, syncedAt: number}|null>}
 */
export async function getDriveMeta(projectId) {
    if (!projectId) return null;
    const meta = await idbGetProject(projectId, DRIVE_META_KEY);
    return meta || null;
}

/**
 * 寫入或更新專案的雲端關聯資訊
 * @param {string} projectId
 * @param {Object} data
 * @param {string} data.driveFileId
 * @param {string} data.driveName
 * @returns {Promise<{driveFileId: string, driveName: string, syncedAt: number}>}
 */
export async function setDriveMeta(projectId, { driveFileId, driveName }) {
    if (!projectId || !driveFileId) {
        throw new Error('儲存關聯失敗: 專案 ID 與雲端檔案 ID 均為必填項目');
    }

    const meta = {
        driveFileId,
        driveName: driveName || '專案.wmcx.zip',
        syncedAt: Date.now(),
    };

    await idbSetProject(projectId, DRIVE_META_KEY, meta);
    return meta;
}

/**
 * 解除指定專案的雲端關聯
 * @param {string} projectId
 */
export async function clearDriveMeta(projectId) {
    if (!projectId) return;
    await idbSetProject(projectId, DRIVE_META_KEY, null);
}

/**
 * 驗證雲端檔案是否仍然存在且有存取權限
 * @param {string} driveFileId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function checkFileStillValid(driveFileId, token) {
    if (!driveFileId || !token) return false;
    try {
        const meta = await getFileMeta(driveFileId, token);
        return meta !== null;
    } catch (_) {
        return false;
    }
}
