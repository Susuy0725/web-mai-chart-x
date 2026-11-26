/**
 * wmcxRestore.js
 * 
 * 職責：
 * 與 wmcxPackage.js / wmcxExtract.js 成對的還原模組。
 * 負責讀取並解壓 wmcx_output.zip，將其內的 settings.json 與各專案資料夾
 * （maidata.txt、track.*、bg.*、pv.*）完整還原至本機 IndexedDB (SimaiEditorDB)。
 */

import { ensureJSZip } from './wmcxPackage.js';
import { projectCreate, projectList, idbSetProject, idbSet } from '../indexDB.js';
import { t } from '../i18n.js';

/**
 * 解析 maidata.txt 內容為鍵值物件
 * @param {string} raw 
 * @returns {object}
 */
export function parseMaidata(raw) {
    if (!raw || typeof raw !== 'string') return {};
    const maidata = {};
    raw.split('&').forEach(part => {
        const idx = part.indexOf('=');
        if (idx > 0) {
            const key = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();
            if (key) maidata[key] = value;
        }
    });
    return maidata;
}

/**
 * 快速預覽並檢測 ZIP 檔案結構（不解壓大二進制檔）
 * @param {File|Blob} zipFile 
 * @returns {Promise<{
 *   hasSettings: boolean,
 *   settingsCount: number,
 *   projects: Array<{
 *     dirName: string,
 *     name: string,
 *     hasMaidata: boolean,
 *     trackFilename: string|null,
 *     bgFilename: string|null,
 *     pvFilename: string|null
 *   }>
 * }>}
 */
export async function inspectWmcxZip(zipFile) {
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(zipFile);

    let rootPrefix = '';
    const fileKeys = Object.keys(zip.files);
    if (fileKeys.some(k => k.startsWith('wmcx_output/'))) {
        rootPrefix = 'wmcx_output/';
    }

    // 檢查 settings.json
    let hasSettings = false;
    let settingsCount = 0;
    let projectsMeta = {};
    const settingsEntry = zip.file(`${rootPrefix}settings.json`) || zip.file('settings.json');
    if (settingsEntry) {
        hasSettings = true;
        try {
            const text = await settingsEntry.async('string');
            const parsed = JSON.parse(text);
            const settingsObj = parsed.settings || parsed;
            settingsCount = Object.keys(settingsObj).length;
            projectsMeta = parsed.projectsMeta || {};
        } catch (_) {}
    }

    // 取得所有專案資料夾名稱
    const projectFolderNames = new Set();
    fileKeys.forEach(k => {
        const relativePath = rootPrefix ? (k.startsWith(rootPrefix) ? k.slice(rootPrefix.length) : '') : k;
        if (!relativePath || relativePath.startsWith('settings.json')) return;
        if (relativePath.includes('../') || relativePath.includes('..\\')) return;

        const segments = relativePath.split('/');
        if (segments.length >= 2 && segments[0].trim().length > 0) {
            projectFolderNames.add(segments[0]);
        }
    });

    const projects = [];
    for (const folderName of projectFolderNames) {
        const folderPath = `${rootPrefix}${folderName}/`;
        const projectFiles = fileKeys.filter(k => k.startsWith(folderPath) && !k.endsWith('/'));

        let maidataTitle = '';
        let hasMaidata = false;
        const maidataFile = zip.file(`${folderPath}maidata.txt`);
        if (maidataFile) {
            hasMaidata = true;
            try {
                const text = await maidataFile.async('string');
                const parsed = parseMaidata(text);
                if (parsed.title) maidataTitle = parsed.title.trim();
            } catch (_) {}
        }

        let trackFilename = null;
        let bgFilename = null;
        let pvFilename = null;

        for (const fullPath of projectFiles) {
            const fileName = fullPath.slice(folderPath.length);
            const lowerName = fileName.toLowerCase();
            if (lowerName.startsWith('track.')) trackFilename = fileName;
            else if (lowerName.startsWith('bg.')) bgFilename = fileName;
            else if (lowerName.startsWith('pv.')) pvFilename = fileName;
        }

        const displayName = maidataTitle || folderName;
        projects.push({
            dirName: folderName,
            name: displayName,
            hasMaidata,
            trackFilename,
            bgFilename,
            pvFilename,
            meta: projectsMeta[folderName] || projectsMeta[displayName] || null
        });
    }

    return {
        hasSettings,
        settingsCount,
        projects
    };
}

