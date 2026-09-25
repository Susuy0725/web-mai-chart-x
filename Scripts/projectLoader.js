import { idbSetProject } from './indexDB.js';

/**
 * 專案檔案讀取與模組化解析器 (Project Loader)
 * 統一 PC 編輯器與 Play 播放器的資料夾 / ZIP 匯入解析與持久化
 */

/**
 * 將 FileList、Array 或 JSZip.files 結構統一展平為 File 陣列
 * @param {FileList|File[]|Object} files 
 * @returns {Promise<File[]>}
 */
export async function normalizeFiles(files) {
    const entries = [];
    if (!files) return entries;

    if (typeof files.length === 'number' && typeof files.item === 'function') {
        // FileList
        for (let i = 0; i < files.length; i++) {
            const f = files.item(i);
            if (f) entries.push(f);
        }
    } else if (Array.isArray(files)) {
        // Array of File
        for (let i = 0; i < files.length; i++) {
            if (files[i]) entries.push(files[i]);
        }
    } else if (typeof files === 'object') {
        // JSZip.files mapping
        for (const name in files) {
            if (!Object.prototype.hasOwnProperty.call(files, name)) continue;
            const zf = files[name];
            if (zf.dir) continue; // 略過資料夾目錄項
            if (typeof zf.async === 'function') {
                try {
                    const blob = await zf.async('blob');
                    const baseName = name.replace(/\\/g, '/').split('/').pop();
                    entries.push(new File([blob], baseName, { type: blob.type || '' }));
                } catch (e) {
                    console.warn('[ProjectLoader] 從 ZIP 讀取檔案失敗:', name, e);
                }
            }
        }
    } else {
        console.warn('[ProjectLoader] 未知的 files 參數型別:', files);
    }

    return entries;
}

/**
 * 解析專案資源包
 * @param {File[]} entries 
 * @returns {Promise<{ maidata: string|null, bgm: File|null, bgImage: File|null, bgVideo: File|null }>}
 */
export async function parseProjectBundle(entries) {
    const bundle = {
        maidata: null,
        bgm: null,
        bgImage: null,
        bgVideo: null
    };

    if (!Array.isArray(entries)) return bundle;

    for (let i = 0; i < entries.length; i++) {
        const file = entries[i];
        const baseName = (file.name || '').replace(/\\/g, '/').split('/').pop();
        const lowerName = baseName.toLowerCase();
        const ext = (baseName.split('.').pop() || '').toLowerCase();

        const isVideo = ((file.type || '').startsWith('video/')) || ['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv', 'ogg'].includes(ext);
        const isImage = ((file.type || '').startsWith('image/')) || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff'].includes(ext);

        // 音樂檔
        if (lowerName.startsWith('track.')) {
            bundle.bgm = file;
        }

        // 譜面檔
        if (lowerName.startsWith('maidata.')) {
            try {
                const text = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result || '');
                    reader.onerror = (err) => reject(err);
                    reader.readAsText(file);
                });
                bundle.maidata = text;
            } catch (err) {
                console.error('[ProjectLoader] 讀取 maidata 失敗:', err);
            }
        }

        // 背景圖片 / 影片
        if (lowerName.startsWith('bg.')) {
            if (isVideo) {
                bundle.bgVideo = file;
            } else if (isImage) {
                bundle.bgImage = file;
            }
        }

        // 背景影片 pv.*
        if (lowerName.startsWith('pv.')) {
            if (isVideo) {
                bundle.bgVideo = file;
            }
        }
    }

    return bundle;
}

/**
 * 將解析後的專案內容持久化寫入 IndexedDB
 * @param {string} projectId 
 * @param {{ maidata?: string|null, bgm?: File|null, bgImage?: File|null, bgVideo?: File|null }} bundle 
 * @returns {Promise<void>}
 */
export async function saveProjectToIdb(projectId, bundle) {
    if (!projectId || !bundle) return;

    const tasks = [];

    if (bundle.maidata !== undefined && bundle.maidata !== null) {
        tasks.push(idbSetProject(projectId, 'maidata', bundle.maidata));
    }
    if (bundle.bgm) {
        tasks.push(idbSetProject(projectId, 'resource_bgm', bundle.bgm));
    }
    if (bundle.bgImage) {
        tasks.push(idbSetProject(projectId, 'background_image', bundle.bgImage));
    }
    if (bundle.bgVideo) {
        tasks.push(idbSetProject(projectId, 'background_video', bundle.bgVideo));
    }

    await Promise.all(tasks);
}
