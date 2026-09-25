import { idbSetProject } from './indexDB.js';
import { popupWindow } from './helper.js';
import { t } from './i18n.js';

/**
 * 專案檔案讀取與模組化解析器 (Project Loader)
 * 統一 PC 編輯器與 Play 播放器的資料夾 / ZIP 匯入解析與持久化
 */

/**
 * 將 FileList、Array 或 JSZip.files 結構統一展平為 File 陣列
 * @param {FileList|File[]|Object} files 
 * @param {(percent: number, currentName: string) => void} [onProgress]
 * @returns {Promise<File[]>}
 */
export async function normalizeFiles(files, onProgress) {
    const entries = [];
    if (!files) return entries;

    if (typeof files.length === 'number' && typeof files.item === 'function') {
        // FileList
        const total = files.length;
        for (let i = 0; i < total; i++) {
            const f = files.item(i);
            if (f) entries.push(f);
            if (typeof onProgress === 'function') {
                onProgress(Math.round(((i + 1) / total) * 100), f ? f.name : '');
            }
        }
    } else if (Array.isArray(files)) {
        // Array of File
        const total = files.length;
        for (let i = 0; i < total; i++) {
            if (files[i]) entries.push(files[i]);
            if (typeof onProgress === 'function') {
                onProgress(Math.round(((i + 1) / total) * 100), files[i] ? files[i].name : '');
            }
        }
    } else if (typeof files === 'object') {
        // JSZip.files mapping
        const keys = Object.keys(files).filter(name => !files[name].dir);
        const total = keys.length;
        for (let i = 0; i < total; i++) {
            const name = keys[i];
            const zf = files[name];
            if (typeof zf.async === 'function') {
                try {
                    const blob = await zf.async('blob');
                    const baseName = name.replace(/\\/g, '/').split('/').pop();
                    entries.push(new File([blob], baseName, { type: blob.type || '' }));
                } catch (e) {
                    console.warn('[ProjectLoader] 從 ZIP 讀取檔案失敗:', name, e);
                }
            }
            if (typeof onProgress === 'function') {
                onProgress(Math.round(((i + 1) / (total || 1)) * 100), name);
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
 * @param {(percent: number, currentName: string) => void} [onProgress]
 * @returns {Promise<{ maidata: string|null, bgm: File|null, bgImage: File|null, bgVideo: File|null }>}
 */
export async function parseProjectBundle(entries, onProgress) {
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

        if (typeof onProgress === 'function') {
            onProgress(Math.round(((i + 1) / entries.length) * 100), baseName);
        }
    }

    return bundle;
}

/**
 * 將解析後的專案內容持久化寫入 IndexedDB
 * @param {string} projectId 
 * @param {{ maidata?: string|null, bgm?: File|null, bgImage?: File|null, bgVideo?: File|null }} bundle 
 * @param {(percent: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export async function saveProjectToIdb(projectId, bundle, onProgress) {
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

    let completed = 0;
    const total = tasks.length;
    if (total === 0) return;

    await Promise.all(tasks.map(async p => {
        await p;
        completed++;
        if (typeof onProgress === 'function') {
            onProgress(Math.round((completed / total) * 100));
        }
    }));
}

/**
 * 執行帶有鎖定狀態與進度條的匯入任務 (對齊 _init() 準備環境風格)
 * @param {Object} options
 * @param {string} [options.title] - 彈窗標題
 * @param {(step: (percent: number, msg: string) => void) => Promise<any>} options.task - 執行的非同步任務
 * @returns {Promise<any>}
 */
export function runImportModal({ title, task }) {
    return new Promise((resolve, reject) => {
        popupWindow({
            title: title || t('popup.import.title') || '正在匯入專案...',
            content: '',
            buttons: [],
            unclosable: true,
            onOpen: async (ctx) => {
                const step = (p, msg) => {
                    ctx.setProgress(p);
                    ctx.setContent(msg);
                };
                try {
                    const result = await task(step);
                    step(100, t('popup.import.complete') || '完成！正在套用專案...');
                    setTimeout(() => {
                        ctx.close();
                        resolve(result);
                    }, 350);
                } catch (err) {
                    console.error('[Import Task Error]', err);
                    ctx.setProgress(100);
                    if (ctx.elements && ctx.elements.progressBar) {
                        ctx.elements.progressBar.style.background = '#ff5252';
                    }
                    ctx.setContent(`${t('popup.import.failed') || '匯入失敗：'}\n${err.message || err}`);
                    ctx.setButtons([{
                        text: t('popup.close') || '關閉',
                        onClick: () => {
                            ctx.close();
                            reject(err);
                        }
                    }]);
                }
            }
        });
    });
}