/**
 * 從 ZIP 檔案還原使用者設定與所有專案
 * @param {File|Blob} zipFile - 使用者上傳的 .zip 檔案
 * @param {object} [options]
 * @param {boolean} [options.includeSettings=true] - 是否還原全域設定
 * @param {Array<string>|null} [options.selectedFolderNames=null] - 欲還原的專案目錄清單（若為 null 則還原全部）
 * @param {(progress: { percent: number, message: string, currentProject: string }) => void} [options.onProgress]
 * @returns {Promise<{ importedProjectsCount: number, settingsRestored: boolean, projects: Array<{ id: string, name: string }> }>}
 */
export async function restoreWmcxZip(zipFile, options = {}) {
    const {
        includeSettings = true,
        selectedFolderNames = null,
        onProgress
    } = options;

    const report = (percent, message, currentProject = '') => {
        if (typeof onProgress === 'function') {
            try {
                onProgress({ percent, message, currentProject });
            } catch (_) {}
        }
    };

    report(5, t('popup.maintenance.readingZip'));
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(zipFile);

    // 1. 判定根目錄位置（支援包含外層 wmcx_output/ 或直接位於根層）
    let rootPrefix = '';
    const fileKeys = Object.keys(zip.files);

    const hasWmcxPrefix = fileKeys.some(k => k.startsWith('wmcx_output/'));
    if (hasWmcxPrefix) {
        rootPrefix = 'wmcx_output/';
    }

    // 2. 尋找並還原 settings.json
    let settingsRestored = false;
    let projectsMeta = {};
    const settingsEntry = zip.file(`${rootPrefix}settings.json`) || zip.file('settings.json');

    if (includeSettings && settingsEntry) {
        report(15, t('popup.maintenance.restoringSettings'));
        try {
            const settingsJsonText = await settingsEntry.async('string');
            const envelope = JSON.parse(settingsJsonText);

            // 取出 settings 本體與 projectsMeta
            const settingsToSave = envelope.settings ? envelope.settings : envelope;
            projectsMeta = envelope.projectsMeta || {};

            // 寫入 IndexedDB
            await idbSet('simai_settings', JSON.stringify(settingsToSave));

            // 若在視窗環境，同步更新全域 settings
            if (typeof window !== 'undefined' && window.settings) {
                Object.assign(window.settings, settingsToSave);
            }

            settingsRestored = true;
        } catch (e) {
            console.warn('[wmcxRestore] 還原 settings.json 失敗:', e);
        }
    } else if (settingsEntry) {
        // 即使不還原設定，也嘗試解析 projectsMeta 供專案狀態還原
        try {
            const settingsJsonText = await settingsEntry.async('string');
            const envelope = JSON.parse(settingsJsonText);
            projectsMeta = envelope.projectsMeta || {};
        } catch (_) {}
    }

    // 3. 識別各專案資料夾
    // 目標資料夾路徑形如: `${rootPrefix}{folderName}/...`
    report(25, t('popup.maintenance.analyzingProjects'));
    const projectFolderNames = new Set();

    fileKeys.forEach(k => {
        // 去除外層 rootPrefix
        const relativePath = rootPrefix ? (k.startsWith(rootPrefix) ? k.slice(rootPrefix.length) : '') : k;
        if (!relativePath || relativePath.startsWith('settings.json')) return;

        // 安全檢驗：嚴格禁止路徑穿透
        if (relativePath.includes('../') || relativePath.includes('..\\')) {
            console.warn('[wmcxRestore] 略過危險路徑:', relativePath);
            return;
        }

        const segments = relativePath.split('/');
        if (segments.length >= 2 && segments[0].trim().length > 0) {
            projectFolderNames.add(segments[0]);
        }
    });

    let folderList = Array.from(projectFolderNames);

    // 根據 selectedFolderNames 進行過濾
    if (Array.isArray(selectedFolderNames)) {
        const folderSet = new Set(selectedFolderNames);
        folderList = folderList.filter(f => folderSet.has(f));
    }
    const totalProjects = folderList.length;
    const importedProjects = [];

    // 取得目前已有的專案名稱以供防衝突對照
    const existingList = await projectList();
    const existingNames = new Set(existingList.map(p => p.name));

    // 4. 逐一還原每個專案
    for (let i = 0; i < totalProjects; i++) {
        const folderName = folderList[i];
        const folderPath = `${rootPrefix}${folderName}/`;

        const percent = 25 + Math.round(((i + 1) / totalProjects) * 70);
        report(percent, t('popup.maintenance.restoringProject', { current: i + 1, total: totalProjects, name: folderName }), folderName);

        // 讀取 maidata.txt
        let maidataText = '';
        let parsedMaidata = null;
        const maidataFile = zip.file(`${folderPath}maidata.txt`);
        if (maidataFile) {
            try {
                maidataText = await maidataFile.async('string');
                parsedMaidata = parseMaidata(maidataText);
            } catch (e) {
                console.warn(`[wmcxRestore] 解析 ${folderName}/maidata.txt 失敗:`, e);
            }
        }

        // 決定專案名稱（優先取 maidata 標題，次取資料夾名稱）
        let baseName = (parsedMaidata && parsedMaidata.title && parsedMaidata.title.trim())
            ? parsedMaidata.title.trim()
            : folderName;

        // 避免與現有專案同名衝突
        let targetProjectName = baseName;
        if (existingNames.has(targetProjectName)) {
            let counter = 1;
            while (existingNames.has(`${baseName} (匯入 ${counter})`)) {
                counter++;
            }
            targetProjectName = `${baseName} (匯入 ${counter})`;
        }
        existingNames.add(targetProjectName);

        // 建立新專案
        const newProjectId = await projectCreate(targetProjectName);

        // 儲存 maidata
        if (parsedMaidata) {
            await idbSetProject(newProjectId, 'maidata', parsedMaidata);
        }

        // 掃描專案目錄下的所有檔案以找出素材
        const projectFiles = fileKeys.filter(k => k.startsWith(folderPath) && !k.endsWith('/'));

        for (const fullPath of projectFiles) {
            const fileName = fullPath.slice(folderPath.length);
            const lowerName = fileName.toLowerCase();
            const fileEntry = zip.file(fullPath);
            if (!fileEntry) continue;

            // 音訊: track.*
            if (lowerName.startsWith('track.')) {
                try {
                    const blob = await fileEntry.async('blob');
                    const fileObj = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
                    await idbSetProject(newProjectId, 'resource_bgm', fileObj);
                } catch (e) {
                    console.warn(`[wmcxRestore] 儲存音訊失敗 (${fileName}):`, e);
                }
            }
            // 背景圖: bg.*
            else if (lowerName.startsWith('bg.')) {
                try {
                    const blob = await fileEntry.async('blob');
                    const fileObj = new File([blob], fileName, { type: blob.type || 'image/png' });
                    await idbSetProject(newProjectId, 'background_image', fileObj);
                } catch (e) {
                    console.warn(`[wmcxRestore] 儲存背景圖失敗 (${fileName}):`, e);
                }
            }
            // 背景影片: pv.*
            else if (lowerName.startsWith('pv.')) {
                try {
                    const blob = await fileEntry.async('blob');
                    const fileObj = new File([blob], fileName, { type: blob.type || 'video/mp4' });
                    await idbSetProject(newProjectId, 'background_video', fileObj);
                } catch (e) {
                    console.warn(`[wmcxRestore] 儲存背景影片失敗 (${fileName}):`, e);
                }
            }
        }

        // 還原專案狀態中繼資料 (若 projectsMeta 中有記錄)
        const meta = projectsMeta[folderName] || projectsMeta[baseName] || {};
        const nowDiff = typeof meta.nowDifficulty === 'number' ? meta.nowDifficulty : 5;
        const readyBeat = typeof meta.readyBeat === 'boolean' ? meta.readyBeat : true;

        await idbSetProject(newProjectId, 'now_difficulty', nowDiff);
        await idbSetProject(newProjectId, 'ready_beat', readyBeat);

        if (meta.timeControl !== undefined && meta.timeControl !== null) {
            await idbSetProject(newProjectId, 'timeControl', meta.timeControl);
        }
        if (meta.hideEditor !== undefined && meta.hideEditor !== null) {
            await idbSetProject(newProjectId, 'hide_editor', meta.hideEditor);
        }

        importedProjects.push({
            id: newProjectId,
            name: targetProjectName
        });
    }

    report(100, t('popup.maintenance.restoreDone'));

    // 觸發全域專案變更事件，通知各介面刷新清單
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wmc:project-changed'));
    }

    return {
        importedProjectsCount: importedProjects.length,
        settingsRestored,
        projects: importedProjects
    };
}
