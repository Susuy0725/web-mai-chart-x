/**
 * wmcxPackage.js
 * 
 * 職責：
 * 接收提取層（wmcxExtract.js）回傳的資料結構，
 * 組裝為標準目錄結構（wmcx_output/settings.json 與各專案目錄），
 * 透過 JSZip 生成壓縮檔 Blob，並提供下載觸發輔助函式。
 */

import { extractSimaiEditorData } from '../core/wmcxExtract.js';
import { t } from '../i18n.js';

/**
 * 確保 JSZip 函式庫已載入
 * 優先讀取 window.JSZip，若無則依序嘗試相對路徑與 CDN
 * @returns {Promise<any>}
 */
export async function ensureJSZip() {
    if (typeof window !== 'undefined' && window.JSZip) {
        return window.JSZip;
    }

    // 嘗試從本地相對路徑載入
    const localUrl = new URL('../jszip.min.js', import.meta.url).href;
    try {
        await loadScript(localUrl);
        if (window.JSZip) return window.JSZip;
    } catch (_) {}

    // 備用 CDN
    const cdnUrl = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    await loadScript(cdnUrl);

    if (window.JSZip) {
        return window.JSZip;
    }
    throw new Error('無法載入 JSZip 函式庫，打包流程中斷。');
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`腳本載入失敗: ${src}`));
        document.head.appendChild(script);
    });
}

/**
 * 將提取層資料結構打包為符合 wmcx_output 階層的 ZIP Blob
 * @param {object} extractedData - extractSimaiEditorData 回傳之物件
 * @param {object} [options]
 * @param {string} [options.rootFolderName='wmcx_output'] - ZIP 內的根目錄名稱
 * @param {(progress: { percent: number, currentFile: string, message: string }) => void} [options.onProgress]
 * @returns {Promise<Blob>}
 */
export async function packageWmcxData(extractedData, options = {}) {
    if (!extractedData || typeof extractedData !== 'object') {
        throw new Error('[wmcxPackage] 無效的提取資料，無法執行打包。');
    }

    const {
        rootFolderName = 'wmcx_output',
        selectedProjectIds = null,
        includeSettings = true,
        onProgress
    } = options;

    const JSZip = await ensureJSZip();
    const zip = new JSZip();

    // 1. 建立根目錄 wmcx_output
    const root = rootFolderName ? zip.folder(rootFolderName) : zip;

    // 2. 篩選欲匯出的專案清單
    let projects = extractedData.projects || [];
    if (Array.isArray(selectedProjectIds)) {
        const idSet = new Set(selectedProjectIds);
        projects = projects.filter(p => idSet.has(p.id));
    }

    // 3. 寫入 settings.json（僅在 includeSettings 為 true 時寫入，並嚴格過濾 projectsMeta）
    if (includeSettings && extractedData.settingsEnvelope) {
        // 深拷貝 settingsEnvelope，避免污染原始提取快照
        const filteredEnvelope = JSON.parse(JSON.stringify(extractedData.settingsEnvelope));
        if (filteredEnvelope.projectsMeta) {
            const selectedDirNames = new Set(projects.map(p => p.dirName));
            const newMeta = {};
            for (const [dirName, meta] of Object.entries(filteredEnvelope.projectsMeta)) {
                if (selectedDirNames.has(dirName)) {
                    newMeta[dirName] = meta;
                }
            }
            filteredEnvelope.projectsMeta = newMeta;
        }
        const settingsJsonStr = JSON.stringify(filteredEnvelope, null, 2);
        root.file('settings.json', settingsJsonStr);
    }

    // 4. 逐一寫入勾選的專案至 ZIP
    const totalProjects = projects.length;
    let projIdx = 0;

    for (const project of projects) {
        projIdx++;
        if (typeof onProgress === 'function') {
            const pct = Math.round((projIdx / (totalProjects + 1)) * 35);
            try {
                onProgress({
                    percent: pct,
                    currentFile: project.name,
                    message: t('popup.maintenance.preparingAssets', { current: projIdx, total: totalProjects, name: project.name })
                });
            } catch (_) {}
        }

        const projFolder = root.folder(project.dirName);

        // 譜面檔案
        projFolder.file('maidata.txt', project.maidataText || '');

        // 媒體資源
        if (project.bg?.blob) {
            projFolder.file(project.bg.filename, project.bg.blob);
        }
        if (project.track?.blob) {
            projFolder.file(project.track.filename, project.track.blob);
        }
        if (project.pv?.blob) {
            projFolder.file(project.pv.filename, project.pv.blob);
        }
    }

    // 5. 生成壓縮檔 Blob 並回報壓縮進度 (35% ~ 100%)
    const zipBlob = await zip.generateAsync(
        {
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        },
        (metadata) => {
            if (typeof onProgress === 'function') {
                const pct = 35 + Math.round((metadata.percent / 100) * 65);
                try {
                    onProgress({
                        percent: pct,
                        currentFile: metadata.currentFile || '',
                        message: t('popup.maintenance.compressing', {
                            percent: pct,
                            file: metadata.currentFile || t('popup.maintenance.packaging')
                        })
                    });
                } catch (_) {}
            }
        }
    );

    return zipBlob;
}

/**
 * 觸發瀏覽器下載 Blob 檔案
 * @param {Blob} blob 
 * @param {string} filename 
 */
export function triggerDownload(blob, filename = 'wmcx_output.zip') {
    if (!blob || !(blob instanceof Blob)) {
        throw new Error('[wmcxPackage] 下載失敗：輸入並非有效的 Blob 物件。');
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 釋放記憶體 URL
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

/**
 * 一鍵式全流程便利函式：自動連接提取層並打包下載
 * @param {object} [options]
 * @param {boolean} [options.autoDownload=true] - 打包完成後是否自動觸發下載
 * @param {string} [options.downloadFilename='wmcx_output.zip'] - 下載檔案名稱
 * @param {string} [options.rootFolderName='wmcx_output'] - 根目錄名稱
 * @param {(progress: { phase: 'extract'|'package', percent: number, message: string }) => void} [options.onProgress]
 * @returns {Promise<{ zipBlob: Blob, extractedData: object }>}
 */
export async function exportWmcxZip(options = {}) {
    const {
        autoDownload = true,
        downloadFilename = 'wmcx_output.zip',
        rootFolderName = 'wmcx_output',
        onProgress
    } = options;

    // 1. 執行提取
    const extractedData = await extractSimaiEditorData({
        onProgress: (p) => {
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'extract',
                    percent: Math.round((p.current / p.total) * 50), // 提取佔前 50%
                    message: p.message
                });
            }
        }
    });

    // 2. 執行打包
    const zipBlob = await packageWmcxData(extractedData, {
        rootFolderName,
        onProgress: (p) => {
            if (typeof onProgress === 'function') {
                onProgress({
                    phase: 'package',
                    percent: 50 + Math.round((p.percent / 100) * 50), // 打包佔後 50%
                    message: p.message
                });
            }
        }
    });

    // 3. 自動觸發下載
    if (autoDownload) {
        triggerDownload(zipBlob, downloadFilename);
    }

    return { zipBlob, extractedData };
}
